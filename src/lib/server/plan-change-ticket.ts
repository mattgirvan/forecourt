/**
 * Plan change ticket and staff apply or reject (plan change flow PR 4).
 * Pure flow behind injected deps, so it is tested with Stripe and the
 * database mocked.
 *
 * A support_items ticket (kind "change", change_type "plan_change") opens
 * when a request is paid, is requested with £0 setup, or is a price drop or
 * equal swap. plan_changes.support_item_id links it, and is only set once.
 *
 * Apply (Forecourt team): sets go_live_at, switches the plan and advances the
 * tracker. The new monthly price starts from go live:
 *  - sync on: a price rise swaps in Stripe now and the part month goes on the
 *    next bill; a drop or equal swap books (or keeps) the period end schedule.
 *  - sync off: Stripe is not touched and staff get a plain instruction to set
 *    the price by hand.
 * Reject (owner only, a staff click): refunds the setup difference through the
 * same Stripe refund call and idempotency key as Office billing refunds, then
 * closes the request. The plan is not changed.
 */
import { PLANS, type PlanId } from "../catalog.ts";
import { planMove, partMonthPence } from "../plan-change-rules.ts";

export type TicketChange = {
  id: number;
  tenant_id: number;
  from_plan: PlanId;
  to_plan: PlanId;
  status: string;
  direction: string;
  setup_diff_pence: number;
  new_monthly_pence: number;
  effective_at?: string | null;
  support_item_id?: number | null;
  payment_intent_id?: string | null;
  stripe_schedule_id?: string | null;
  requested_by?: string | null;
};

/** Statuses that open a ticket. pending_payment waits for the webhook. */
export const TICKET_STATUSES = ["paid", "requested", "scheduled"] as const;
/** Statuses Apply or Reject can act on. */
export const ACTIONABLE = ["paid", "requested", "scheduled"] as const;

const name = (p: PlanId) => PLANS[p].name;
export const gbp = (pence: number) => `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: pence % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

export function ticketTitle(c: Pick<TicketChange, "from_plan" | "to_plan">): string {
  return `Plan change: ${name(c.from_plan)} to ${name(c.to_plan)}`;
}

export function ticketDetails(c: TicketChange): string {
  const lines = [`Move from ${name(c.from_plan)} to ${name(c.to_plan)}.`];
  if (c.status === "paid") lines.push(`Setup difference of ${gbp(c.setup_diff_pence)} paid (inc. VAT).`);
  else lines.push("No setup difference to pay.");
  lines.push(`New monthly price ${gbp(c.new_monthly_pence)} (inc. VAT).`);
  if (c.effective_at) lines.push(`Price changes at period end, ${day(c.effective_at)}.`);
  else lines.push("New price starts on the go live day.");
  lines.push("Apply when the change is set up, or Reject.");
  return lines.join(" ");
}

/**
 * Waiting on customer (staff never pay): a request with a setup difference opens the
 * same plan_change ticket while it is pending_payment, with no action for staff
 * (needs_reply false) and the normal title. "Waiting" is state, not text: the linked
 * plan_changes row is pending_payment. Paid swaps in the normal ticket and cancelled
 * or expired closes it. Both run only for the single winner of the plan_changes status
 * claim, and only while the ticket is still submitted with no reply needed, so retries
 * never repeat or undo anything.
 */
export const NOT_PAID_SUFFIX = ", not paid";
export const WAITING_LABEL = "Waiting on customer";

export function officeFileLink(tenantId: number): string {
  return `/office?tab=customers&id=${tenantId}&pane=billing`;
}

/** The system message on a waiting ticket (Atlas wording). */
const WAITING_MARKER = "Nothing to do yet. The customer pays ";

/** The waiting system message on a waiting ticket. The Office pane shows it in the grey box, so the
 *  thread skips it (it is not from the dealer); the Tickets list keeps it as the row preview. */
export function isWaitingSystemMessage(i: { change_type?: string | null; status: string; waiting_on_customer?: boolean; details?: string | null }): boolean {
  return isWaitingTicket(i) && !!i.details?.startsWith(WAITING_MARKER);
}

export function waitingTicketDetails(c: Pick<TicketChange, "setup_diff_pence">): string {
  return `Nothing to do yet. The customer pays ${gbp(c.setup_diff_pence)} (inc. VAT) from the email or their account, then this moves on by itself. It closes if the request is cancelled or expires.`;
}

export function notPaidDetails(c: TicketChange, reason: "cancelled" | "expired"): string {
  return `Closed: the setup difference of ${gbp(c.setup_diff_pence)} (inc. VAT) was not paid and the request ${reason === "expired" ? "expired" : "was cancelled"}. The plan is unchanged. Nothing to do.`;
}

/** A plan change ticket whose request still waits on the customer. waiting_on_customer comes from plan_changes.status. */
export function isWaitingTicket(i: { change_type?: string | null; status: string; waiting_on_customer?: boolean | null }): boolean {
  return i.change_type === "plan_change" && i.status === "submitted" && i.waiting_on_customer === true;
}

/**
 * Customers never see a plan change ticket whose setup difference is unpaid: waiting
 * (pending_payment) or closed as not paid (cancelled before payment, which only
 * happens from pending_payment). Once paid, the normal visibility applies.
 */
export function hiddenFromCustomer(c: { status: string; setup_diff_pence?: number | null }): boolean {
  return (c.setup_diff_pence ?? 0) > 0 && (c.status === "pending_payment" || c.status === "cancelled");
}

/** Ticket ids to hide from a customer, from the linked plan_changes rows. */
export function customerHiddenIds(rows: { support_item_id: number | null; status: string; setup_diff_pence?: number | null }[]): Set<number> {
  return new Set(rows.filter((r) => r.support_item_id != null && hiddenFromCustomer(r)).map((r) => r.support_item_id as number));
}

/** The ticket guard for both moves: still submitted and nothing asked of staff. */
export const WAITING_TICKET_GUARD = { status: "submitted", needs_reply: false } as const;

const waitingDue = (c: TicketChange) => c.status === "pending_payment" && (c.setup_diff_pence ?? 0) > 0;

export type TicketDeps = {
  insertItem: (row: { tenant_id: number; kind: "change"; change_type: "plan_change"; title: string; details: string; status: "submitted"; needs_reply: boolean; created_by: string }) => Promise<{ id: number } | null>;
  /** Paid: swap in the normal ticket, only while the ticket matches WAITING_TICKET_GUARD. */
  promote?: (itemId: number, patch: { details: string; needs_reply: true }) => Promise<boolean>;
  /** Set support_item_id only if it is still empty. True when this call won. */
  link: (changeId: number, itemId: number) => Promise<boolean>;
  /** Drop an item that lost the link race. */
  removeItem: (itemId: number) => Promise<void>;
};

/** Open the ticket once. Returns the linked item id, or null when not due. Never throws. */
export async function openTicket(deps: TicketDeps, c: TicketChange): Promise<number | null> {
  const waiting = waitingDue(c);
  if (!waiting && !(TICKET_STATUSES as readonly string[]).includes(c.status)) return null;
  if (c.support_item_id) {
    // Paid state only (plan_changes.status), and the caller is the single claim winner.
    if (c.status === "paid" && (c.setup_diff_pence ?? 0) > 0 && deps.promote) {
      try {
        await deps.promote(c.support_item_id, { details: ticketDetails(c), needs_reply: true });
      } catch {
        /* the ticket is there either way */
      }
    }
    return c.support_item_id;
  }
  try {
    const item = await deps.insertItem({
      tenant_id: c.tenant_id,
      kind: "change",
      change_type: "plan_change",
      title: ticketTitle(c),
      details: waiting ? waitingTicketDetails(c) : ticketDetails(c),
      status: "submitted",
      needs_reply: !waiting,
      created_by: c.requested_by ?? "",
    });
    if (!item) return null;
    if (await deps.link(c.id, item.id)) return item.id;
    await deps.removeItem(item.id);
    return null;
  } catch {
    return null;
  }
}

export type CloseDeps = {
  /** Close only while the ticket matches WAITING_TICKET_GUARD. True when this call won. */
  close: (itemId: number, patch: { status: "declined"; title: string; details: string; needs_reply: false }) => Promise<boolean>;
};

/** Cancelled or expired before payment: close the waiting ticket once. Never throws. */
export async function closeWaitingTicket(deps: CloseDeps, c: TicketChange, reason: "cancelled" | "expired"): Promise<boolean> {
  // Cancelled state only (plan_changes.status): a paid or live request never closes here.
  if (!c.support_item_id || c.status !== "cancelled") return false;
  try {
    return await deps.close(c.support_item_id, {
      status: "declined",
      title: `${ticketTitle(c)}${NOT_PAID_SUFFIX}`,
      details: notPaidDetails(c, reason),
      needs_reply: false,
    });
  } catch {
    return false;
  }
}

export type StripeApply =
  | { applied: true; mode: "now" | "scheduled"; scheduleId?: string; effectiveAt?: string }
  | { applied: false; reason: string; detail?: string };

export type ApplyDeps = {
  syncOn: boolean;
  now: () => Date;
  /** live sites, for the per site Group price. */
  live: number;
  subscriptionId: string | null;
  /** current billing period end (ISO), for the part month. */
  periodEnd: string | null;
  periodStart: string | null;
  /** PR 2 applyPlanChange. Only called with sync on. */
  stripeApply: (key: string) => Promise<StripeApply>;
  /** Compare and set from the read status. True when this call won. */
  claim: (from: string, patch: Record<string, unknown>) => Promise<boolean>;
  switchPlan: () => Promise<void>;
  /** Tracker stages; must dedupe itself. */
  advanceTracker: (goLiveAt: string) => Promise<void>;
  ticketStatus: (status: "in_progress" | "done" | "declined", message: string) => Promise<void>;
};

export type ApplyResult = { ok: true; message: string; manualPrice: string | null } | { ok: false; message: string };

/** Plain staff instruction when sync is off. */
export function manualPriceInstruction(c: TicketChange, opts: { goLiveAt: string; live: number; periodStart: string | null; periodEnd: string | null }): string {
  const move = planMove({ from: c.from_plan, to: c.to_plan, live: opts.live });
  const monthly = gbp(move.newMonthlyPence);
  if (move.monthlyStarts === "period_end") {
    const when = c.effective_at ?? opts.periodEnd;
    return `Plan sync is off. In Stripe, change the price to ${monthly} a month (inc. VAT) from the next billing period${when ? `, ${day(when)}` : ""}. No refund for the part month.`;
  }
  const part =
    opts.periodStart && opts.periodEnd
      ? partMonthPence(move, Date.parse(opts.goLiveAt), Date.parse(opts.periodStart), Date.parse(opts.periodEnd))
      : null;
  return `Plan sync is off. In Stripe, change the price to ${monthly} a month (inc. VAT) from today, ${day(opts.goLiveAt)}, and add the part month${part != null ? ` of ${gbp(part)}` : ""} to the next bill.`;
}

export async function applyTicket(deps: ApplyDeps, c: TicketChange): Promise<ApplyResult> {
  if (!(ACTIONABLE as readonly string[]).includes(c.status)) return { ok: false, message: `This request is ${c.status}, so there is nothing to apply.` };
  const goLiveAt = deps.now().toISOString();
  let manualPrice: string | null = null;
  const patch: Record<string, unknown> = { go_live_at: goLiveAt, applied_at: goLiveAt };
  let nextStatus = "applied";
  if (!deps.syncOn) {
    manualPrice = manualPriceInstruction(c, { goLiveAt, live: deps.live, periodStart: deps.periodStart, periodEnd: deps.periodEnd });
  } else if (c.status === "scheduled" && c.stripe_schedule_id) {
    // Already booked in Stripe at request time. The schedule moves the price at period end.
    nextStatus = "scheduled";
  } else {
    const r = await deps.stripeApply(`plan-change-apply:${c.id}`);
    if (!r.applied && r.reason !== "no_subscription") return { ok: false, message: `Stripe did not take the change (${r.reason}${r.detail ? `: ${r.detail}` : ""}). Nothing was applied.` };
    if (r.applied && r.mode === "scheduled") {
      nextStatus = "scheduled";
      patch.stripe_schedule_id = r.scheduleId ?? null;
      patch.effective_at = r.effectiveAt ?? null;
    }
    if (!r.applied) manualPrice = "No Stripe subscription on this file, so no price was changed. Set it in Stripe by hand if they are billed.";
  }
  if (!(await deps.claim(c.status, { ...patch, status: nextStatus }))) return { ok: false, message: "Someone else has just acted on this request. Refresh to see it." };
  await deps.switchPlan();
  await deps.advanceTracker(goLiveAt);
  const priced =
    manualPrice ?? (nextStatus === "scheduled" ? "The new price starts at period end, booked in Stripe." : "The new price starts today. The part month goes on the next bill.");
  await deps.ticketStatus("in_progress", `Applied. Plan is now ${name(c.to_plan)}. ${priced}`);
  return { ok: true, message: `Applied. ${name(c.to_plan)} is live from today.`, manualPrice };
}

export type RejectDeps = {
  role: string | null;
  /** stripe.refunds.create with the Office refund idempotency key. Null without Stripe. */
  refund: ((paymentIntent: string, key: string) => Promise<{ id: string }>) | null;
  /** PR 2 schedule release. */
  releaseSchedule: (scheduleId: string) => Promise<{ released: boolean; reason?: string }>;
  claim: (from: string, patch: Record<string, unknown>) => Promise<boolean>;
  closeTracker: () => Promise<void>;
  ticketStatus: (status: "declined", message: string) => Promise<void>;
};

/** Same key as Office billing refunds, so one payment can only be refunded once. */
export const refundKey = (paymentIntent: string) => `forecourt-refund-${paymentIntent}`;

export async function rejectTicket(deps: RejectDeps, c: TicketChange, reason: string): Promise<{ ok: boolean; message: string }> {
  if (deps.role !== "owner") return { ok: false, message: "Only an owner can reject a plan change and refund it." };
  if (!(ACTIONABLE as readonly string[]).includes(c.status)) return { ok: false, message: `This request is ${c.status}, so there is nothing to reject.` };
  const why = reason.trim() || "Not going ahead.";
  let refundId: string | null = null;
  if (c.status === "paid" && c.setup_diff_pence > 0) {
    if (!c.payment_intent_id) return { ok: false, message: "No payment is recorded on this request, so nothing was refunded. Refund in Stripe by hand, then reject." };
    if (!deps.refund) return { ok: false, message: "Stripe is not connected on the server, so nothing was refunded or rejected." };
    try {
      refundId = (await deps.refund(c.payment_intent_id, refundKey(c.payment_intent_id))).id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe refused the refund.";
      if (!/already been refunded/i.test(msg)) return { ok: false, message: `${msg} Nothing was rejected.` };
    }
  }
  if (c.status === "scheduled" && c.stripe_schedule_id) {
    const rel = await deps.releaseSchedule(c.stripe_schedule_id);
    if (!rel.released) return { ok: false, message: `Could not release the Stripe schedule (${rel.reason ?? "unknown"}). Nothing was rejected.` };
  }
  const refunded = c.status === "paid" && c.setup_diff_pence > 0;
  const won = await deps.claim(c.status, { status: refunded ? "refunded" : "cancelled", rejected_reason: why, refund_id: refundId });
  if (!won) return { ok: false, message: "Someone else has just acted on this request. Refresh to see it." };
  await deps.closeTracker();
  const line = refunded ? `Rejected and ${gbp(c.setup_diff_pence)} refunded.` : "Rejected. Nothing was charged.";
  await deps.ticketStatus("declined", `${line} ${why}`);
  return { ok: true, message: `${line} The plan was not changed.` };
}
