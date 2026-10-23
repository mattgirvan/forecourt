/**
 * Live view server functions: site details, Stripe billing summary and
 * billing portal, support tickets and change requests (supabase/live-support.sql).
 * Customers act through their own token, so RLS limits them to their site;
 * staff (is_team) see every site.
 */
import { createServerFn } from "@tanstack/react-start";
import { PLANS, monthTotalPence, normalizePlan } from "@/lib/catalog";
import { SITE } from "@/lib/site";
import {
  isChangeType,
  isOpenStatus,
  siteDetails,
  validStatus,
  type BillingSummary,
  type ChangeType,
  type SiteDetails,
  type SupportKind,
  type SupportStatus,
} from "@/lib/live-view";
import { actor, sbAdmin, stripeSecret } from "@/lib/server/staff-actor";
import { sendStaffAlert, sendSupportUpdateEmail } from "@/lib/server/journey-email";

const ACCOUNT_URL = `${SITE.url}/account`;

function missingTable(err: { code?: string; message?: string } | null | undefined) {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || /does not exist|could not find the table/i.test(err.message ?? "");
}

const NOT_READY = "Tickets are not switched on yet. Message us at " + SITE.email + " in the meantime.";

type TenantRow = {
  id: number;
  user_id: string;
  name: string | null;
  domain: string | null;
  plan: string | null;
  site_count: number | null;
  stage: string | null;
  status: string | null;
  signed_off_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

async function loadTenant(token: string, tenantId: number) {
  const who = await actor(token);
  const { data, error } = await who.sb
    .from("tenants")
    .select("id, user_id, name, domain, plan, site_count, stage, status, signed_off_at, stripe_customer_id, stripe_subscription_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const t = data as TenantRow | null;
  if (!t || (!who.team && t.user_id !== who.userId)) throw new Error("No dealership on this account.");
  return { who, t };
}

// ------------------------------------------------------------ site details

export const liveSiteDetails = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }): Promise<SiteDetails> => {
    const { who, t } = await loadTenant(data.token, data.tenantId);
    const { data: ev } = await who.sb
      .from("build_events")
      .select("created_at")
      .eq("tenant_id", t.id)
      .eq("kind", "stage")
      .eq("stage", "live")
      .order("created_at", { ascending: true })
      .limit(1);
    const liveStageAt = ((ev ?? [])[0] as { created_at?: string } | undefined)?.created_at ?? null;
    return siteDetails({
      domain: t.domain,
      signedOffAt: t.signed_off_at,
      liveStageAt,
      contractMonths: PLANS[normalizePlan(t.plan)].contractMonths,
    });
  });

// ------------------------------------------------------------ billing (Stripe)

type StripeLike = InstanceType<typeof import("stripe").default>;

async function stripeClient(): Promise<StripeLike | null> {
  const secret = stripeSecret();
  if (!secret) return null;
  const Stripe = (await import("stripe")).default;
  return new Stripe(secret);
}

/** Plan, next payment, card brand and last 4, past due. Read only, from Stripe. */
export const liveBillingSummary = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }): Promise<BillingSummary> => {
    const { t } = await loadTenant(data.token, data.tenantId);
    const plan = normalizePlan(t.plan);
    const base: BillingSummary = {
      connected: false,
      planName: `Forecourt ${PLANS[plan].name}`,
      monthlyPence: monthTotalPence(plan, t.site_count ?? 1),
      nextPaymentAt: null,
      card: null,
      pastDue: false,
      retryAt: null,
      canManage: Boolean(t.stripe_customer_id),
      extraSeats: 0,
      seatPricePence: null,
    };
    const stripe = await stripeClient();
    if (!stripe || !t.stripe_subscription_id) return base;
    try {
      const sub = await stripe.subscriptions.retrieve(t.stripe_subscription_id, {
        expand: ["default_payment_method", "latest_invoice", "customer.invoice_settings.default_payment_method"],
      });
      const seatPrice = extraSeatPriceId();
      const seatItem = seatPrice ? sub.items?.data?.find((i) => i.price?.id === seatPrice) : undefined;
      const item = sub.items?.data?.find((i) => i.price?.id !== seatPrice) ?? sub.items?.data?.[0];
      let seatPricePence: number | null = seatItem?.price?.unit_amount ?? null;
      if (seatPrice && seatPricePence == null) {
        try {
          seatPricePence = (await stripe.prices.retrieve(seatPrice)).unit_amount ?? null;
        } catch {
          seatPricePence = null;
        }
      }
      const unit = item?.price?.unit_amount ?? null;
      const qty = item?.quantity ?? 1;
      // current_period_end lives on the item in newer Stripe API versions.
      const periodEnd =
        (item as unknown as { current_period_end?: number } | undefined)?.current_period_end ??
        (sub as unknown as { current_period_end?: number }).current_period_end ??
        null;
      const pm =
        (typeof sub.default_payment_method === "object" ? sub.default_payment_method : null) ??
        (typeof sub.customer === "object" && !("deleted" in sub.customer && sub.customer.deleted)
          ? ((sub.customer as { invoice_settings?: { default_payment_method?: unknown } }).invoice_settings?.default_payment_method as
              | { card?: { brand?: string; last4?: string } }
              | null
              | undefined)
          : null);
      const card = pm && typeof pm === "object" && "card" in pm && pm.card ? { brand: pm.card.brand ?? "", last4: pm.card.last4 ?? "" } : null;
      const inv = typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
      const failed = Boolean(inv && inv.status === "open" && (inv.attempt_count ?? 0) > 0);
      return {
        ...base,
        connected: true,
        monthlyPence: unit != null ? unit * qty + (seatItem ? (seatItem.price?.unit_amount ?? 0) * (seatItem.quantity ?? 0) : 0) : base.monthlyPence,
        extraSeats: seatItem?.quantity ?? 0,
        seatPricePence,
        nextPaymentAt: sub.status === "trialing" && sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        card,
        pastDue: sub.status === "past_due" || sub.status === "unpaid" || failed,
        retryAt: inv?.next_payment_attempt ? new Date(inv.next_payment_attempt * 1000).toISOString() : null,
      };
    } catch (err) {
      console.error("[billing] summary failed for tenant", t.id, err instanceof Error ? err.message : err);
      return base;
    }
  });

/**
 * Stripe Billing Portal session for "Manage billing". The dealer updates the
 * card, sees invoices and so on in Stripe; we never see card details. Needs
 * the portal configured once in the Stripe dashboard (Settings > Billing > Customer portal).
 */
export const openBillingPortal = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { t } = await loadTenant(data.token, data.tenantId);
    if (!t.stripe_customer_id) throw new Error("No billing account on file yet. Message us and we will sort it.");
    const stripe = await stripeClient();
    if (!stripe) throw new Error("Billing is not connected right now. Message us and we will sort it.");
    const session = await stripe.billingPortal.sessions.create({ customer: t.stripe_customer_id, return_url: ACCOUNT_URL });
    return { url: session.url };
  });

// ------------------------------------------------------------ extra seats

/** Stripe Price for one extra seat a month. Matt creates it and sets this env var; unset means the flow is hidden. */
function extraSeatPriceId(): string | null {
  return (process.env.STRIPE_PRICE_EXTRA_SEAT ?? "").trim() || null;
}

/**
 * Dealer sets how many extra seats they pay for. Adds, updates or removes the
 * extra seat item on their own subscription, prorated on the next invoice.
 */
export const setExtraSeats = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number; quantity: number }) => d)
  .handler(async ({ data }): Promise<{ ok: true; extraSeats: number }> => {
    const { t } = await loadTenant(data.token, data.tenantId);
    const qty = Math.floor(Number(data.quantity));
    if (!Number.isFinite(qty) || qty < 0 || qty > 50) throw new Error("Pick between 0 and 50 extra seats.");
    const price = extraSeatPriceId();
    const stripe = await stripeClient();
    if (!price || !stripe) throw new Error("Extra seats are not switched on yet. Message us and we will add them.");
    if (!t.stripe_subscription_id) throw new Error("No subscription on file yet. Message us and we will sort it.");
    const sub = await stripe.subscriptions.retrieve(t.stripe_subscription_id);
    if (sub.status === "canceled" || sub.status === "incomplete_expired") throw new Error("This plan is not active. Message us.");
    const existing = sub.items.data.find((i) => i.price?.id === price);
    const proration = { proration_behavior: "create_prorations" as const };
    if (existing && qty === 0) await stripe.subscriptionItems.del(existing.id, proration);
    else if (existing) await stripe.subscriptionItems.update(existing.id, { quantity: qty, ...proration });
    else if (qty > 0) await stripe.subscriptionItems.create({ subscription: sub.id, price, quantity: qty, ...proration });
    return { ok: true, extraSeats: qty };
  });

// ------------------------------------------------------------ tickets and change requests

export type SupportMessage = { id: number; from_team: boolean; internal: boolean; author_email: string; body: string; created_at: string };
export type SupportItem = {
  id: number;
  ref: number;
  tenant_id: number;
  kind: SupportKind;
  change_type: ChangeType | null;
  title: string;
  details: string;
  link: string;
  status: SupportStatus;
  needs_reply: boolean;
  created_at: string;
  updated_at: string;
  messages: SupportMessage[];
  tenant_name?: string | null;
};

const ITEM_COLS = "id, ref, tenant_id, kind, change_type, title, details, link, status, needs_reply, created_at, updated_at";

export const listSupport = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }): Promise<{ ready: boolean; items: SupportItem[] }> => {
    const { who, t } = await loadTenant(data.token, data.tenantId);
    const { data: rows, error } = await who.sb.from("support_items").select(ITEM_COLS).eq("tenant_id", t.id).order("updated_at", { ascending: false });
    if (error) {
      if (missingTable(error)) return { ready: false, items: [] };
      throw new Error(error.message);
    }
    const items = (rows ?? []) as Omit<SupportItem, "messages">[];
    const ids = items.map((i) => i.id);
    const byItem: Record<number, SupportMessage[]> = {};
    if (ids.length) {
      // RLS hides internal notes from customers.
      const { data: msgs } = await who.sb
        .from("support_messages")
        .select("id, item_id, from_team, internal, author_email, body, created_at")
        .in("item_id", ids)
        .order("created_at", { ascending: true });
      for (const m of (msgs ?? []) as (SupportMessage & { item_id: number })[]) (byItem[m.item_id] ??= []).push(m);
    }
    return { ready: true, items: items.map((i) => ({ ...i, messages: byItem[i.id] ?? [] })) };
  });

export const createSupportItem = createServerFn({ method: "POST" })
  .validator(
    (d: { token: string; tenantId: number; kind: SupportKind; title: string; details: string; changeType?: string; link?: string }) => d,
  )
  .handler(async ({ data }) => {
    const { who, t } = await loadTenant(data.token, data.tenantId);
    const title = data.title.trim().slice(0, 200);
    const details = data.details.trim().slice(0, 10000);
    if (!title) throw new Error(data.kind === "ticket" ? "Add a subject first." : "Add a short title first.");
    if (!details) throw new Error("Tell us a little more first.");
    if (data.kind !== "ticket" && data.kind !== "change") throw new Error("Unknown request.");
    if (data.kind === "change" && !isChangeType(data.changeType)) throw new Error("Pick what kind of change.");
    const { data: row, error } = await who.sb
      .from("support_items")
      .insert({
        tenant_id: t.id,
        kind: data.kind,
        change_type: data.kind === "change" ? data.changeType : null,
        title,
        details,
        link: (data.link ?? "").trim().slice(0, 500),
        status: data.kind === "ticket" ? "open" : "submitted",
        needs_reply: !who.team,
        created_by: who.email ?? "",
      })
      .select("id, ref")
      .single();
    if (error) throw new Error(missingTable(error) ? NOT_READY : error.message);
    const item = row as { id: number; ref: number };
    const { error: mErr } = await who.sb
      .from("support_messages")
      .insert({ item_id: item.id, tenant_id: t.id, from_team: who.team, internal: false, author_email: who.email ?? "", body: details });
    if (mErr) throw new Error(mErr.message);
    if (!who.team) {
      const what = data.kind === "ticket" ? "New ticket" : "New change request";
      await sendStaffAlert({
        tenantId: t.id,
        title: `${what} from ${t.name || "a dealer"}: ${title}`,
        body: details.slice(0, 600),
        dedupeKey: `support-new:${item.id}`,
      });
    }
    return { ok: true, id: item.id };
  });

async function loadItem(sb: Awaited<ReturnType<typeof actor>>["sb"], itemId: number) {
  const { data, error } = await sb.from("support_items").select(`${ITEM_COLS}`).eq("id", itemId).maybeSingle();
  if (error) throw new Error(missingTable(error) ? NOT_READY : error.message);
  if (!data) throw new Error("That ticket is not on this account.");
  return data as Omit<SupportItem, "messages">;
}

/** Add a message. A dealer reply reopens a resolved ticket (database trigger). Staff can post internal notes. */
export const replySupport = createServerFn({ method: "POST" })
  .validator((d: { token: string; itemId: number; body: string; internal?: boolean }) => d)
  .handler(async ({ data }) => {
    const who = await actor(data.token);
    const item = await loadItem(who.sb, data.itemId);
    const body = data.body.trim().slice(0, 10000);
    if (!body) throw new Error("Write a reply first.");
    const internal = Boolean(who.team && data.internal);
    const { data: msg, error } = await who.sb
      .from("support_messages")
      .insert({ item_id: item.id, tenant_id: item.tenant_id, from_team: who.team, internal, author_email: who.email ?? "", body })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const id = (msg as { id: number }).id;
    if (!who.team) {
      await sendStaffAlert({ tenantId: item.tenant_id, title: `Reply on ${item.title}`, body: body.slice(0, 600), dedupeKey: `support-reply:${id}` });
    } else if (!internal) {
      await sendSupportUpdateEmail({ tenantId: item.tenant_id, itemId: item.id, title: item.title, kind: item.kind, line: "We have replied.", dedupe: `support-reply:${id}` });
    }
    return { ok: true };
  });

/** Staff only: change status. Emails the dealer (deduped per item and status). */
export const setSupportStatus = createServerFn({ method: "POST" })
  .validator((d: { token: string; itemId: number; status: string }) => d)
  .handler(async ({ data }) => {
    const who = await actor(data.token);
    if (!who.team) throw new Error("Only the Forecourt team changes a status.");
    const item = await loadItem(who.sb, data.itemId);
    if (!validStatus(item.kind, data.status)) throw new Error("Unknown status.");
    if (item.status === data.status) return { ok: true };
    const { error } = await (sbAdmin() ?? who.sb)
      .from("support_items")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) throw new Error(error.message);
    const LINE: Record<SupportStatus, string> = {
      open: "It is open again.",
      in_progress: "We are working on it.",
      resolved: "We have marked it resolved. Reply any time if it is not sorted.",
      submitted: "We have it.",
      done: "It is done.",
      declined: "We are not going ahead with this one. We have left a note on it.",
    };
    await sendSupportUpdateEmail({
      tenantId: item.tenant_id,
      itemId: item.id,
      title: item.title,
      kind: item.kind,
      line: LINE[data.status],
      dedupe: `support-status:${item.id}:${data.status}:${new Date().toISOString().slice(0, 13)}`,
    });
    return { ok: true };
  });

/** Staff only: every ticket and change request across sites, oldest update first. */
export const listSupportQueue = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }): Promise<{ ready: boolean; items: SupportItem[] }> => {
    const who = await actor(data.token);
    if (!who.team) throw new Error("Office is for the Forecourt team.");
    const { data: rows, error } = await who.sb.from("support_items").select(`${ITEM_COLS}, tenants(name)`).order("updated_at", { ascending: true });
    if (error) {
      if (missingTable(error)) return { ready: false, items: [] };
      throw new Error(error.message);
    }
    return {
      ready: true,
      items: ((rows ?? []) as (Omit<SupportItem, "messages"> & { tenants?: { name?: string | null } | null })[]).map(({ tenants, ...i }) => ({
        ...i,
        tenant_name: tenants?.name ?? null,
        messages: [],
      })),
    };
  });

export { isOpenStatus };
