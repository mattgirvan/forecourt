/**
 * Account type change against Stripe, behind injected deps so it can be tested
 * with a mock. Nothing here reads env or secrets.
 */
import { PLANS, type PlanId } from "../catalog.ts";
import { planLines } from "../plan-change.ts";
import { planMove } from "../plan-change-rules.ts";
import { formatUkDate } from "../uk-date.ts";
import type { ItemChange, SiteSubLike, SiteSubsLike } from "./site-billing-sync.ts";

/** The slice of Stripe subscription schedules we use. Mocked in tests. */
export type ScheduleLike = { id: string; phases?: { start_date: number; end_date: number | null }[] };
export type SchedulesLike = {
  create: (params: { from_subscription: string }, options: { idempotencyKey: string }) => Promise<ScheduleLike>;
  update: (id: string, params: Record<string, unknown>, options: { idempotencyKey: string }) => Promise<unknown>;
  release: (id: string, options: { idempotencyKey: string }) => Promise<unknown>;
};

export type PlanChangeDeps = {
  subscriptions: SiteSubsLike | null;
  /** Needed for price drops and equal price swaps. Missing means they refuse, never swap now. */
  schedules?: SchedulesLike | null;
  /** Stripe product for a plan's monthly lines (found by metadata, created once). */
  productFor: (plan: PlanId) => Promise<string>;
};

export type PlanChangeResult =
  | { applied: true; mode: "now"; proration: "create_prorations" | "none"; items: ItemChange[] }
  | { applied: true; mode: "scheduled"; proration: "none"; scheduleId: string; effectiveAt: string; items: ItemChange[] }
  | { applied: false; reason: "no_subscription" | "stripe_not_configured" | "same_plan" | "stripe_error" | "already_scheduled" | "no_period_end"; detail?: string };

type SubWithSchedule = SiteSubLike & { schedule?: string | { id: string } | null };

function periodEnd(sub: SiteSubLike): number | null {
  return sub.current_period_end ?? (sub.items.data[0] as { current_period_end?: number | null } | undefined)?.current_period_end ?? null;
}

/**
 * Change the plan in Stripe, following PR 1 rules (plan-change-rules.ts):
 * price up swaps now and pro-rates the part month onto the next bill (called
 * on the go live day). Price down or equal never swaps now: it books a
 * subscription schedule whose second phase starts at period end.
 */
export async function applyPlanChange(
  deps: PlanChangeDeps,
  input: { subscriptionId: string | null; from: PlanId; to: PlanId; live: number; key: string },
): Promise<PlanChangeResult> {
  const move = planMove({ from: input.from, to: input.to, live: input.live });
  if (move.direction === "same_plan") return { applied: false, reason: "same_plan" };
  if (!input.subscriptionId) return { applied: false, reason: "no_subscription" };
  if (!deps.subscriptions) return { applied: false, reason: "stripe_not_configured" };
  if (move.direction !== "up" && !deps.schedules) return { applied: false, reason: "stripe_not_configured" };
  try {
    const sub = (await deps.subscriptions.retrieve(input.subscriptionId)) as SubWithSchedule;
    const product = await deps.productFor(input.to);
    const newLines = planLines(input.to, input.live).map((l) => ({
      price_data: { currency: "gbp" as const, unit_amount: l.unitPence, recurring: { interval: "month" as const }, product },
      quantity: l.quantity,
      metadata: { forecourt_line: l.key },
    }));
    const recurring = sub.items.data.filter((i) => i.price?.recurring);
    const items: ItemChange[] = [...recurring.map((i) => ({ id: i.id, deleted: true as const })), ...newLines];
    if (move.direction === "up") {
      const proration = sub.status === "trialing" ? "none" : "create_prorations";
      await deps.subscriptions.update(input.subscriptionId, { items, proration_behavior: proration }, { idempotencyKey: `plan-change:${input.key}` });
      return { applied: true, mode: "now", proration, items };
    }
    if (sub.schedule) return { applied: false, reason: "already_scheduled", detail: typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id };
    const end = periodEnd(sub);
    if (!end) return { applied: false, reason: "no_period_end" };
    const schedules = deps.schedules!;
    const schedule = await schedules.create({ from_subscription: input.subscriptionId }, { idempotencyKey: `plan-change-schedule:${input.key}` });
    const start = schedule.phases?.[0]?.start_date ?? sub.current_period_start ?? end;
    const current = recurring.map((i) => ({ price: (i.price as { id?: string }).id, quantity: i.quantity ?? 1 }));
    await schedules.update(
      schedule.id,
      {
        end_behavior: "release",
        proration_behavior: "none",
        metadata: { kind: "plan_change", key: input.key, from: input.from, to: input.to },
        phases: [
          { start_date: start, end_date: end, items: current, proration_behavior: "none" },
          { start_date: end, items: newLines, iterations: 1, proration_behavior: "none", metadata: { forecourt_plan: input.to } },
        ],
      },
      { idempotencyKey: `plan-change-schedule-phases:${input.key}` },
    );
    return { applied: true, mode: "scheduled", proration: "none", scheduleId: schedule.id, effectiveAt: new Date(end * 1000).toISOString(), items };
  } catch (err) {
    return { applied: false, reason: "stripe_error", detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Cancelling a scheduled change: release the schedule so the subscription stays as it is. */
export async function releasePlanChangeSchedule(
  deps: Pick<PlanChangeDeps, "schedules">,
  scheduleId: string | null | undefined,
  changeId: number,
): Promise<{ released: boolean; reason?: string }> {
  if (!scheduleId) return { released: false, reason: "no_schedule" };
  if (!deps.schedules) return { released: false, reason: "stripe_not_configured" };
  try {
    await deps.schedules.release(scheduleId, { idempotencyKey: `plan-change-release:${changeId}` });
    return { released: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Already released or finished counts as released.
    if (/released|completed|canceled/i.test(msg)) return { released: true };
    return { released: false, reason: msg };
  }
}

/**
 * Is a scheduled plan change due to land? True once the period end has passed,
 * or Stripe shows the subscription off the schedule (it fired and released).
 */
export function scheduledChangeDue(row: { status: string; effective_at: string | null }, now: Date): boolean {
  if (row.status !== "scheduled" || !row.effective_at) return false;
  const at = Date.parse(row.effective_at);
  return Number.isFinite(at) && at <= now.getTime();
}

export type ScheduledRow = { id: number; tenant_id: number; to_plan: string; status: string; effective_at: string | null };
export type FinishDeps = {
  /** scheduled -> applied, only if still scheduled. True when this call won. */
  claim: (changeId: number) => Promise<boolean>;
  /** Set the account's plan (and its plan shape) to the new plan. */
  setPlan: (tenantId: number, to: PlanId) => Promise<void>;
};

/**
 * Lands a booked change once it is due: the webhook (subscription updated when
 * the schedule fires) and the daily cron both call this; only one wins.
 */
export async function finishScheduledChange(deps: FinishDeps, row: ScheduledRow, now: Date, toPlan: (p: string) => PlanId): Promise<"finished" | "not_due" | "lost_race"> {
  if (!scheduledChangeDue(row, now)) return "not_due";
  if (!(await deps.claim(row.id))) return "lost_race";
  await deps.setPlan(row.tenant_id, toPlan(row.to_plan));
  return "finished";
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
            name: `Forecourt ${PLANS[input.to].name} setup difference, inc. VAT`,
            description: `Moving from ${PLANS[input.from].name} to ${PLANS[input.to].name}. Once this is paid, our team sets up your change.`,
          },
        },
      },
    ],
    metadata: { kind: "plan_change", tenant_id: String(input.tenantId), change_id: String(input.changeId), from: input.from, to: input.to },
    invoice_creation: { enabled: true },
  };
}

export function planChangeMessage(r: PlanChangeResult, from: PlanId, to: PlanId): string {
  if (r.applied && r.mode === "scheduled") return `Change to ${PLANS[to].name} booked for ${formatUkDate(r.effectiveAt)}, the end of the billing month.`;
  if (r.applied) return `Plan changed from ${PLANS[from].name} to ${PLANS[to].name}. ${r.proration === "none" ? "New price from the next bill." : "Part month added to the next bill."}`;
  if (r.reason === "same_plan") return "Already on that plan.";
  if (r.reason === "already_scheduled") return "A change is already booked for this account. Cancel it first.";
  if (r.reason === "no_period_end") return "Stripe has no period end for this subscription, so nothing was booked.";
  if (r.reason === "no_subscription") return "No subscription on file, so only the plan was noted.";
  if (r.reason === "stripe_not_configured") return "Stripe is not set up here, nothing was changed in Stripe.";
  return `Stripe refused the change: ${r.detail ?? "unknown error"}`;
}
