import { monthTotalPence, type PlanId } from "./catalog.ts";

/** The first recurring Stripe item, as far as the price shown to people goes. */
export type StripePriceItem = { unitPence: number | null; quantity: number | null } | null;

/**
 * What the customer pays a month right now. One source for the account header
 * and the plan change sheet: the Stripe amount when there is one, else the
 * catalogue price for site_count.
 */
export function currentMonthlyPence(item: StripePriceItem, plan: PlanId, siteCount: number | null): number {
  if (item && item.unitPence != null) return item.unitPence * (item.quantity ?? 1);
  return monthTotalPence(plan, siteCount ?? 1);
}
