/**
 * Account type change (Site, Franchise, Group). Pure maths and rules, no I/O.
 *
 * Upgrade: the setup difference is paid up front and the new plan only turns
 * on once that payment succeeds. The monthly change is pro-rated.
 * Downgrade: no setup refund. DOWNGRADE_TIMING decides when the new price
 * applies. Provisional, pending Matt: "period_end".
 */
import { PLANS, type PlanId } from "./catalog.ts";
import { linesFor, monthlyPence, type BillingLine } from "./site-billing.ts";

/** The one switch for downgrades. "period_end" or "now" (pro-rated credit). */
export const DOWNGRADE_TIMING: "period_end" | "now" = "period_end";

const RANK: Record<PlanId, number> = { site: 0, franchise: 1, group: 2 };
export type PlanChangeDirection = "upgrade" | "downgrade" | "same";

export function changeDirection(from: PlanId, to: PlanId): PlanChangeDirection {
  return RANK[to] > RANK[from] ? "upgrade" : RANK[to] < RANK[from] ? "downgrade" : "same";
}

/** Recurring lines for a plan at a live site count. */
export function planLines(plan: PlanId, live: number): BillingLine[] {
  if (plan === "site") return [{ key: "site_base", label: "Site", unitPence: PLANS.site.monthPence, quantity: 1 }];
  return linesFor(plan, live);
}

export function planMonthlyPence(plan: PlanId, live: number): number {
  return monthlyPence(planLines(plan, live));
}

export type PlanChangeQuote = {
  from: PlanId;
  to: PlanId;
  direction: PlanChangeDirection;
  /** Setup difference paid up front (upgrades only). Never refunded. */
  setupDiffPence: number;
  oldMonthlyPence: number;
  newMonthlyPence: number;
  /** Pro-rated charge (positive) or credit (negative) for the rest of this period. */
  proratedPence: number;
  /** Paid today before the change turns on. */
  dueNowPence: number;
  effective: "after_payment" | "period_end" | "now";
  periodEnd: string | null;
};

export function quotePlanChange(input: {
  from: PlanId;
  to: PlanId;
  live: number;
  periodStart?: number | null;
  periodEnd?: number | null;
  now?: number;
  downgradeTiming?: "period_end" | "now";
}): PlanChangeQuote {
  const { from, to } = input;
  const direction = changeDirection(from, to);
  const live = Math.max(1, Math.floor(input.live));
  const oldMonthlyPence = planMonthlyPence(from, live);
  const newMonthlyPence = planMonthlyPence(to, live);
  const timing = input.downgradeTiming ?? DOWNGRADE_TIMING;
  const setupDiffPence = direction === "upgrade" ? Math.max(0, PLANS[to].setupPence - PLANS[from].setupPence) : 0;
  let fraction = 0;
  const start = input.periodStart ?? null;
  const end = input.periodEnd ?? null;
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (start != null && end != null && end > start) fraction = Math.min(1, Math.max(0, (end - now) / (end - start)));
  const atPeriodEnd = direction === "downgrade" && timing === "period_end";
  const proratedPence = direction === "same" || atPeriodEnd ? 0 : Math.round((newMonthlyPence - oldMonthlyPence) * fraction);
  return {
    from,
    to,
    direction,
    setupDiffPence,
    oldMonthlyPence,
    newMonthlyPence,
    proratedPence,
    dueNowPence: setupDiffPence,
    effective: direction === "upgrade" ? "after_payment" : atPeriodEnd ? "period_end" : "now",
    periodEnd: end != null ? new Date(end * 1000).toISOString() : null,
  };
}

const gbp = (p: number) => `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Plain lines for the confirm step. */
export function quoteLines(q: PlanChangeQuote): string[] {
  const name = (p: PlanId) => PLANS[p].name;
  if (q.direction === "same") return [`You are already on ${name(q.to)}.`];
  if (q.direction === "upgrade") {
    return [
      `Setup difference, paid now: ${gbp(q.setupDiffPence)}`,
      `Pro-rated for the rest of this month, on your next bill: ${gbp(q.proratedPence)}`,
      `New monthly: ${gbp(q.newMonthlyPence)} (was ${gbp(q.oldMonthlyPence)})`,
      `${name(q.to)} turns on once the setup payment succeeds.`,
    ];
  }
  const when = q.effective === "period_end" ? (q.periodEnd ? `from ${new Date(q.periodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).replace("Sept", "Sep")}` : "from your next bill") : "now";
  return [
    "No setup refund.",
    q.effective === "now" ? `Pro-rated credit on your next bill: ${gbp(-q.proratedPence)}` : "Nothing extra to pay this month.",
    `New monthly: ${gbp(q.newMonthlyPence)} (was ${gbp(q.oldMonthlyPence)}), ${when}`,
  ];
}
