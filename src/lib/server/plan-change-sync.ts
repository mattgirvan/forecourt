/**
 * Account type change against Stripe, behind injected deps so it can be tested
 * with a mock. Nothing here reads env or secrets.
 */
import { PLANS, type PlanId } from "../catalog.ts";
import { changeDirection, planLines, DOWNGRADE_TIMING } from "../plan-change.ts";
import type { ItemChange, SiteSubsLike } from "./site-billing-sync.ts";

export type PlanChangeDeps = {
  subscriptions: SiteSubsLike | null;
  /** Stripe product for a plan's monthly lines (found by metadata, created once). */
  productFor: (plan: PlanId) => Promise<string>;
};

export type PlanChangeResult =
  | { applied: true; proration: "create_prorations" | "none"; items: ItemChange[] }
  | { applied: false; reason: "no_subscription" | "stripe_not_configured" | "same_plan" | "stripe_error"; detail?: string };

/** Swap every recurring line for the new plan's lines. */
export async function applyPlanChange(
  deps: PlanChangeDeps,
  input: { subscriptionId: string | null; from: PlanId; to: PlanId; live: number; key: string; downgradeTiming?: "period_end" | "now" },
): Promise<PlanChangeResult> {
  const dir = changeDirection(input.from, input.to);
  if (dir === "same") return { applied: false, reason: "same_plan" };
  if (!input.subscriptionId) return { applied: false, reason: "no_subscription" };
  if (!deps.subscriptions) return { applied: false, reason: "stripe_not_configured" };
  try {
    const sub = await deps.subscriptions.retrieve(input.subscriptionId);
    const product = await deps.productFor(input.to);
    const items: ItemChange[] = [
      ...sub.items.data.filter((i) => i.price?.recurring).map((i) => ({ id: i.id, deleted: true as const })),
      ...planLines(input.to, input.live).map((l) => ({
        price_data: { currency: "gbp" as const, unit_amount: l.unitPence, recurring: { interval: "month" as const }, product },
        quantity: l.quantity,
        metadata: { forecourt_line: l.key },
      })),
    ];
    const timing = input.downgradeTiming ?? DOWNGRADE_TIMING;
    const proration =
      sub.status === "trialing" || (dir === "downgrade" && timing === "period_end") ? "none" : "create_prorations";
    await deps.subscriptions.update(input.subscriptionId, { items, proration_behavior: proration }, { idempotencyKey: `plan-change:${input.key}` });
    return { applied: true, proration, items };
  } catch (err) {
    return { applied: false, reason: "stripe_error", detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Checkout for the setup difference. Metadata drives the webhook. */
export function upgradeCheckoutParams(input: {
  tenantId: number;
  changeId: number;
  from: PlanId;
  to: PlanId;
  setupDiffPence: number;
  customer?: string | null;
  email?: string | null;
  successUrl: string;
  cancelUrl: string;
}) {
  return {
    mode: "payment" as const,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    ...(input.customer ? { customer: input.customer } : { customer_email: input.email || undefined }),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: input.setupDiffPence,
          product_data: {
            name: `Forecourt ${PLANS[input.to].name} (setup difference)`,
            description: `Moving from ${PLANS[input.from].name} to ${PLANS[input.to].name}. ${PLANS[input.to].name} turns on once this is paid.`,
          },
        },
      },
    ],
    metadata: { kind: "plan_change", tenant_id: String(input.tenantId), change_id: String(input.changeId), from: input.from, to: input.to },
    invoice_creation: { enabled: true },
  };
}

export function planChangeMessage(r: PlanChangeResult, from: PlanId, to: PlanId): string {
  if (r.applied) return `Plan changed from ${PLANS[from].name} to ${PLANS[to].name}. ${r.proration === "none" ? "New price from the next bill." : "Pro-rated on the next bill."}`;
  if (r.reason === "same_plan") return "Already on that plan.";
  if (r.reason === "no_subscription") return "No subscription on file, so only the plan was noted.";
  if (r.reason === "stripe_not_configured") return "Stripe is not set up here, nothing was changed in Stripe.";
  return `Stripe refused the change: ${r.detail ?? "unknown error"}`;
}
