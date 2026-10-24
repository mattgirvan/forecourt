/**
 * Group build PR 3: server side of per-site billing.
 *
 * changeSiteState is the one code path that moves a site between setting up,
 * live and archived and then keeps the subscription in step. Office Sites calls
 * it through setSiteState (Go live, Archive). trueUpSiteBilling runs inside
 * startMonthlyForTenant so the first Group or Franchise bill matches live sites.
 *
 * Stripe is only ever changed when SITE_BILLING_SYNC is "on". Anything else is a
 * dry run: the site still changes state, the subscription is read, and the
 * update that would be sent is written to the timeline instead.
 *
 * Order of work, so a retry can never double bill:
 * 1. Read the site. If it is already in the target state, stop (no Stripe call).
 * 2. Claim the event in site_billing_events (unique event_key). If the claim
 *    already exists, a previous attempt got this far: re-run the sync, which is
 *    a no-op when Stripe already matches.
 * 3. Update tenant_sites (status, live_at or archived_at).
 * 4. syncSiteBilling: at most one Stripe update with an idempotency key.
 * 5. Record the result on the event row and the internal timeline.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { normalizePlan } from "@/lib/catalog";
import { actor, sbAdmin, siteBillingSyncFlag, stripeSecret } from "@/lib/server/staff-actor";
import { parseBillingSites, periodEndFrom, siteBreakdown, type BillingSite, type SiteStatus } from "@/lib/site-billing";
import { siteSyncMessage, syncSiteBilling, type SiteSubsLike, type SiteSyncResult } from "@/lib/server/site-billing-sync";
import { missingTable } from "@/lib/server/payment-issues";
import {
  dryRunSubs,
  modeMessage as withMode,
  siteBillingModeFrom,
  type ItemChange,
  type SiteBillingMode,
} from "@/lib/server/site-billing-sync";

export type { SiteBillingMode };
export function siteBillingMode(): SiteBillingMode {
  return siteBillingModeFrom(siteBillingSyncFlag());
}

async function pickSubs(deps: { subscriptions?: SiteSubsLike | null; mode?: SiteBillingMode }, sent: ItemChange[][]) {
  const mode = deps.mode ?? siteBillingMode();
  let real: SiteSubsLike | null = null;
  try {
    real = deps.subscriptions !== undefined ? deps.subscriptions : await stripeSubs();
  } catch {
    real = null;
  }
  return { mode, subscriptions: mode === "live" ? real : dryRunSubs(real, sent) };
}

type SiteRow = { code: string; name: string; status: SiteStatus; live_at: string | null; archived_at: string | null; billed_through?: string | null };

/** tenant_sites rows, with billed_through when supabase/site-billed-through.sql has been run. */
async function readSites(sb: SupabaseClient, tenantId: number) {
  const full = await sb.from("tenant_sites").select("code, name, status, live_at, archived_at, billed_through").eq("tenant_id", tenantId);
  if (!full.error) return full;
  return sb.from("tenant_sites").select("code, name, status, live_at, archived_at").eq("tenant_id", tenantId);
}

function toBilling(r: SiteRow): BillingSite {
  return { code: r.code, name: r.name, status: r.status, liveAt: r.live_at, archivedAt: r.archived_at, billedThrough: r.billed_through ?? null };
}

async function stripeSubs(): Promise<SiteSubsLike | null> {
  const secret = stripeSecret();
  if (!secret) return null;
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(secret);
  return {
    retrieve: (id) => stripe.subscriptions.retrieve(id) as unknown as ReturnType<SiteSubsLike["retrieve"]>,
    update: (id, params, options) => stripe.subscriptions.update(id, params as never, options),
  };
}

export async function changeSiteState(
  sb: SupabaseClient,
  input: { tenantId: number; code: string; to: SiteStatus; actorEmail: string },
  deps: { subscriptions?: SiteSubsLike | null; now?: () => Date; mode?: SiteBillingMode } = {},
): Promise<{ result: SiteSyncResult; message: string; mode?: SiteBillingMode }> {
  const now = (deps.now ?? (() => new Date()))().toISOString();
  const { data: t } = await sb.from("tenants").select("id, plan, status, stripe_subscription_id").eq("id", input.tenantId).maybeSingle();
  const { data: rows, error } = await readSites(sb, input.tenantId);
  if (error || !t) return { result: { changed: false, reason: "no_subscription", detail: error?.message }, message: "Could not read the account." };
  const all = (rows ?? []) as SiteRow[];
  const site = all.find((r) => r.code === input.code);
  if (!site) return { result: { changed: false, reason: "no_state_change", detail: "unknown site" }, message: "Unknown site." };
  if (site.status === "archived" && input.to !== "archived") {
    return { result: { changed: false, reason: "no_state_change", detail: "archived sites stay archived" }, message: "Archived sites are not brought back here." };
  }
  const from = site.status;
  if (from === input.to) {
    const result: SiteSyncResult = { changed: false, reason: "no_state_change" };
    return { result, message: siteSyncMessage(result) };
  }
  const eventKey = `${input.tenantId}:${input.code}:${from}:${input.to}:${site.live_at ?? "never"}`;
  await sb.from("site_billing_events").upsert(
    { tenant_id: input.tenantId, site_code: input.code, from_status: from, to_status: input.to, event_key: eventKey, actor_email: input.actorEmail },
    { onConflict: "event_key", ignoreDuplicates: true },
  );
  const patch: Partial<SiteRow> & { updated_at: string } = { status: input.to, updated_at: now };
  if (input.to === "live") patch.live_at = now;
  if (input.to === "archived") patch.archived_at = now;
  await sb.from("tenant_sites").update(patch).eq("tenant_id", input.tenantId).eq("code", input.code).eq("status", from);
  const sites = all.map((r) => (r.code === input.code ? toBilling({ ...r, ...patch } as SiteRow) : toBilling(r)));
  const sent: ItemChange[][] = [];
  const { mode, subscriptions } = await pickSubs(deps, sent);
  const result = await syncSiteBilling(
    { subscriptions },
    {
      tenantId: input.tenantId,
      plan: normalizePlan(t.plan as string),
      tenantStatus: (t.status as string | null) ?? null,
      subscriptionId: (t.stripe_subscription_id as string | null) ?? null,
      sites,
      event: { code: input.code, from, to: input.to },
    },
  );
  // A part month was really charged for this site: remember it, so a same period archive and restore never charges again.
  if (mode === "live" && result.changed && result.proration === "create_prorations" && input.to === "live" && result.periodEnd) {
    try {
      await sb.from("tenant_sites").update({ billed_through: result.periodEnd }).eq("tenant_id", input.tenantId).eq("code", input.code);
    } catch {
      /* column not added yet: best effort */
    }
  }
  const message = withMode(mode, result, siteBreakdown(normalizePlan(t.plan as string), sites).total);
  try {
    await sb.from("site_billing_events").update({ result: result.changed ? "changed" : result.reason, detail: message }).eq("event_key", eventKey);
    await sb.from("build_events").insert({
      tenant_id: input.tenantId,
      kind: "note",
      title: `Site ${input.code} ${input.to === "live" ? "went live" : input.to === "archived" ? "archived" : "set up"}`,
      body: message,
      visibility: "internal",
      actor_email: input.actorEmail,
    });
  } catch {
    /* best effort */
  }
  return { result, message, mode };
}

/**
 * Before the first Group or Franchise bill: bring the quantity in line with the
 * live sites (Group minimum 2). The subscription is still trialing, so this
 * never prorates. Accounts with no tenant_sites rows are left exactly as they are.
 */
export async function trueUpSiteBilling(
  sb: SupabaseClient,
  tenantId: number,
  actorEmail: string,
  deps: { subscriptions?: SiteSubsLike | null; mode?: SiteBillingMode } = {},
): Promise<{ result: SiteSyncResult | null; message: string | null }> {
  const { data: t } = await sb.from("tenants").select("id, plan, status, stripe_subscription_id").eq("id", tenantId).maybeSingle();
  const plan = normalizePlan((t?.plan as string) ?? "site");
  if (!t || (plan !== "group" && plan !== "franchise")) return { result: null, message: null };
  const { data: rows, error } = await readSites(sb, tenantId);
  if (error || !rows?.length) return { result: null, message: null };
  const sent: ItemChange[][] = [];
  const { mode, subscriptions } = await pickSubs(deps, sent);
  const result = await syncSiteBilling(
    { subscriptions },
    {
      tenantId,
      plan,
      tenantStatus: (t.status as string | null) ?? null,
      subscriptionId: (t.stripe_subscription_id as string | null) ?? null,
      sites: (rows as SiteRow[]).map(toBilling),
      event: { code: "true-up", from: null, to: "live" },
    },
  );
  const message = withMode(mode, result);
  try {
    await sb.from("build_events").insert({
      tenant_id: tenantId,
      kind: "note",
      title: "Site count checked before the first bill",
      body: message,
      visibility: "internal",
      actor_email: actorEmail,
    });
  } catch {
    /* best effort */
  }
  return { result, message };
}

/** Office Sites: Go live or Archive one site. Forecourt team only. */
export const setSiteState = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number; code: string; to: "live" | "archived" }) => d)
  .handler(async ({ data }) => {
    const { team, email } = await actor(data.token);
    if (!team) throw new Error("Office is for the Forecourt team.");
    if (data.to !== "live" && data.to !== "archived") throw new Error("Sites can only go live or be archived here.");
    const admin = sbAdmin();
    if (!admin) throw new Error("Site changes need the server key, which is not set here.");
    const { message, mode } = await changeSiteState(admin, { tenantId: data.tenantId, code: data.code, to: data.to, actorEmail: email ?? "office" });
    return { message, mode: mode ?? siteBillingMode() };
  });

/** Office, read only: each Group and Franchise account, its sites and what they are billed. */
export const listOfficeSiteBilling = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { sb: userSb, team } = await actor(data.token);
    if (!team) throw new Error("Office is for the Forecourt team.");
    // tenant_sites is service role only; without it, fall back to tenants.sites.
    const admin = sbAdmin();
    const sb = admin ?? userSb;
    const { data: tenants, error } = await sb
      .from("tenants")
      .select("id, name, plan, status, stage, sites, stripe_subscription_id")
      .in("plan", ["group", "franchise"])
      .is("archived_at", null)
      .order("name");
    if (error) throw new Error(error.message);
    const ids = (tenants ?? []).map((t) => t.id as number);
    let siteRows: (SiteRow & { tenant_id: number })[] = [];
    let fromTable = false;
    if (ids.length && admin) {
      const res = await sb.from("tenant_sites").select("tenant_id, code, name, status, live_at, archived_at").in("tenant_id", ids);
      if (!res.error) {
        siteRows = (res.data ?? []) as typeof siteRows;
        fromTable = true;
      } else if (!missingTable(res.error)) throw new Error(res.error.message);
    }
    const mode = siteBillingMode();
    // Period end from the go live "Monthly billing started" entry; no Stripe call.
    const anchors = new Map<number, string>();
    if (ids.length) {
      const ev = await sb.from("build_events").select("tenant_id, created_at").in("tenant_id", ids).eq("title", "Monthly billing started").order("created_at", { ascending: true });
      for (const e of (ev.data ?? []) as { tenant_id: number; created_at: string }[]) if (!anchors.has(e.tenant_id)) anchors.set(e.tenant_id, e.created_at);
    }
    return (tenants ?? []).map((t) => {
      const plan = normalizePlan(t.plan as string);
      const own = siteRows.filter((r) => r.tenant_id === t.id);
      const sites = own.length ? own.map(toBilling) : parseBillingSites(t.sites);
      return {
        id: t.id as number,
        name: (t.name as string) || "Unnamed",
        plan,
        status: (t.status as string) || "",
        hasSubscription: Boolean(t.stripe_subscription_id),
        mode,
        canChange: own.length > 0,
        periodEnd: periodEndFrom(anchors.get(t.id as number) ?? null),
        billingSites: sites,
        source: own.length ? "tenant_sites" : fromTable ? "tenants.sites (no site rows yet)" : "tenants.sites",
        ...siteBreakdown(plan, sites),
      };
    });
  });
