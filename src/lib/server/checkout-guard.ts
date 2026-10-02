/**
 * Stops a site that is already paid for from buying again. A second checkout
 * would take the setup again and leave a second subscription waiting in
 * Stripe that nobody marks live, so it would start charging on day 180.
 *
 * Checkout is allowed only when the site is unpaid (briefing), cancelled or
 * refunded, or when a paid trial is converting. A stored subscription must
 * also be over in Stripe before another one can start.
 *
 * Pure (no framework or `@/` imports) so it can be unit tested with node --test.
 */
import { onPaidTrial, type BillingKind, type QuoteTenant } from "../catalog.ts";

export const ALREADY_PAID_MESSAGE =
  "This desk is already paid for. Reply to hello@forecourt.me if you need to change your plan.";

export const PLAN_CHECK_FAILED_MESSAGE =
  "We could not check your current plan just now, so nothing was charged. Try again in a minute, or reply to hello@forecourt.me.";

export type GuardTenant = NonNullable<QuoteTenant> & {
  id?: number | null;
  name?: string | null;
  stripe_subscription_id?: string | null;
};

/** What Stripe says about the stored subscription. */
export type StoredSubscription =
  | { status: string; cancel_at_period_end?: boolean | null; cancel_at?: number | null }
  /** Stripe has no such subscription. */
  | "missing"
  /** Stripe could not be asked. */
  | "unknown"
  /** Nothing stored, or Stripe is not connected (no charge can happen then). */
  | null;

const OPEN_STATUSES = new Set(["briefing", "cancelled", "refunded"]);
const ENDED_SUBSCRIPTIONS = new Set(["canceled", "incomplete_expired"]);

export function statusAllowsCheckout(
  t: GuardTenant | null | undefined,
  req: { billing: BillingKind; convertFromTrial?: boolean },
) {
  if (!t) return true;
  const status = t.status || "briefing";
  if (OPEN_STATUSES.has(status)) return true;
  return Boolean(req.convertFromTrial && req.billing === "subscription" && onPaidTrial(t));
}

export function sameDealership(a: string | null | undefined, b: string | null | undefined) {
  const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(a) !== "" && norm(a) === norm(b);
}

/** Null when checkout may go ahead, otherwise the customer message. */
export function checkoutRefusal(input: {
  tenant: GuardTenant | null | undefined;
  billing: BillingKind;
  convertFromTrial?: boolean;
  storedSubscription: StoredSubscription;
  /** The signed-in user's other sites, to catch the same dealership twice. */
  otherTenants?: GuardTenant[];
}): string | null {
  const { tenant } = input;
  if (!statusAllowsCheckout(tenant, input)) return ALREADY_PAID_MESSAGE;

  if (tenant?.stripe_subscription_id) {
    const sub = input.storedSubscription;
    if (sub === "unknown") return PLAN_CHECK_FAILED_MESSAGE;
    if (sub && sub !== "missing" && !ENDED_SUBSCRIPTIONS.has(sub.status)) return ALREADY_PAID_MESSAGE;
  }

  for (const other of input.otherTenants ?? []) {
    if (tenant?.id != null && other.id === tenant.id) continue;
    if (!sameDealership(other.name, tenant?.name)) continue;
    if (!statusAllowsCheckout(other, { billing: input.billing, convertFromTrial: false })) return ALREADY_PAID_MESSAGE;
  }
  return null;
}
