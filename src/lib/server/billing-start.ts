/**
 * Monthly billing starts at go live. Checkout creates the subscription with a
 * waiting period (a Stripe trial) so only the one-off setup is charged; when
 * staff mark a site Live we end that wait, which charges the first month now
 * and anchors every later month to the go-live date.
 *
 * Pure (no framework or `@/` imports) so it can be unit tested with node --test.
 */

export type SubscriptionLike = { id: string; status: string; trial_end?: number | null };

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
      reason: "no_subscription" | "stripe_not_configured" | "already_active" | "not_waiting" | "stripe_error";
      detail?: string;
    };

type Log = { error: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };

export async function startMonthlyAtGoLive(
  deps: { subscriptions: StripeSubscriptionsLike | null; log: Log },
  subscriptionId: string | null | undefined,
): Promise<MonthlyStartResult> {
  if (!subscriptionId) return { started: false, reason: "no_subscription" };
  if (!deps.subscriptions) return { started: false, reason: "stripe_not_configured" };
  try {
    const sub = await deps.subscriptions.retrieve(subscriptionId);
    if (sub.status === "active" || sub.status === "past_due") {
      return { started: false, reason: "already_active", detail: sub.status };
    }
    if (sub.status !== "trialing") {
      return { started: false, reason: "not_waiting", detail: sub.status };
    }
    // Same key on a retry, so Stripe never starts the plan twice.
    await deps.subscriptions.update(
      subscriptionId,
      { trial_end: "now", proration_behavior: "none" },
      { idempotencyKey: `forecourt-go-live-${subscriptionId}` },
    );
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
      return "Monthly billing was already running.";
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
  | { kind: "no_change"; detail?: string };

export async function previewMonthlyStart(
  deps: { subscriptions: Pick<StripeSubscriptionsLike, "retrieve"> | null; log: Log },
  subscriptionId: string | null | undefined,
): Promise<GoLiveBillingPreview> {
  if (!subscriptionId) return { kind: "no_change", detail: "no_subscription" };
  if (!deps.subscriptions) return { kind: "unknown" };
  try {
    const sub = await deps.subscriptions.retrieve(subscriptionId);
    if (sub.status === "trialing") return { kind: "will_start" };
    return { kind: "no_change", detail: sub.status };
  } catch (err) {
    deps.log.warn("[billing] could not check the subscription before go live", subscriptionId, err);
    return { kind: "unknown" };
  }
}

/** The staff confirm before moving a site to Live. */
export function goLiveConfirmText(preview: GoLiveBillingPreview, monthlyLabel: string | null): string {
  if (preview.kind === "no_change") return "Mark live?";
  const amount = monthlyLabel ? `${monthlyLabel} ` : "";
  return `Mark live? This starts their ${amount}monthly plan today.`;
}
