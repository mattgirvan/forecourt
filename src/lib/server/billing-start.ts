/**
 * Monthly billing starts at go live. Checkout creates the subscription with a
 * waiting period (a Stripe trial) so only the one-off setup is charged; when
 * staff mark a site Live we end that wait, which charges the first month now
 * and anchors every later month to the go-live date.
 *
 * Pure (no framework or `@/` imports) so it can be unit tested with node --test.
 */

export type SubscriptionLike = {
  id: string;
  status: string;
  trial_end?: number | null;
  /** Set when the customer (or staff) cancelled: the plan must not start. */
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
};

/** Tenant statuses that mean the package was ended. Going live never bills these. */
export const ENDED_TENANT_STATUSES = ["cancelled", "refunded"] as const;

export function tenantEnded(status: string | null | undefined) {
  return status === "cancelled" || status === "refunded";
}

export function subscriptionSetToCancel(sub: Pick<SubscriptionLike, "cancel_at_period_end" | "cancel_at">) {
  return Boolean(sub.cancel_at_period_end || sub.cancel_at);
}

export type StripeSubscriptionsLike = {
  retrieve: (id: string) => Promise<SubscriptionLike>;
  update: (
    id: string,
    params: { trial_end: "now"; proration_behavior: "none" },
    options?: { idempotencyKey?: string },
  ) => Promise<SubscriptionLike>;
};

export type MonthlyStartResult =
  | { started: true; subscriptionId: string }
  | {
      started: false;
      reason:
        | "no_subscription"
        | "stripe_not_configured"
        | "already_active"
        | "not_waiting"
        | "set_to_cancel"
        | "tenant_ended"
        | "payment_failed"
        | "stripe_error";
      detail?: string;
    };

type Log = { error: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };

export async function startMonthlyAtGoLive(
  deps: { subscriptions: StripeSubscriptionsLike | null; log: Log },
  subscriptionId: string | null | undefined,
  opts: { tenantStatus?: string | null } = {},
): Promise<MonthlyStartResult> {
  // A cancelled or refunded file never starts billing, even if Stripe still
  // has a waiting subscription for it.
  if (tenantEnded(opts.tenantStatus)) {
    return { started: false, reason: "tenant_ended", detail: opts.tenantStatus ?? undefined };
  }
  if (!subscriptionId) return { started: false, reason: "no_subscription" };
  if (!deps.subscriptions) return { started: false, reason: "stripe_not_configured" };
  try {
    const sub = await deps.subscriptions.retrieve(subscriptionId);
    if (subscriptionSetToCancel(sub)) {
      return { started: false, reason: "set_to_cancel", detail: sub.status };
    }
    if (sub.status === "active" || sub.status === "past_due") {
      return { started: false, reason: "already_active", detail: sub.status };
    }
    if (sub.status !== "trialing") {
      return { started: false, reason: "not_waiting", detail: sub.status };
    }
    // Same key on a retry, so Stripe never starts the plan twice.
    const after = await deps.subscriptions.update(
      subscriptionId,
      { trial_end: "now", proration_behavior: "none" },
      { idempotencyKey: `forecourt-go-live-${subscriptionId}` },
    );
    // Ending the wait charges the first month straight away. If the card was
    // declined or needs 3D Secure, Stripe leaves the subscription unpaid.
    if (after && after.status !== "active" && after.status !== "trialing") {
      return { started: false, reason: "payment_failed", detail: after.status };
    }
    return { started: true, subscriptionId };
  } catch (err) {
    deps.log.error("[billing] could not start the monthly plan for", subscriptionId, err);
    return { started: false, reason: "stripe_error", detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Short line for the staff screen and the internal timeline. */
export function monthlyStartMessage(r: MonthlyStartResult): string {
  if (r.started) return "Monthly billing started in Stripe today.";
  switch (r.reason) {
    case "no_subscription":
      return "No monthly subscription on this file, so nothing to start.";
    case "stripe_not_configured":
      return "Stripe is not connected on the server. Start the monthly plan in Stripe by hand.";
    case "already_active":
      return r.detail === "past_due"
        ? "Monthly billing was already running, but the last payment failed. Check the invoice in Stripe."
        : "Monthly billing was already running.";
    case "set_to_cancel":
      return "Their subscription is set to cancel, so monthly billing was not started.";
    case "tenant_ended":
      return `This file is ${r.detail ?? "cancelled"}, so monthly billing was not started.`;
    case "payment_failed":
      return `The monthly plan started but the first payment failed (Stripe status ${r.detail ?? "unpaid"}). Stripe will retry and email the customer. Check the invoice in Stripe.`;
    case "not_waiting":
      return `Subscription is ${r.detail ?? "not waiting"}, so monthly billing was not started.`;
    default:
      return `Stripe refused to start monthly billing: ${r.detail ?? "unknown error"}. Start it in Stripe by hand.`;
  }
}

/** What marking a site Live would do to its monthly plan, for the staff confirm. */
export type GoLiveBillingPreview =
  | { kind: "will_start" }
  /** A subscription exists but Stripe could not be asked. Assume it will start. */
  | { kind: "unknown" }
  | { kind: "no_change"; detail?: string; status?: string };

export async function previewMonthlyStart(
  deps: { subscriptions: Pick<StripeSubscriptionsLike, "retrieve"> | null; log: Log },
  subscriptionId: string | null | undefined,
  opts: { tenantStatus?: string | null } = {},
): Promise<GoLiveBillingPreview> {
  if (tenantEnded(opts.tenantStatus)) return { kind: "no_change", detail: "tenant_ended", status: opts.tenantStatus ?? undefined };
  if (!subscriptionId) return { kind: "no_change", detail: "no_subscription" };
  if (!deps.subscriptions) return { kind: "unknown" };
  try {
    const sub = await deps.subscriptions.retrieve(subscriptionId);
    if (subscriptionSetToCancel(sub)) return { kind: "no_change", detail: "set_to_cancel" };
    if (sub.status === "trialing") return { kind: "will_start" };
    return { kind: "no_change", detail: sub.status };
  } catch (err) {
    deps.log.warn("[billing] could not check the subscription before go live", subscriptionId, err);
    return { kind: "unknown" };
  }
}

/** The staff confirm before moving a site to Live. */
export function goLiveConfirmText(preview: GoLiveBillingPreview, monthlyLabel: string | null): string {
  if (preview.kind === "no_change") {
    if (preview.detail === "set_to_cancel") {
      return "Mark live? Their subscription is set to cancel, so this will not start the monthly plan.";
    }
    if (preview.detail === "tenant_ended") {
      return `Mark live? This file is ${preview.status ?? "cancelled"}, so this will not start the monthly plan.`;
    }
    return "Mark live?";
  }
  const amount = monthlyLabel ? `${monthlyLabel} ` : "";
  return `Mark live? This starts their ${amount}monthly plan today.`;
}
