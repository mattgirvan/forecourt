/**
 * Payment confirmation rules, shared by the account page (confirmPayment) and
 * the Stripe webhook. Kept free of framework and `@/` imports so it can be
 * unit tested with plain `node --test`.
 *
 * The one rule: an order only becomes paid from a Stripe Checkout session we
 * retrieved (or received signed) and checked against the order row, or, when
 * no Stripe secret key is configured at all, from the preview shortcut.
 * Card data never passes through here; we only read Stripe's session summary.
 */
import { normalizePlan, type BillingKind, type PlanId } from "../catalog.ts";

export type OrderRow = {
  id: number;
  user_id: string;
  tenant_id: number | null;
  plan: string;
  amount_pence: number;
  status: string;
  kind?: string | null;
  site_count?: number | null;
  stripe_session_id?: string | null;
};

type StripeRef = string | { id: string } | null | undefined;

export type CheckoutSessionLike = {
  id: string;
  status?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  mode?: string | null;
  metadata?: Record<string, string> | null;
  subscription?: StripeRef;
  customer?: StripeRef;
};

export type TenantPaidPatch = {
  status: "trial" | "subscribed";
  plan: PlanId;
  billing: BillingKind;
  trial_ends_at: string | null;
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
};

export type TenantRow = { user_id: string; status: string | null; trial_ends_at: string | null };

/** Writes the confirmation needs. Every method throws on a database error. */
export interface PaymentStore {
  loadOrder(id: number): Promise<OrderRow | null>;
  loadTenant(id: number): Promise<TenantRow | null>;
  updateTenant(id: number, patch: TenantPaidPatch): Promise<void>;
  markOrderPaid(
    id: number,
    fields: { stripe_session_id?: string; stripe_subscription_id?: string | null },
  ): Promise<void>;
  cancelBySubscription(subscriptionId: string): Promise<void>;
  /** Puts the order on the build board. Failures are logged, not fatal. */
  seedPaid(tenantId: number, actor: string): Promise<void>;
}

export type Logger = { error: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };

const TRIAL_DAYS = 60;

function refId(ref: StripeRef): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id ?? null;
}

export function orderBilling(order: Pick<OrderRow, "kind" | "plan">): BillingKind {
  return order.kind === "trial" || order.plan === "pilot" ? "trial" : "subscription";
}

/**
 * Is this Stripe session proof that `order` is paid? Checks it is complete
 * and paid, that it was created for this order, that the order has not been
 * pointed at a different session, and that Stripe charged the order amount
 * in GBP. `userId`, when given, must own the order.
 */
export function verifyPaidSession(
  session: CheckoutSessionLike,
  order: OrderRow | null,
  opts: { userId?: string } = {},
): { ok: true } | { ok: false; reason: string } {
  if (!order) return { ok: false, reason: "order_not_found" };
  if (opts.userId !== undefined && order.user_id !== opts.userId) return { ok: false, reason: "not_your_order" };
  if (session.status !== "complete") return { ok: false, reason: "session_not_complete" };
  if (session.payment_status !== "paid") return { ok: false, reason: "session_not_paid" };
  if (session.metadata?.order_id !== String(order.id)) return { ok: false, reason: "order_mismatch" };
  if (order.stripe_session_id && order.stripe_session_id !== session.id) {
    return { ok: false, reason: "session_mismatch" };
  }
  if ((session.currency ?? "").toLowerCase() !== "gbp") return { ok: false, reason: "currency_mismatch" };
  if (session.amount_total !== order.amount_pence) return { ok: false, reason: "amount_mismatch" };
  return { ok: true };
}

/** Tenant fields a confirmed order sets. Plan and billing come from our order row, not the client. */
export function paidTenantPatch(
  order: OrderRow,
  session: Pick<CheckoutSessionLike, "subscription" | "customer"> | null,
  current: { trial_ends_at: string | null } | null,
  now: Date = new Date(),
): TenantPaidPatch {
  const billing = orderBilling(order);
  const plan = normalizePlan(order.plan);
  const patch: TenantPaidPatch = {
    status: billing === "trial" ? "trial" : "subscribed",
    plan,
    billing,
    trial_ends_at:
      billing === "trial"
        ? current?.trial_ends_at || new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString()
        : null,
  };
  const sub = refId(session?.subscription);
  const customer = refId(session?.customer);
  if (sub) patch.stripe_subscription_id = sub;
  if (customer) patch.stripe_customer_id = customer;
  return patch;
}

/**
 * Apply a confirmed payment. Tenant first, order last, so "order paid" always
 * means the tenant was updated too and a retry after a failure redoes both.
 */
export async function applyPaidOrder(
  store: PaymentStore,
  order: OrderRow,
  session: CheckoutSessionLike | null,
  actor: string,
  log: Logger,
  now: Date = new Date(),
): Promise<void> {
  if (order.status === "paid") return;
  if (order.tenant_id) {
    const current = await store.loadTenant(order.tenant_id);
    // An order may only ever pay for a site owned by the same account.
    if (!current || current.user_id !== order.user_id) {
      throw new PaymentRefused("tenant_not_owned", `order ${order.id} points at tenant ${order.tenant_id}`);
    }
    await store.updateTenant(order.tenant_id, paidTenantPatch(order, session, current, now));
  }
  await store.markOrderPaid(order.id, {
    stripe_session_id: session?.id,
    stripe_subscription_id: refId(session?.subscription),
  });
  if (order.tenant_id) {
    try {
      await store.seedPaid(order.tenant_id, actor);
    } catch (err) {
      log.warn("[payments] build board seed failed for tenant", order.tenant_id, err);
    }
  }
}

/** A confirmation that must not be applied (as opposed to a database error). */
export class PaymentRefused extends Error {
  readonly reason: string;
  constructor(reason: string, detail: string) {
    super(`${reason}: ${detail}`);
    this.reason = reason;
  }
}

export type ConfirmDeps = {
  stripeSecret: string | undefined;
  userId: string;
  store: PaymentStore;
  retrieveSession: (id: string) => Promise<CheckoutSessionLike>;
  log: Logger;
  now?: Date;
};

export type ConfirmResult = { ok: boolean; reason?: string };

/** Server side of the account page's "back from checkout" call. */
export async function confirmPaymentFlow(
  deps: ConfirmDeps,
  input: { sessionId?: string; previewOrderId?: number },
): Promise<ConfirmResult> {
  const { store, log } = deps;
  // A real Checkout session always wins over the preview shortcut.
  if (input.previewOrderId && !input.sessionId) {
    // Preview shortcut: only when this deployment has no Stripe key at all.
    if (deps.stripeSecret) {
      log.warn("[payments] preview confirmation refused: a Stripe key is configured", input.previewOrderId);
      return { ok: false, reason: "preview_disabled" };
    }
    const order = await store.loadOrder(Number(input.previewOrderId));
    if (!order || order.user_id !== deps.userId) return { ok: false, reason: "order_not_found" };
    if (order.status !== "pending" && order.status !== "paid") return { ok: false, reason: "order_not_pending" };
    try {
      await applyPaidOrder(store, order, null, "preview", log, deps.now);
    } catch (err) {
      if (err instanceof PaymentRefused) return { ok: false, reason: err.reason };
      throw err;
    }
    return { ok: true };
  }
  if (!input.sessionId) return { ok: false, reason: "no_session" };
  if (!deps.stripeSecret) return { ok: false, reason: "stripe_not_configured" };
  const session = await deps.retrieveSession(input.sessionId);
  const orderId = Number(session.metadata?.order_id);
  const order = Number.isInteger(orderId) && orderId > 0 ? await store.loadOrder(orderId) : null;
  const check = verifyPaidSession(session, order, { userId: deps.userId });
  if (!check.ok) {
    log.warn("[payments] checkout session not accepted:", check.reason, session.id);
    return { ok: false, reason: check.reason };
  }
  try {
    await applyPaidOrder(store, order as OrderRow, session, "checkout", log, deps.now);
  } catch (err) {
    if (err instanceof PaymentRefused) {
      log.warn("[payments] checkout session not accepted:", err.message);
      return { ok: false, reason: err.reason };
    }
    throw err;
  }
  return { ok: true };
}

export type WebhookEvent = { id?: string; type: string; data: { object: Record<string, unknown> } };

export type WebhookDeps = {
  stripeSecret: string | undefined;
  webhookSecret: string | undefined;
  /** null when SUPABASE_SERVICE_ROLE_KEY is missing. */
  store: PaymentStore | null;
  constructEvent: (raw: string, signature: string, secret: string) => WebhookEvent;
  log: Logger;
  now?: Date;
};

export type WebhookResult = { status: number; body: string };

/**
 * Stripe retries any non-2xx answer, so anything that could succeed later
 * (missing config, a failed database write) must be a 5xx, never a quiet 200.
 * Bad signatures stay 400.
 */
export async function handleStripeWebhook(
  deps: WebhookDeps,
  raw: string,
  signature: string,
): Promise<WebhookResult> {
  const { log } = deps;
  if (!deps.stripeSecret) {
    log.error("[stripe-webhook] STRIPE_SECRET_KEY is not configured; answering 500 so Stripe retries");
    return { status: 500, body: "stripe not configured" };
  }
  if (!deps.webhookSecret?.trim()) {
    log.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured; answering 500 so Stripe retries");
    return { status: 500, body: "webhook secret not configured" };
  }
  let event: WebhookEvent;
  try {
    event = deps.constructEvent(raw, signature, deps.webhookSecret);
  } catch {
    return { status: 400, body: "bad signature" };
  }

  const handled =
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded" ||
    event.type === "customer.subscription.deleted";
  if (!handled) return { status: 200, body: "ignored" };

  const store = deps.store;
  if (!store) {
    log.error(
      `[stripe-webhook] SUPABASE_SERVICE_ROLE_KEY is not configured; cannot record ${event.type} ${event.id ?? ""}; answering 500 so Stripe retries`,
    );
    return { status: 500, body: "database not configured" };
  }

  try {
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as { id?: string };
      if (sub.id) await store.cancelBySubscription(sub.id);
      return { status: 200, body: "ok" };
    }

    const session = event.data.object as unknown as CheckoutSessionLike;
    if (session.payment_status !== "paid") {
      // Delayed payment methods complete first and pay later; the
      // async_payment_succeeded event will carry the paid session.
      return { status: 200, body: "not paid yet" };
    }
    const orderId = Number(session.metadata?.order_id);
    const order = Number.isInteger(orderId) && orderId > 0 ? await store.loadOrder(orderId) : null;
    const check = verifyPaidSession(session, order);
    if (!check.ok) {
      log.error("[stripe-webhook] paid session not applied:", check.reason, session.id, "order", orderId || "none");
      return { status: 422, body: `not applied: ${check.reason}` };
    }
    await applyPaidOrder(store, order as OrderRow, session, "stripe", log, deps.now);
    return { status: 200, body: "ok" };
  } catch (err) {
    if (err instanceof PaymentRefused) {
      log.error("[stripe-webhook] paid session not applied:", err.message);
      return { status: 422, body: `not applied: ${err.reason}` };
    }
    log.error("[stripe-webhook] database write failed for", event.type, event.id ?? "", err);
    return { status: 500, body: "database write failed" };
  }
}

/**
 * Supabase-backed store. `sb` should be the service-role client; the caller's
 * own client only works until the entitlement guard migration is applied.
 */
type QueryResult = { data: unknown; error: { message: string } | null };
// Minimal structural type so this file needs no supabase-js import.
export type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, v: unknown) => { maybeSingle: () => PromiseLike<QueryResult> };
    };
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, v: unknown) => PromiseLike<QueryResult>;
    };
  };
};

export function supabasePaymentStore(
  sb: SupabaseLike,
  seed: (tenantId: number, actor: string) => Promise<void>,
): PaymentStore {
  const must = (r: QueryResult, what: string) => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
    return r.data;
  };
  return {
    async loadOrder(id) {
      const r = await sb
        .from("orders")
        .select("id, user_id, tenant_id, plan, amount_pence, status, kind, site_count, stripe_session_id")
        .eq("id", id)
        .maybeSingle();
      return (must(r, "load order") as OrderRow | null) ?? null;
    },
    async loadTenant(id) {
      const r = await sb.from("tenants").select("user_id, status, trial_ends_at").eq("id", id).maybeSingle();
      return (must(r, "load tenant") as TenantRow | null) ?? null;
    },
    async updateTenant(id, patch) {
      must(await sb.from("tenants").update(patch).eq("id", id), "update tenant");
    },
    async markOrderPaid(id, fields) {
      const patch: Record<string, unknown> = { status: "paid" };
      if (fields.stripe_session_id) patch.stripe_session_id = fields.stripe_session_id;
      if (fields.stripe_subscription_id) patch.stripe_subscription_id = fields.stripe_subscription_id;
      must(await sb.from("orders").update(patch).eq("id", id), "mark order paid");
    },
    async cancelBySubscription(subscriptionId) {
      must(
        await sb.from("tenants").update({ status: "cancelled" }).eq("stripe_subscription_id", subscriptionId),
        "cancel tenant",
      );
    },
    seedPaid: seed,
  };
}
