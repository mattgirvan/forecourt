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
import { dealerMatchNote, similarPaidTenants, type MatchTenant } from "./dealer-match.ts";

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

export type TenantRow = {
  user_id: string;
  status: string | null;
  trial_ends_at: string | null;
  stripe_subscription_id?: string | null;
  name?: string | null;
  email?: string | null;
};

/** Something staff must look at. Recorded on the file and, when email is on, sent to the team. */
export type StaffFlag = {
  tenantId: number;
  kind: "duplicate_payment" | "similar_dealer";
  title: string;
  body: string;
  /** One flag per order and kind, so retries never repeat it. */
  dedupeKey: string;
};

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
  /** Ids of this tenant's other orders already marked paid. */
  otherPaidOrderIds(tenantId: number, exceptOrderId: number): Promise<number[]>;
  /** Tenants to compare a new paid order against. Best effort. */
  listTenantsForMatch(): Promise<MatchTenant[]>;
  /** Record a staff flag. Must never throw. */
  flagForStaff(flag: StaffFlag): Promise<void>;
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
/**
 * A second paid order for a site that already has a running package (two
 * Checkout tabs both paid, say). The tenant must keep the subscription it
 * has: overwriting it would orphan a subscription that nobody marks live.
 */
export function paidOrderConflict(
  current: Pick<TenantRow, "status" | "stripe_subscription_id">,
  order: Pick<OrderRow, "kind">,
  incomingSubscription: string | null,
  otherPaidOrders: number[],
): null | { reason: "active_subscription" | "already_paid" } {
  const status = current.status || "briefing";
  if (status === "briefing" || status === "cancelled" || status === "refunded") return null;
  // A retry of the payment that set this subscription.
  if (incomingSubscription && current.stripe_subscription_id === incomingSubscription) return null;
  // A paid trial converting is the one expected second payment.
  if (order.kind === "convert" && !current.stripe_subscription_id) return null;
  if (!otherPaidOrders.length) return null;
  return { reason: current.stripe_subscription_id ? "active_subscription" : "already_paid" };
}

export type ApplyResult = { applied: "tenant_updated" | "order_only" | "already_paid"; flags: StaffFlag[] };

/**
 * Apply a confirmed payment. Tenant first, order last, so "order paid" always
 * means the tenant was updated too and a retry after a failure redoes both.
 * If the site already has a running package, the tenant is left alone, the
 * order is still recorded as paid (the money was taken) and staff are flagged.
 */
export async function applyPaidOrder(
  store: PaymentStore,
  order: OrderRow,
  session: CheckoutSessionLike | null,
  actor: string,
  log: Logger,
  now: Date = new Date(),
): Promise<ApplyResult> {
  if (order.status === "paid") return { applied: "already_paid", flags: [] };
  const flags: StaffFlag[] = [];
  let applied: ApplyResult["applied"] = "order_only";
  const incoming = refId(session?.subscription);
  if (order.tenant_id) {
    const current = await store.loadTenant(order.tenant_id);
    // An order may only ever pay for a site owned by the same account.
    if (!current || current.user_id !== order.user_id) {
      throw new PaymentRefused("tenant_not_owned", `order ${order.id} points at tenant ${order.tenant_id}`);
    }
    const others = await store.otherPaidOrderIds(order.tenant_id, order.id);
    const conflict = paidOrderConflict(current, order, incoming, others);
    if (conflict) {
      const kept = current.stripe_subscription_id ? `It keeps subscription ${current.stripe_subscription_id}.` : "";
      flags.push({
        tenantId: order.tenant_id,
        kind: "duplicate_payment",
        title: "Second payment for a site that is already paid for",
        body: `Order #${order.id} was paid (Stripe session ${session?.id ?? "none"}${
          incoming ? `, subscription ${incoming}` : ""
        }) but this site already had paid order${others.length > 1 ? "s" : ""} #${others.join(", #")}. The site was not changed. ${kept} Refund the duplicate setup${
          incoming ? ` and cancel ${incoming}` : ""
        } in Stripe.`,
        dedupeKey: `duplicate-payment:order:${order.id}`,
      });
    } else {
      await store.updateTenant(order.tenant_id, paidTenantPatch(order, session, current, now));
      applied = "tenant_updated";
      // Flag (never block) a paid order that looks like another dealership.
      try {
        const matches = similarPaidTenants(
          { id: order.tenant_id, name: current.name, email: current.email },
          await store.listTenantsForMatch(),
        );
        if (matches.length) {
          flags.push({
            tenantId: order.tenant_id,
            kind: "similar_dealer",
            title: "Paid order looks like an existing dealership",
            body: dealerMatchNote({ id: order.tenant_id, name: current.name }, matches),
            dedupeKey: `similar-dealer:order:${order.id}`,
          });
        }
      } catch (err) {
        log.warn("[payments] similar dealership check failed for tenant", order.tenant_id, err);
      }
    }
  }
  await store.markOrderPaid(order.id, {
    stripe_session_id: session?.id,
    stripe_subscription_id: incoming,
  });
  for (const flag of flags) {
    try {
      await store.flagForStaff(flag);
    } catch (err) {
      log.warn("[payments] staff flag failed", flag.dedupeKey, err);
    }
  }
  if (order.tenant_id && applied === "tenant_updated") {
    try {
      await store.seedPaid(order.tenant_id, actor);
    } catch (err) {
      log.warn("[payments] build board seed failed for tenant", order.tenant_id, err);
    }
  }
  return { applied, flags };
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

export type WebhookEvent = {
  id?: string;
  type: string;
  livemode?: boolean;
  data: { object: Record<string, unknown> };
};

export type WebhookDeps = {
  stripeSecret: string | undefined;
  webhookSecret: string | undefined;
  /** null when SUPABASE_SERVICE_ROLE_KEY is missing. */
  store: PaymentStore | null;
  constructEvent: (raw: string, signature: string, secret: string) => WebhookEvent;
  log: Logger;
  now?: Date;
  /**
   * Runs after a paid session is applied (also when the return URL got there
   * first), e.g. the thank-you email. Its failures are logged and never turn
   * the webhook answer into an error; it must dedupe its own side effects.
   */
  onPaid?: (order: OrderRow, session: CheckoutSessionLike, event: WebhookEvent) => Promise<void>;
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
    const applied = await applyPaidOrder(store, order as OrderRow, session, "stripe", log, deps.now);
    // No thank-you for a duplicate payment: staff were flagged instead.
    const duplicate = applied.flags.some((f) => f.kind === "duplicate_payment");
    if (deps.onPaid && !duplicate) {
      try {
        await deps.onPaid(order as OrderRow, session, event);
      } catch (err) {
        log.warn("[stripe-webhook] after-payment step failed (payment still applied):", err);
      }
    }
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
type Filter = PromiseLike<QueryResult> & {
  eq: (col: string, v: unknown) => Filter;
  neq: (col: string, v: unknown) => Filter;
  maybeSingle: () => PromiseLike<QueryResult>;
};
// Minimal structural type so this file needs no supabase-js import.
export type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => Filter;
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, v: unknown) => PromiseLike<QueryResult>;
    };
    insert: (row: Record<string, unknown>) => PromiseLike<QueryResult>;
  };
};

export type StaffAlert = (flag: StaffFlag) => Promise<void>;

export function supabasePaymentStore(
  sb: SupabaseLike,
  seed: (tenantId: number, actor: string) => Promise<void>,
  /** Optional team email for staff flags (gated by EMAIL_MODE by the caller). */
  alert?: StaffAlert,
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
      const full = await sb
        .from("tenants")
        .select("user_id, status, trial_ends_at, stripe_subscription_id, name, email")
        .eq("id", id)
        .maybeSingle();
      if (!full.error) return (full.data as TenantRow | null) ?? null;
      // Older schema without the billing columns.
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
    async otherPaidOrderIds(tenantId, exceptOrderId) {
      const r = await sb.from("orders").select("id").eq("tenant_id", tenantId).eq("status", "paid").neq("id", exceptOrderId);
      const rows = (must(r, "load paid orders") as Array<{ id: number }> | null) ?? [];
      return rows.map((o) => o.id);
    },
    async listTenantsForMatch() {
      const r = await sb.from("tenants").select("id, name, email, status");
      return (must(r, "list tenants") as MatchTenant[] | null) ?? [];
    },
    async flagForStaff(flag) {
      // Internal note on the file (office Notes) and the staff timeline.
      try {
        await sb.from("notes").insert({
          tenant_id: flag.tenantId,
          author_email: "stripe",
          visibility: "internal",
          body: `${flag.title}. ${flag.body}`,
        });
      } catch {
        /* best effort */
      }
      try {
        await sb.from("build_events").insert({
          tenant_id: flag.tenantId,
          kind: "note",
          title: flag.title,
          body: flag.body,
          visibility: "internal",
          actor_email: "stripe",
        });
      } catch {
        /* best effort */
      }
      if (alert) {
        try {
          await alert(flag);
        } catch {
          /* best effort */
        }
      }
    },
    seedPaid: seed,
  };
}
