/**
 * Staff "Resume order": server side. The rules live in resume-order.ts.
 *
 * resumePreview  reads Stripe live (GET only) for the confirm panel.
 * resumeOrder    puts a refunded or cancelled file back. Safe to repeat.
 * sendBalanceLink creates a Stripe Checkout link for exactly the balance owed
 *                and emails it through the journey engine. Never charges.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { BUILD_STAGES, stageMeta } from "@/lib/build";
import { MONTHLY_START_LATEST_DAYS, gbpPence, monthTotalPence, normalizePlan } from "@/lib/catalog";
import { SITE } from "@/lib/site";
import { statusLabel } from "@/lib/team";
import { actor, sbAdmin, stripeSecret } from "@/lib/server/staff-actor";
import { emailOutcomeMessage, sendBalanceLinkEmail } from "@/lib/server/journey-email";
import { subscriptionEnded } from "@/lib/server/checkout-guard";
import { flaggedDuplicateSessions } from "@/lib/server/refund-target";
import {
  BALANCE_LINK_TITLE,
  ENDED_EVENT_TITLES,
  OWNER_ONLY_MESSAGE,
  balanceOwed,
  executeResume,
  latestStartFrom,
  gbp,
  resumeDecision,
  resumeStage,
  resumeStatus,
  sessionsThatCount,
  subscriptionPlan,
  type Balance,
  type PaymentFacts,
  type ResumeSession,
  type SkippedSession,
  type StagePick,
  type SubscriptionNow,
  type SubscriptionPlan,
} from "@/lib/server/resume-order";

type StripeClient = InstanceType<typeof import("stripe").default>;

const STAGE_IDS = BUILD_STAGES.map((s) => s.id) as readonly string[];
const SESSION_RE = /\b(cs_(?:live|test)_[A-Za-z0-9]+)\b/g;
const LINK_TITLE = BALANCE_LINK_TITLE;

type TenantRow = {
  id: number;
  name: string | null;
  email: string | null;
  status: string | null;
  stage: string | null;
  plan: string | null;
  billing: string | null;
  site_count?: number | null;
  signed_off_at?: string | null;
  cancelled_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
};

type OrderRow = {
  id: number;
  status: string | null;
  amount_pence: number | null;
  stripe_session_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
};

type EventRow = { id: number; kind: string; stage: string | null; title: string | null; body: string | null; created_at: string };

export type ResumeFacts = {
  tenant: TenantRow;
  orders: OrderRow[];
  events: EventRow[];
  sessions: ResumeSession[];
  sessionPaid: Record<string, boolean>;
  /** Sessions whose card payment was refunded in full. */
  sessionFullyRefunded: Record<string, boolean>;
  skipped: SkippedSession[];
  balance: Balance;
  refunds: { id: string; amount: string; date: string }[];
  stagePick: StagePick;
  newStatus: "live" | "trial" | "subscribed";
  plan: SubscriptionPlan;
  monthlyLabel: string;
  customerId: string | null;
  subscription: SubscriptionNow | null;
  /** The old subscription's product and card, reused by a new subscription. */
  productId: string | null;
  paymentMethod: string | null;
  /** Latest start for a new subscription, if one is set up now. */
  latestStart: { unix: number; label: string };
  warnings: string[];
};

function london(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}

function refOf(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  const id = (v as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

/** Card money on one payment intent: what was captured and what went back. */
async function factsForIntent(stripe: StripeClient, paymentIntent: string): Promise<PaymentFacts> {
  const pi = await stripe.paymentIntents.retrieve(paymentIntent, { expand: ["latest_charge"] });
  const charge = pi.latest_charge && typeof pi.latest_charge !== "string" ? pi.latest_charge : null;
  const paidPence = pi.status === "succeeded" ? (charge?.amount_captured ?? pi.amount_received ?? 0) : 0;
  const refunds = (await stripe.refunds.list({ payment_intent: paymentIntent, limit: 20 })).data
    .filter((r) => r.status === "succeeded" || r.status === "pending")
    .map((r) => ({ id: r.id, amountPence: r.amount, created: r.created }));
  const listed = refunds.reduce((n, r) => n + r.amountPence, 0);
  return { paidPence, refundedPence: Math.max(charge?.amount_refunded ?? 0, listed), refunds };
}

/** Everything Resume needs, read live. GET calls to Stripe only. */
async function loadResumeFacts(admin: SupabaseClient, stripe: StripeClient | null, tenantId: number): Promise<ResumeFacts> {
  const { data: t, error } = await admin
    .from("tenants")
    .select(
      "id, name, email, status, stage, plan, billing, site_count, signed_off_at, cancelled_at, stripe_customer_id, stripe_subscription_id",
    )
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!t) throw new Error("No dealership on this file.");
  const tenant = t as TenantRow;
  const { data: orderRows } = await admin
    .from("orders")
    .select("id, status, amount_pence, stripe_session_id, stripe_subscription_id, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20);
  const orders = (orderRows ?? []) as OrderRow[];
  const { data: eventRows } = await admin
    .from("build_events")
    .select("id, kind, stage, title, body, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  const events = (eventRows ?? []) as EventRow[];

  const warnings: string[] = [];
  const plan = normalizePlan(tenant.plan);
  const monthlyLabel = gbpPence(monthTotalPence(plan, tenant.site_count ?? 1));
  let storedSub = tenant.stripe_subscription_id || null;
  for (const o of orders) if (!storedSub && o.stripe_subscription_id) storedSub = o.stripe_subscription_id;
  let customerId = tenant.stripe_customer_id || null;

  // Sessions: every order's checkout, plus any balance links we sent.
  const ids = new Set<string>();
  for (const o of orders) if (o.stripe_session_id?.startsWith("cs_")) ids.add(o.stripe_session_id);
  for (const e of events) {
    if (e.kind !== "billing" || e.title !== LINK_TITLE) continue;
    for (const m of (e.body ?? "").matchAll(SESSION_RE)) ids.add(m[1]!);
  }

  let stripeGaps = !stripe;
  const sessions: ResumeSession[] = [];
  const sessionPaid: Record<string, boolean> = {};
  const facts: Record<string, PaymentFacts | undefined> = {};
  const intents: Record<string, string | null> = {};
  if (stripe) {
    for (const id of ids) {
      try {
        const s = await stripe.checkout.sessions.retrieve(id);
        if (!customerId) customerId = refOf(s.customer);
        sessionPaid[s.id] = s.payment_status === "paid";
        sessions.push({
          id: s.id,
          mode: s.mode,
          payment_status: s.payment_status,
          amount_total: s.amount_total,
          subscription: refOf(s.subscription),
          created: s.created,
          kind: s.metadata?.kind ?? null,
        });
        let pi = refOf(s.payment_intent);
        if (!pi && s.mode === "subscription" && s.payment_status === "paid") {
          const invoice = refOf(s.invoice);
          if (invoice) {
            const payments = (await stripe.invoicePayments.list({ invoice, limit: 10 })).data;
            const paid = payments.find((p) => p.status === "paid" && p.payment?.payment_intent);
            pi = refOf(paid?.payment?.payment_intent);
          }
        }
        intents[s.id] = pi;
      } catch (err) {
        stripeGaps = true;
        warnings.push(`Could not read Stripe session ${id.slice(0, 16)}… (${err instanceof Error ? err.message : "error"}).`);
      }
    }
  } else {
    warnings.push("Stripe is not connected on the server, so amounts could not be checked.");
  }

  // Duplicates are the checkouts named in a "Second payment" flag. A package
  // that was refunded or cancelled before the newest purchase is over.
  const endedAt: number[] = [];
  for (const e of events) {
    if (e.kind === "billing" && (ENDED_EVENT_TITLES as readonly string[]).includes(e.title ?? "")) endedAt.push(Math.floor(Date.parse(e.created_at) / 1000));
  }
  if (tenant.cancelled_at) endedAt.push(Math.floor(Date.parse(tenant.cancelled_at) / 1000));
  const { counted, skipped } = sessionsThatCount(sessions, { duplicateSessionIds: flaggedDuplicateSessions(events, orders), endedAt });
  const refunds: ResumeFacts["refunds"] = [];
  if (stripe) {
    for (const s of counted) {
      const pi = intents[s.id];
      if (!pi) {
        if ((s.amount_total ?? 0) > 0) warnings.push(`No card payment found for session ${s.id.slice(0, 16)}…, so its refunds could not be checked.`);
        continue;
      }
      try {
        const f = await factsForIntent(stripe, pi);
        facts[s.id] = f;
        for (const r of f.refunds) refunds.push({ id: r.id, amount: gbp(r.amountPence), date: london(r.created) });
      } catch (err) {
        stripeGaps = true;
        warnings.push(`Could not read the payment for ${s.id.slice(0, 16)}… (${err instanceof Error ? err.message : "error"}).`);
      }
    }
  }
  const latestOrder = orders[0] ?? null;
  const balance = balanceOwed({ counted, facts, orderAmountPence: latestOrder?.amount_pence ?? null, unknown: stripeGaps });
  const sessionFullyRefunded: Record<string, boolean> = {};
  for (const [id, f] of Object.entries(facts)) if (f && f.paidPence > 0 && f.refundedPence >= f.paidPence) sessionFullyRefunded[id] = true;

  let subscription: SubscriptionNow | null = null;
  let lookupFailed = false;
  let productId: string | null = null;
  let paymentMethod: string | null = null;
  if (storedSub && stripe) {
    try {
      const sub = await stripe.subscriptions.retrieve(storedSub);
      const item = sub.items?.data?.[0];
      subscription = {
        id: sub.id,
        status: sub.status,
        cancel_at_period_end: sub.cancel_at_period_end,
        cancel_at: sub.cancel_at,
        trial_end: sub.trial_end,
        current_period_end: (item as { current_period_end?: number } | undefined)?.current_period_end ?? null,
      };
      productId = refOf(item?.price?.product);
      paymentMethod = refOf(sub.default_payment_method);
      if (!customerId) customerId = refOf(sub.customer);
    } catch (err) {
      const e = err as { statusCode?: number; code?: string };
      if (!(e?.statusCode === 404 || e?.code === "resource_missing")) lookupFailed = true;
    }
  } else if (storedSub && !stripe) {
    lookupFailed = true;
  }

  // Any other subscription on the customer that is not ended blocks a new one.
  let otherLive: { id: string; status: string }[] = [];
  let listFailed = false;
  if (customerId && stripe) {
    try {
      otherLive = await liveSubscriptions(stripe, customerId, subscription?.id ?? storedSub);
    } catch (err) {
      listFailed = true;
      warnings.push(`Could not list the customer's subscriptions in Stripe (${err instanceof Error ? err.message : "error"}).`);
    }
  }
  const latestStart = latestStartFrom(new Date(), MONTHLY_START_LATEST_DAYS);

  const stagePick = resumeStage({
    currentStage: tenant.stage,
    endedAt: tenant.cancelled_at,
    events,
    validStages: STAGE_IDS,
    anyPaid: balance.paidPence > 0,
    label: (s) => stageMeta(s).label,
  });
  const newStatus = resumeStatus({ billing: tenant.billing, stage: stagePick.stage, signedOffAt: tenant.signed_off_at });
  const subPlan = subscriptionPlan({
    billing: tenant.billing,
    subscription,
    lookupFailed,
    hadSubscription: Boolean(storedSub),
    stage: stagePick.stage,
    customerId,
    monthlyLabel,
    productId,
    otherLive,
    listFailed,
    latestStart: latestStart.label,
  });
  return {
    tenant,
    orders,
    events,
    sessions,
    sessionPaid,
    sessionFullyRefunded,
    skipped,
    balance,
    refunds,
    stagePick,
    newStatus,
    plan: subPlan,
    monthlyLabel,
    customerId,
    subscription,
    productId,
    paymentMethod,
    latestStart,
    warnings,
  };
}

/** Subscriptions on the customer that are still live (anything but canceled or incomplete_expired). */
async function liveSubscriptions(stripe: StripeClient, customer: string, except?: string | null) {
  const list = await stripe.subscriptions.list({ customer, status: "all", limit: 100 });
  return list.data.filter((s) => !subscriptionEnded(s.status) && s.id !== except).map((s) => ({ id: s.id, status: s.status }));
}

async function stripeClient(): Promise<StripeClient | null> {
  const secret = stripeSecret();
  if (!secret) return null;
  const Stripe = (await import("stripe")).default;
  return new Stripe(secret);
}

/** What the confirm panel shows. Plain data so it can be screenshotted with dummy values. */
export type ResumePreview = {
  tenantId: number;
  dealer: string;
  status: string;
  ended: boolean;
  checkedAt: string;
  balance: Balance;
  refunds: ResumeFacts["refunds"];
  skipped: SkippedSession[];
  stagePick: StagePick;
  stageLabel: string;
  /** live, trial or subscribed: where Resume puts the package. */
  newStatus: string;
  newStatusLabel: string;
  plan: SubscriptionPlan;
  warnings: string[];
  owner: boolean;
};

function previewFrom(f: ResumeFacts, owner: boolean): ResumePreview {
  const status = f.tenant.status ?? "";
  const stageLabel = stageMeta(f.stagePick.stage).label;
  const newStatusLabel = statusLabel(f.newStatus);
  return {
    tenantId: f.tenant.id,
    dealer: f.tenant.name || "this dealership",
    status,
    ended: resumeDecision(status) === "resume",
    checkedAt: new Date().toISOString(),
    balance: f.balance,
    refunds: f.refunds,
    skipped: f.skipped,
    stagePick: f.stagePick,
    stageLabel,
    newStatus: f.newStatus,
    newStatusLabel,
    plan: f.plan,
    warnings: f.warnings,
    owner,
  };
}

/** Staff only: the confirm panel. Reads Stripe live and changes nothing. */
export const resumePreview = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }): Promise<ResumePreview> => {
    const { sb, team, role } = await actor(data.token);
    if (!team) throw new Error("Office is for the Forecourt team.");
    if (role !== "owner") throw new Error(OWNER_ONLY_MESSAGE);
    const admin = sbAdmin() ?? sb;
    const facts = await loadResumeFacts(admin, await stripeClient(), data.tenantId);
    return previewFrom(facts, role === "owner");
  });

/** Staff only: put a refunded or cancelled order back. Idempotent; a no-op if it is already active. */
export const resumeOrder = createServerFn({ method: "POST" })
  .validator(
    (d: {
      token: string;
      tenantId: number;
      /** The status staff saw in the panel, so a changed file is not resumed blind. */
      expectStatus: string;
      undoCancel?: boolean;
      newSubscription?: boolean;
    }) => d,
  )
  .handler(async ({ data }) => {
    const { sb, team, role, email } = await actor(data.token);
    if (!team) throw new Error("Office is for the Forecourt team.");
    if (role !== "owner") throw new Error(OWNER_ONLY_MESSAGE);
    const admin = sbAdmin() ?? sb;
    const stripe = await stripeClient();
    const f = await loadResumeFacts(admin, stripe, data.tenantId);
    const plan = normalizePlan(f.tenant.plan);
    const total = monthTotalPence(plan, f.tenant.site_count ?? 1);
    return executeResume(
      {
        undoCancel: async (id, params, idempotencyKey) => {
          if (!stripe) throw new Error("Stripe is not connected on the server, so the subscription was not changed.");
          await stripe.subscriptions.update(id, params, { idempotencyKey });
        },
        createSubscription: async (idempotencyKey) => {
          if (!stripe || !f.customerId || !f.productId) throw new Error("Cannot set up a subscription from here.");
          // Check again right before creating: never a second live subscription.
          const live = await liveSubscriptions(stripe, f.customerId);
          if (live.length) {
            throw new Error(
              `This customer already has a live subscription in Stripe (${live.map((l) => `${l.id}, ${l.status}`).join("; ")}). No new one was set up and nothing changed.`,
            );
          }
          // Latest start, like checkout: go live ends this wait early (startMonthlyAtGoLive).
          // The 180 days count from today, the day it is resumed.
          const latest = latestStartFrom(new Date(), MONTHLY_START_LATEST_DAYS).unix;
          const sub = await stripe.subscriptions.create(
            {
              customer: f.customerId,
              items: [
                { quantity: 1, price_data: { currency: "gbp", unit_amount: total, recurring: { interval: "month" }, product: f.productId } },
              ],
              trial_end: latest,
              trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
              ...(f.paymentMethod ? { default_payment_method: f.paymentMethod } : {}),
              proration_behavior: "none",
              metadata: { tenant_id: String(f.tenant.id), kind: "resume", monthly_from: "go_live" },
            },
            { idempotencyKey },
          );
          if (subscriptionEnded(sub.status)) {
            throw new Error(`Stripe returned subscription ${sub.id}, which is ${sub.status}. Nothing changed on the desk. Set the monthly up in Stripe by hand.`);
          }
          return {
            id: sub.id,
            line: `New ${gbp(total)} a month subscription ${sub.id} set up, starting at go live or ${latestStartFrom(new Date(), MONTHLY_START_LATEST_DAYS).label} at the latest. Nothing charged today.`,
          };
        },
        cancelSubscription: async (id) => {
          if (!stripe) return;
          await stripe.subscriptions.cancel(id);
        },
        claim: async (patch) => {
          const { data: won, error } = await admin
            .from("tenants")
            .update(patch)
            .eq("id", data.tenantId)
            .in("status", ["cancelled", "refunded"])
            .select("id");
          if (error) throw new Error(error.message);
          return Boolean(won?.length);
        },
        setOrderStatus: async (orderId, status) => {
          await admin.from("orders").update({ status }).eq("id", orderId).in("status", ["refunded", "cancelled"]);
        },
        timeline: async (body, stage) => {
          await admin.from("build_events").insert({
            tenant_id: data.tenantId,
            kind: "billing",
            stage,
            title: "Order resumed",
            body,
            visibility: "internal",
            actor_email: email,
          });
        },
        note: async (body) => {
          await admin.from("notes").insert({ tenant_id: data.tenantId, author_email: email, visibility: "internal", body });
        },
        log: (msg, d) => console.info(msg, d),
      },
      {
        tenantId: data.tenantId,
        status: f.tenant.status,
        expectStatus: data.expectStatus,
        owner: role === "owner",
        actor: email,
        now: new Date(),
        endedAt: f.tenant.cancelled_at,
        plan: f.plan,
        subscription: f.subscription,
        choice: { undoCancel: Boolean(data.undoCancel), newSubscription: Boolean(data.newSubscription) },
        newStatus: f.newStatus,
        newStatusLabel: statusLabel(f.newStatus),
        stage: f.stagePick.stage,
        stageLabel: stageMeta(f.stagePick.stage).label,
        balance: f.balance,
        orders: f.orders.map((o) => ({
          id: o.id,
          status: o.status,
          sessionPaid: Boolean(o.stripe_session_id && f.sessionPaid[o.stripe_session_id]),
          fullyRefunded: Boolean(o.stripe_session_id && f.sessionFullyRefunded[o.stripe_session_id]),
        })),
      },
    );
  });

/** Staff (owner) only: a Stripe Checkout link for exactly the balance owed. Never charges. */
export const sendBalanceLink = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number; expectOwedPence: number; email: boolean }) => d)
  .handler(async ({ data }) => {
    const { sb, team, role, email } = await actor(data.token);
    if (!team) throw new Error("Office is for the Forecourt team.");
    if (role !== "owner") throw new Error("Only an owner can send a payment link.");
    const stripe = await stripeClient();
    if (!stripe) throw new Error("Stripe is not connected on the server, so no link was made.");
    const admin = sbAdmin() ?? sb;
    const f = await loadResumeFacts(admin, stripe, data.tenantId);
    if (f.balance.unknown) throw new Error("Some payments could not be read from Stripe, so the amount owed is unknown. No link was made.");
    const owed = f.balance.owedPence;
    if (owed <= 0) throw new Error("Nothing is owed now, so no link was made.");
    if (owed !== data.expectOwedPence) {
      throw new Error(`The balance changed to ${gbp(owed)} since you opened the panel. No link was made. Check again.`);
    }

    // Reuse a link for the same amount that is still open, so repeats never make a second one.
    let url: string | null = null;
    let sessionId: string | null = null;
    const dayAgo = Date.now() - 23 * 3600_000;
    for (const e of [...f.events].reverse()) {
      if (e.kind !== "billing" || e.title !== LINK_TITLE || Date.parse(e.created_at) < dayAgo) continue;
      const sid = [...(e.body ?? "").matchAll(SESSION_RE)][0]?.[1];
      if (!sid) continue;
      if (!(e.body ?? "").includes(`[${owed}p]`)) continue;
      try {
        const s = await stripe.checkout.sessions.retrieve(sid);
        if (s.status === "open" && s.url) {
          url = s.url;
          sessionId = s.id;
          break;
        }
      } catch {
        /* make a new one */
      }
    }
    // An open link for a different amount is out of date: expire it so the
    // customer cannot pay the wrong balance.
    const expired: string[] = [];
    for (const e of f.events) {
      if (e.kind !== "billing" || e.title !== LINK_TITLE || Date.parse(e.created_at) < dayAgo) continue;
      if ((e.body ?? "").includes(`[${owed}p]`)) continue;
      for (const m of (e.body ?? "").matchAll(SESSION_RE)) {
        const sid = m[1]!;
        if (sid === sessionId) continue;
        try {
          const old = await stripe.checkout.sessions.retrieve(sid);
          if (old.status === "open") {
            await stripe.checkout.sessions.expire(sid);
            expired.push(sid);
          }
        } catch (err) {
          console.warn("[resume] could not expire an old balance link", { sid, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
    let reused = Boolean(url);
    if (!url) {
      const minute = Math.floor(Date.now() / 60_000);
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          ...(f.customerId ? { customer: f.customerId } : { customer_email: f.tenant.email || undefined }),
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "gbp",
                unit_amount: owed,
                product_data: { name: "Forecourt balance", description: `Balance owed on ${f.tenant.name || "your order"}. Paid once.` },
              },
            },
          ],
          metadata: { kind: "balance", tenant_id: String(f.tenant.id) },
          payment_intent_data: { metadata: { kind: "balance", tenant_id: String(f.tenant.id) } },
          invoice_creation: { enabled: true },
          success_url: `${SITE.url}/account?balance=paid`,
          cancel_url: `${SITE.url}/account`,
          expires_at: minute * 60 + 23 * 3600,
        },
        { idempotencyKey: `forecourt-balance-${f.tenant.id}-${owed}-${minute}` },
      );
      url = session.url;
      sessionId = session.id;
      reused = false;
      await admin.from("build_events").insert({
        tenant_id: data.tenantId,
        kind: "billing",
        stage: null,
        title: LINK_TITLE,
        body: `${gbp(owed)} balance link made by ${email} (Stripe ${session.id}) [${owed}p]. It expires in 23 hours. Nothing is charged until the customer pays.`,
        visibility: "internal",
        actor_email: email,
      });
    }
    if (!url || !sessionId) throw new Error("Stripe did not return a link.");
    let emailMessage = "Not emailed. Copy the link and send it yourself.";
    if (data.email) {
      emailMessage = emailOutcomeMessage(await sendBalanceLinkEmail({ tenantId: data.tenantId, url, amountPence: owed, sessionId }));
    }
    try {
      await admin.from("notes").insert({
        tenant_id: data.tenantId,
        author_email: email,
        visibility: "internal",
        body: `${reused ? "Reused" : "Made"} a ${gbp(owed)} balance payment link (Stripe ${sessionId}). ${emailMessage}${expired.length ? ` Expired the older link${expired.length > 1 ? "s" : ""} for a different amount: ${expired.join(", ")}.` : ""}`,
      });
    } catch {
      /* best effort */
    }
    console.info("[resume] balance link", { tenantId: data.tenantId, owed, sessionId, reused, by: email });
    return { ok: true, url, amount: gbp(owed), reused, message: `${reused ? "That link is still open, so it was reused." : "Link made."} ${emailMessage}` };
  });
