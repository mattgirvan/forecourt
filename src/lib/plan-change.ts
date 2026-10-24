/**
 * Account type change (Site, Franchise, Group). Pure maths and rules, no I/O.
 *
 * Upgrade: the setup difference is paid up front and the new plan only turns
 * on once that payment succeeds. The monthly change is pro-rated.
 * Downgrade: no setup refund. DOWNGRADE_TIMING decides when the new price
 * applies. Confirmed by Matt: "period_end". Moving down to Site partway through a
 * 12-month Franchise or Group contract switches to the Site price at the end of
 * the current billing period; the customer does not have to finish the 12 months.
 */
import { PLANS, type PlanId } from "./catalog.ts";
import { formatUkDate } from "./uk-date.ts";
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
  if (plan === "site")
    return [{ key: "site_base", label: "Site", unitPence: PLANS.site.monthPence, quantity: 1 }];
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
  /**
   * What the customer pays a month today, the same figure as the account
   * header. Display only ("Your price until", "Was"); the maths above uses
   * oldMonthlyPence from the live site count.
   */
  currentMonthlyPence: number;
  /** Pro-rated charge (positive) or credit (negative) for the rest of this period. */
  proratedPence: number;
  /** Setup difference, paid when the change goes live. */
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
  currentMonthlyPence?: number | null;
}): PlanChangeQuote {
  const { from, to } = input;
  const direction = changeDirection(from, to);
  const live = Math.max(1, Math.floor(input.live));
  const oldMonthlyPence = planMonthlyPence(from, live);
  const newMonthlyPence = planMonthlyPence(to, live);
  const timing = input.downgradeTiming ?? DOWNGRADE_TIMING;
  const setupDiffPence =
    direction === "upgrade" ? Math.max(0, PLANS[to].setupPence - PLANS[from].setupPence) : 0;
  let fraction = 0;
  const start = input.periodStart ?? null;
  const end = input.periodEnd ?? null;
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (start != null && end != null && end > start)
    fraction = Math.min(1, Math.max(0, (end - now) / (end - start)));
  const atPeriodEnd = direction === "downgrade" && timing === "period_end";
  const proratedPence =
    direction === "same" || atPeriodEnd
      ? 0
      : Math.round((newMonthlyPence - oldMonthlyPence) * fraction);
  return {
    from,
    to,
    direction,
    setupDiffPence,
    oldMonthlyPence,
    newMonthlyPence,
    currentMonthlyPence: input.currentMonthlyPence ?? oldMonthlyPence,
    proratedPence,
    dueNowPence: setupDiffPence,
    effective: direction === "upgrade" ? "after_payment" : atPeriodEnd ? "period_end" : "now",
    periodEnd: end != null ? new Date(end * 1000).toISOString() : null,
  };
}

const gbp = (p: number) =>
  `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Plain lines for the confirm step. */
export function quoteLines(q: PlanChangeQuote): string[] {
  const name = (p: PlanId) => PLANS[p].name;
  if (q.direction === "same") return [`You are already on ${name(q.to)}.`];
  if (q.direction === "upgrade") {
    return [
      `Setup difference, paid when you send your request: ${gbp(q.setupDiffPence)} (inc. VAT)`,
      `Your new price of ${gbp(q.newMonthlyPence)} a month (inc. VAT) starts from the day your change goes live. The part month is added to your next bill.`,
    ];
  }
  const when =
    q.effective === "period_end"
      ? q.periodEnd
        ? `from ${ukDay(q.periodEnd)}`
        : "from your next bill"
      : "now";
  return [
    "No setup refund.",
    q.effective === "now"
      ? `Pro-rated credit on your next bill: ${gbp(-q.proratedPence)}`
      : "Nothing extra to pay this month, and no refund for part months.",
    `New monthly: ${gbp(q.newMonthlyPence)} (was ${gbp(q.oldMonthlyPence)}), ${when}`,
  ];
}

export function ukDay(iso: string | number | Date): string {
  return formatUkDate(iso);
}

/** Office dry run message for a plan change. Nothing is charged. */
export function planChangeDryRunMessage(q: PlanChangeQuote, now: Date = new Date()): string {
  const head = "Dry run. Nothing is charged and the plan is unchanged.";
  const monthly = gbp(q.newMonthlyPence);
  if (q.direction === "upgrade")
    return `${head} The customer would pay the setup difference first, then pay ${monthly} a month from the day the setup payment goes through.`;
  const when =
    q.effective === "period_end" && q.periodEnd
      ? ukDay(q.periodEnd)
      : q.effective === "period_end"
        ? "their next bill"
        : ukDay(now);
  return `${head} The customer would pay ${monthly} a month from ${when}.`;
}

/**
 * What the server says happened after "Move to" or "Pay". The panel always
 * shows one of these, so a confirm can never end in silence.
 */
export type PlanChangeOutcome = "applied" | "scheduled" | "checkout" | "awaiting_customer" | "recorded" | "unchanged" | "in_progress" | "failed";
export type PlanChangeTone = "success" | "pending" | "info" | "error";
export type PlanChangeFeedback = { tone: PlanChangeTone; title: string; body: string; link?: { word: string; href: string } };

/** Where "Plan" in the in progress message points: the customer tracker. */
export const PLAN_TRACKER_HREF = "#plan-change-tracker";

const PLAN_NAME: Record<PlanId, string> = { site: "Site", franchise: "Franchise", group: "Group" };

/** Customer copy when sync is off: the request is noted for the team, nothing is charged. */
export function planChangeRecordedMessage(q: PlanChangeQuote): string {
  return q.direction === "upgrade"
    ? `We have your request to move to ${PLAN_NAME[q.to]}. Nothing has been charged. We will send you the setup payment link and confirm by email before anything changes.`
    : `We have your request to move to ${PLAN_NAME[q.to]}. Nothing has changed yet. We will apply it and confirm by email.`;
}

/** Office copy when sync is off: plain English, no "dry run". */
export function planChangeOfficeRecordedMessage(q: PlanChangeQuote): string {
  return `Billing switch off: request to move to ${PLAN_NAME[q.to]} recorded, nothing charged. Noted on the file.`;
}

export const PLAN_CHANGE_NOT_RECORDED =
  "We could not record your request, so nothing has changed. Please try again, or send us a message.";

const TITLES: Record<PlanChangeOutcome, (to: string) => string> = {
  applied: (to) => `Moved to ${to}`,
  scheduled: (to) => `Move to ${to} booked`,
  checkout: () => "Opening the setup payment",
  awaiting_customer: () => "Awaiting customer payment",
  recorded: () => "Request recorded, we will apply it",
  unchanged: (to) => `Already on ${to}`,
  in_progress: () => "Plan change in progress",
  failed: () => "Plan not changed",
};

const TONE: Record<PlanChangeOutcome, PlanChangeTone> = {
  applied: "success",
  scheduled: "success",
  checkout: "pending",
  awaiting_customer: "pending",
  recorded: "pending",
  unchanged: "pending",
  in_progress: "info",
  failed: "error",
};

export function isPlanChangeOutcome(v: unknown): v is PlanChangeOutcome {
  return typeof v === "string" && v in TONE;
}

/** Server reply to the message the panel shows. Unknown or empty replies become a clear error. */
export function planChangeFeedback(
  r: { outcome?: unknown; message?: string | null } | null | undefined,
  to: PlanId,
): PlanChangeFeedback {
  const name = PLAN_NAME[to];
  const body = (r?.message ?? "").trim();
  if (!r || !isPlanChangeOutcome(r.outcome)) {
    return {
      tone: "error",
      title: "We could not confirm the change",
      body: body || "We did not get an answer, so we cannot say the plan changed. Refresh the page to check, or send us a message.",
    };
  }
  const fallback =
    r.outcome === "failed" ? PLAN_CHANGE_NOT_RECORDED : r.outcome === "checkout" ? "Taking you to the secure payment page." : "";
  const fb: PlanChangeFeedback = { tone: TONE[r.outcome], title: TITLES[r.outcome](name), body: body || fallback };
  if (r.outcome === "in_progress" && /\bPlan\b/.test(fb.body)) fb.link = { word: "Plan", href: PLAN_TRACKER_HREF };
  return fb;
}

/** A thrown error (network, server) as a message, never a silent close. */
export function planChangeErrorFeedback(e: unknown): PlanChangeFeedback {
  const msg = e instanceof Error ? e.message.trim() : "";
  return {
    tone: "error",
    title: "Plan not changed",
    body: msg || "Something went wrong, so nothing has changed. Please try again, or send us a message.",
  };
}

/**
 * The move described by its monthly price, not by plan rank. A move "down" a
 * plan can still cost more a month (Group at 2 sites to Franchise).
 */
export function monthlyMoveLine(q: PlanChangeQuote): string {
  const now = q.currentMonthlyPence;
  const next = q.newMonthlyPence;
  if (next > now)
    return `Your monthly price goes up to ${gbp(next)} from the day your change goes live. The part month is added to your next bill.`;
  const when =
    q.effective === "period_end"
        ? q.periodEnd
          ? `from ${formatUkDate(q.periodEnd)}`
          : "from your next bill"
        : "from today";
  if (next < now) return `Your monthly price drops to ${gbp(next)} ${when}`;
  return `Your monthly price stays at ${gbp(next)}`;
}

/** Office started a change with a setup difference: staff never pay, the customer gets the link. */
export function officePaymentLinkMessage(q: Pick<PlanChangeQuote, "to" | "setupDiffPence">, emailed: boolean): string {
  const amount = gbp(q.setupDiffPence);
  return emailed
    ? `We emailed the account admin a link to pay the ${amount} setup difference (inc. VAT) for the move to ${PLAN_NAME[q.to]}, with a copy to hello@. The request shows as Awaiting customer payment until they pay, or an owner marks it as paid.`
    : `Request saved as Awaiting customer payment for the move to ${PLAN_NAME[q.to]}. The email did not go, so ask the admin to open their account and press Pay, or resend from the file.`;
}

/** Confirm sheet for Mark as paid. Owner only; the server checks again. */
export function markPaidSheet(d: { from: string; to: string; setupDiffPence: number }) {
  return {
    title: `Mark ${gbp(d.setupDiffPence)} as paid?`,
    body: `Only for money that reached us another way, like a bank transfer. This records you and the time, closes the customer's open payment page, and sends the move from ${d.from} to ${d.to} to the team as paid, with the invoice and ticket as normal.`,
    confirmLabel: "Mark as paid",
    cancelLabel: "Not yet",
    // Neutral white primary: recording money is not a customer action (Atlas).
    tone: "neutral" as const,
  };
}
