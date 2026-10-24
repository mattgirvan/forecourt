/**
 * Group build PR 3: keep a Group or Franchise subscription in step with its live sites.
 *
 * Called only when a site changes state (setting up to live, live to archived).
 * It reads the subscription, works out the one line that should change, and
 * makes at most one update call with an idempotency key. If nothing differs it
 * does nothing, so re-running the same event is safe. Site plans and
 * subscriptions it can't recognise are left alone.
 */
import { tenantEnded, subscriptionSetToCancel } from "./billing-start.ts";
import {
  FRANCHISE_BASE_PENCE,
  GROUP_SITE_PENCE,
  franchiseExtraSites,
  groupQuantity,
  liveSiteCount,
  paidSlotsThisPeriod,
  prorationFor,
  type BillingSite,
  type LineKey,
  type SiteStatus,
} from "../site-billing.ts";
import { FRANCHISE_EXTRA_SITE_PENCE, type PlanId } from "../catalog.ts";

export type SubItemLike = {
  id: string;
  quantity?: number | null;
  metadata?: Record<string, string> | null;
  current_period_start?: number | null;
  price?: { unit_amount?: number | null; product?: string | { id: string } | null; recurring?: unknown } | null;
};
export type SiteSubLike = {
  id: string;
  status: string;
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
  items: { data: SubItemLike[] };
};
export type ItemChange =
  | { id: string; quantity: number }
  | { id: string; deleted: true }
  | {
      price_data: { currency: "gbp"; unit_amount: number; recurring: { interval: "month" }; product: string };
      quantity: number;
      metadata: { forecourt_line: LineKey };
    };
export type SiteSubsLike = {
  retrieve: (id: string) => Promise<SiteSubLike>;
  update: (
    id: string,
    params: { items: ItemChange[]; proration_behavior: "create_prorations" | "none" },
    options: { idempotencyKey: string },
  ) => Promise<unknown>;
};

export type SiteEvent = { code: string; from: SiteStatus | null; to: SiteStatus };

export type SiteSyncResult =
  | { changed: true; line: LineKey; from: number; to: number; proration: "create_prorations" | "none"; idempotencyKey: string }
  | {
      changed: false;
      reason:
        | "no_state_change"
        | "plan_not_per_site"
        | "no_subscription"
        | "stripe_not_configured"
        | "tenant_ended"
        | "subscription_ended"
        | "set_to_cancel"
        | "unrecognised_items"
        | "already_in_step"
        | "stripe_error";
      detail?: string;
    };

const ENDED_SUBS = ["canceled", "incomplete_expired"];

function lineOf(item: SubItemLike): LineKey | null {
  const tag = item.metadata?.forecourt_line;
  if (tag === "group_site" || tag === "franchise_base" || tag === "franchise_extra") return tag;
  return null;
}

function productId(item: SubItemLike): string | null {
  const p = item.price?.product;
  if (!p) return null;
  return typeof p === "string" ? p : p.id;
}

/** Legacy subscriptions have no tags: match by the plan's unit price, and only when exactly one item fits. */
function findItem(items: SubItemLike[], key: LineKey, unitPence: number): SubItemLike | null | "ambiguous" {
  const tagged = items.filter((i) => lineOf(i) === key);
  if (tagged.length === 1) return tagged[0];
  if (tagged.length > 1) return "ambiguous";
  if (key === "franchise_extra") return null;
  const byPrice = items.filter((i) => !lineOf(i) && i.price?.unit_amount === unitPence && i.price?.recurring);
  if (byPrice.length === 1) return byPrice[0];
  return byPrice.length ? "ambiguous" : null;
}

function periodStartIso(sub: SiteSubLike): string | null {
  const t = sub.current_period_start ?? sub.items.data[0]?.current_period_start ?? null;
  return t ? new Date(t * 1000).toISOString() : null;
}

export async function syncSiteBilling(
  deps: { subscriptions: SiteSubsLike | null },
  input: {
    tenantId: number;
    plan: PlanId;
    tenantStatus?: string | null;
    subscriptionId: string | null | undefined;
    /** Every site on the account, already showing the new state. */
    sites: BillingSite[];
    event: SiteEvent;
  },
): Promise<SiteSyncResult> {
  const { event } = input;
  if (event.from === event.to) return { changed: false, reason: "no_state_change" };
  if (input.plan !== "group" && input.plan !== "franchise") return { changed: false, reason: "plan_not_per_site" };
  if (tenantEnded(input.tenantStatus)) return { changed: false, reason: "tenant_ended" };
  if (!input.subscriptionId) return { changed: false, reason: "no_subscription" };
  if (!deps.subscriptions) return { changed: false, reason: "stripe_not_configured" };
  try {
    const sub = await deps.subscriptions.retrieve(input.subscriptionId);
    if (ENDED_SUBS.includes(sub.status)) return { changed: false, reason: "subscription_ended" };
    if (subscriptionSetToCancel(sub)) return { changed: false, reason: "set_to_cancel" };
    const items = sub.items?.data ?? [];
    const live = liveSiteCount(input.sites);
    const paid = paidSlotsThisPeriod(input.sites, periodStartIso(sub));
    const trialing = sub.status === "trialing";

    let line: LineKey;
    let from: number;
    let to: number;
    let paidQty: number;
    let change: ItemChange;
    if (input.plan === "group") {
      const item = findItem(items, "group_site", GROUP_SITE_PENCE);
      if (!item || item === "ambiguous") return { changed: false, reason: "unrecognised_items" };
      line = "group_site";
      from = item.quantity ?? 1;
      to = groupQuantity(live);
      paidQty = groupQuantity(paid);
      change = { id: item.id, quantity: to };
    } else {
      const base = findItem(items, "franchise_base", FRANCHISE_BASE_PENCE);
      if (!base || base === "ambiguous") return { changed: false, reason: "unrecognised_items" };
      const extra = findItem(items, "franchise_extra", FRANCHISE_EXTRA_SITE_PENCE);
      if (extra === "ambiguous") return { changed: false, reason: "unrecognised_items" };
      line = "franchise_extra";
      from = extra ? (extra.quantity ?? 0) : 0;
      to = franchiseExtraSites(live);
      paidQty = franchiseExtraSites(paid);
      if (extra) change = to > 0 ? { id: extra.id, quantity: to } : { id: extra.id, deleted: true };
      else {
        const product = productId(base);
        if (!product) return { changed: false, reason: "unrecognised_items" };
        change = {
          price_data: { currency: "gbp", unit_amount: FRANCHISE_EXTRA_SITE_PENCE, recurring: { interval: "month" }, product },
          quantity: to,
          metadata: { forecourt_line: "franchise_extra" },
        };
      }
    }
    if (from === to) return { changed: false, reason: "already_in_step" };
    const proration = trialing ? "none" : prorationFor(from, to, paidQty);
    const idempotencyKey = `site-billing:${input.tenantId}:${event.code}:${event.to}:${line}:${from}-${to}`;
    await deps.subscriptions.update(input.subscriptionId, { items: [change], proration_behavior: proration }, { idempotencyKey });
    return { changed: true, line, from, to, proration, idempotencyKey };
  } catch (err) {
    return { changed: false, reason: "stripe_error", detail: err instanceof Error ? err.message : String(err) };
  }
}

export function siteSyncMessage(r: SiteSyncResult): string {
  if (r.changed) {
    const what = r.line === "group_site" ? "Per site quantity" : "Extra site quantity";
    const how = r.proration === "none" ? "no proration, from the next period" : "prorated from today";
    return `${what} changed from ${r.from} to ${r.to} (${how}).`;
  }
  const why: Record<string, string> = {
    no_state_change: "Site state did not change, billing left alone.",
    plan_not_per_site: "Site plan, billing does not track sites.",
    no_subscription: "No subscription on file, nothing changed.",
    stripe_not_configured: "Stripe is not set up here, nothing changed.",
    tenant_ended: "Package ended, nothing changed.",
    subscription_ended: "Subscription has ended, nothing changed.",
    set_to_cancel: "Subscription is set to cancel, nothing changed. Check with the customer.",
    unrecognised_items: "Could not match the subscription lines. Nothing changed, staff to check.",
    already_in_step: "Billing already matches the live sites.",
    stripe_error: "Stripe update failed, nothing changed. Staff to retry.",
  };
  return why[r.reason] + (r.detail ? ` ${r.detail}` : "");
}

export type SiteBillingMode = "live" | "dry_run";

/** Only the exact value "on" lets site billing change Stripe. */
export function siteBillingModeFrom(value: string | null | undefined): SiteBillingMode {
  return value === "on" ? "live" : "dry_run";
}

/** Reads still go to Stripe; the update is only recorded in `sent`. */
export function dryRunSubs(real: SiteSubsLike | null, sent: ItemChange[][]): SiteSubsLike | null {
  if (!real) return null;
  return {
    retrieve: (id) => real.retrieve(id),
    update: async (_id, params) => {
      sent.push(params.items);
      return {};
    },
  };
}

export function modeMessage(mode: SiteBillingMode, result: SiteSyncResult, totalPence?: number): string {
  const msg = siteSyncMessage(result);
  if (mode !== "dry_run" || !result.changed) return msg;
  const unit = result.line === "group_site" ? "£249" : "£100";
  const what = result.line === "group_site" ? `${result.to} ${result.to === 1 ? "site" : "sites"}` : `${result.to} extra ${result.to === 1 ? "site" : "sites"}`;
  const when = result.proration === "none" ? "from the next billing period" : "from today";
  const total = totalPence != null ? `£${(totalPence / 100).toLocaleString("en-GB")}` : null;
  return `Dry run. Stripe is not changed. This would bill ${what} at ${unit}${total ? `, so ${total} a month ${when}` : ` ${when}`}.`;
}
