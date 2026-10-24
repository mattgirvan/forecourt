/**
 * Plan change rules (plan change flow PR 1). Pure maths, no I/O, not wired in yet.
 *
 * Decided by Matt (24 Oct 2026):
 * - Direction goes by the MONTHLY PRICE, not plan rank.
 *   Price up: the new monthly price starts on the go live day (when staff
 *   complete the change). The part month from go live to period end is added
 *   to the next bill (Stripe proration), never charged on request.
 *   Price down or equal: starts at period end. No charge, no refund.
 * - Setup difference is charged up front on request when the price goes up,
 *   AND always when moving onto Group, even if the monthly price falls
 *   (Franchise to Group at 2 sites charges £2,000). Never refunded.
 *   Group to Franchise is £0 setup, so no payment step: straight to a ticket.
 * - All prices already include VAT. No Stripe Tax, nothing added on top.
 */
import { PLANS, type PlanId } from "./catalog.ts";
import { planMonthlyPence } from "./plan-change.ts";

export type PriceDirection = "up" | "down" | "equal" | "same_plan";

export type PlanMove = {
  from: PlanId;
  to: PlanId;
  live: number;
  direction: PriceDirection;
  oldMonthlyPence: number;
  newMonthlyPence: number;
  /** Paid on request, before the ticket. 0 means no payment step. Inc. VAT. */
  setupDuePence: number;
  /** True when the request needs a payment before it reaches the team. */
  needsPayment: boolean;
  /** When the new monthly price starts. */
  monthlyStarts: "on_go_live" | "period_end" | "never";
};

export function priceDirection(oldMonthlyPence: number, newMonthlyPence: number, samePlan = false): PriceDirection {
  if (samePlan) return "same_plan";
  return newMonthlyPence > oldMonthlyPence ? "up" : newMonthlyPence < oldMonthlyPence ? "down" : "equal";
}

/** Setup charged on request. Price up, or onto Group, pays the positive difference. */
export function setupDuePence(from: PlanId, to: PlanId, direction: PriceDirection): number {
  if (direction === "same_plan") return 0;
  const diff = Math.max(0, PLANS[to].setupPence - PLANS[from].setupPence);
  return direction === "up" || to === "group" ? diff : 0;
}

export function planMove(input: {
  from: PlanId;
  to: PlanId;
  live: number;
  /** Test hooks: override the catalog monthly prices. */
  oldMonthlyPence?: number;
  newMonthlyPence?: number;
}): PlanMove {
  const live = Math.max(1, Math.floor(input.live));
  const oldMonthlyPence = input.oldMonthlyPence ?? planMonthlyPence(input.from, live);
  const newMonthlyPence = input.newMonthlyPence ?? planMonthlyPence(input.to, live);
  const direction = priceDirection(oldMonthlyPence, newMonthlyPence, input.from === input.to);
  const setup = setupDuePence(input.from, input.to, direction);
  return {
    from: input.from,
    to: input.to,
    live,
    direction,
    oldMonthlyPence,
    newMonthlyPence,
    setupDuePence: setup,
    needsPayment: setup > 0,
    monthlyStarts: direction === "same_plan" ? "never" : direction === "up" ? "on_go_live" : "period_end",
  };
}

/**
 * Part month for a price rise, from the go live day to period end, added to
 * the next bill. 0 for anything that is not a rise or has no period.
 * Times are unix seconds.
 */
export function partMonthPence(move: PlanMove, goLive: number, periodStart: number | null, periodEnd: number | null): number {
  if (move.direction !== "up" || periodStart == null || periodEnd == null || periodEnd <= periodStart) return 0;
  const fraction = Math.min(1, Math.max(0, (periodEnd - goLive) / (periodEnd - periodStart)));
  return Math.round((move.newMonthlyPence - move.oldMonthlyPence) * fraction);
}

const gbp = (p: number) =>
  `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Confirm sheet lines. Customer copy: no dashes, prices shown inc. VAT. */
export function moveLines(move: PlanMove, periodEndLabel?: string | null): string[] {
  const name = PLANS[move.to].name;
  if (move.direction === "same_plan") return [`You are already on ${name}.`];
  const lines: string[] = [];
  lines.push(move.needsPayment ? `Setup difference, paid now: ${gbp(move.setupDuePence)} inc. VAT` : "Nothing to pay now.");
  if (move.direction === "up") {
    lines.push(`New monthly price: ${gbp(move.newMonthlyPence)} inc. VAT, from the day your change goes live.`);
    lines.push("The part month from that day to the end of your billing month is added to your next bill.");
  } else {
    const when = periodEndLabel ? `from ${periodEndLabel}` : "from your next billing month";
    lines.push(`New monthly price: ${gbp(move.newMonthlyPence)} inc. VAT (was ${gbp(move.oldMonthlyPence)}), ${when}.`);
    lines.push("There is no refund for setup or part months.");
  }
  return lines;
}
