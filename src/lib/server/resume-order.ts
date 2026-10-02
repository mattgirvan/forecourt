/**
 * Resume order: put a refunded or cancelled file back on the desk.
 *
 * Staff mark a file refunded or cancelled; that holds the journey emails and
 * stops go live from starting the monthly plan (billing-start.ts). Resume
 * undoes the desk side only. It never charges a card: any money owed is
 * collected with a payment link staff choose to send, and any new monthly
 * subscription is an explicit choice that waits for go live.
 *
 * Pure (no framework or `@/` imports) so it can be unit tested with node --test.
 */
import { tenantEnded } from "./billing-start.ts";
import { subscriptionEnded } from "./checkout-guard.ts";
import { ownSessions } from "./refund-target.ts";

/** A Stripe Checkout session on this file, as Resume needs it. */
export type ResumeSession = {
  id: string;
  /** "payment" (60-day trial, or a balance link) or "subscription" (setup plus monthly). */
  mode: string;
  payment_status: string;
  amount_total?: number | null;
  subscription?: string | null;
  /** Unix seconds. */
  created: number;
  /** Our checkout metadata kind: trial, subscription, convert, or balance. */
  kind?: string | null;
};

/** Money that actually moved on one payment, read from Stripe. */
export type PaymentFacts = {
  paidPence: number;
  refundedPence: number;
  refunds: { id: string; amountPence: number; created: number }[];
};

export type SkippedSession = { id: string; reason: string };

/**
 * Which sessions count towards what the site owes and paid: the current
 * package only, never a flagged duplicate. Same rule as Office Refund
 * (ownSessions in refund-target.ts).
 */
export function sessionsThatCount(
  sessions: ResumeSession[],
  opts: { duplicateSessionIds?: Iterable<string>; endedAt?: (number | null | undefined)[] } = {},
): { counted: ResumeSession[]; skipped: SkippedSession[] } {
  const { own, skipped } = ownSessions(sessions, opts);
  return { counted: own, skipped };
}

export type Balance = {
  /** What the package costs in one-off payments so far. */
  duePence: number;
  /** Card payments that went through, before refunds. */
  paidPence: number;
  refundedPence: number;
  /** Paid minus refunded. */
  netPaidPence: number;
  /** Due minus net paid, never below zero. */
  owedPence: number;
  /** Net paid above what is due (rare). */
  creditPence: number;
  /** True when no payment has gone through at all, so due comes from the order. */
  neverPaid: boolean;
  /** A payment could not be read from Stripe, so owed cannot be trusted. Never show it as £0. */
  unknown: boolean;
};

/**
 * Balance owed now. Due is what the counted package checkouts charged (the
 * trial fee, the setup, a conversion). If nothing was ever paid, due is the
 * amount on the order the file was opened for. Balance links pay down what
 * is owed and are never part of what is due.
 */
export function balanceOwed(input: {
  counted: ResumeSession[];
  facts: Record<string, PaymentFacts | undefined>;
  orderAmountPence?: number | null;
  /** Set when Stripe could not be read for some payment. */
  unknown?: boolean;
}): Balance {
  let due = 0;
  let paid = 0;
  let refunded = 0;
  let packagePaid = 0;
  let missing = Boolean(input.unknown);
  for (const s of input.counted) {
    const f = input.facts[s.id];
    if (!f && (s.amount_total ?? 0) > 0) missing = true;
    const paidHere = f ? f.paidPence : (s.amount_total ?? 0);
    const refundedHere = Math.min(f ? f.refundedPence : 0, paidHere);
    paid += paidHere;
    refunded += refundedHere;
    if (s.kind !== "balance") {
      due += s.amount_total ?? paidHere;
      packagePaid += 1;
    }
  }
  const neverPaid = packagePaid === 0;
  if (neverPaid) due = Math.max(0, input.orderAmountPence ?? 0);
  const net = paid - refunded;
  return {
    duePence: due,
    paidPence: paid,
    refundedPence: refunded,
    netPaidPence: net,
    owedPence: Math.max(0, due - net),
    creditPence: Math.max(0, net - due),
    neverPaid,
    unknown: missing,
  };
}

/** Money in pounds, with pence only when there are some. No dashes. */
export function gbp(pence: number) {
  const pounds = pence / 100;
  return `£${pounds.toLocaleString("en-GB", {
    minimumFractionDigits: pence % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export type TimelineEvent = {
  kind: string;
  stage: string | null;
  title?: string | null;
  created_at: string;
};

/** Internal timeline titles that record the stage when a file was ended. */
/** Timeline title for a balance payment link staff made from Resume order. */
export const BALANCE_LINK_TITLE = "Payment link sent";

export const ENDED_EVENT_TITLES = ["Package refunded", "Package ended"] as const;

export type StagePick = {
  stage: string;
  source: "moved_after" | "recorded" | "history" | "current" | "default";
  /** Plain English for the panel and the note. */
  why: string;
};

/**
 * The stage to resume at. Refund and cancel never move the stage, so:
 * 1. if staff moved the stage after the file was ended, their latest move wins;
 * 2. otherwise the stage recorded when it was ended;
 * 3. otherwise the last stage on the timeline before it was ended;
 * 4. otherwise the stage on the file now, or paid, or briefing.
 */
export function resumeStage(input: {
  currentStage: string | null | undefined;
  endedAt: string | null | undefined;
  events: TimelineEvent[];
  validStages: readonly string[];
  anyPaid: boolean;
  label?: (stage: string) => string;
}): StagePick {
  const label = input.label ?? ((s: string) => s);
  const valid = (s: string | null | undefined): s is string => Boolean(s && input.validStages.includes(s));
  const byTime = [...input.events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const endedMarks = byTime.filter(
    (e) => e.kind === "billing" && ENDED_EVENT_TITLES.includes((e.title ?? "") as (typeof ENDED_EVENT_TITLES)[number]),
  );
  const lastMark = endedMarks[endedMarks.length - 1] ?? null;
  const endedAtMs = lastMark ? Date.parse(lastMark.created_at) : input.endedAt ? Date.parse(input.endedAt) : NaN;
  const stageMoves = byTime.filter((e) => e.kind === "stage" && valid(e.stage));
  if (!Number.isNaN(endedAtMs)) {
    const after = stageMoves.filter((e) => Date.parse(e.created_at) > endedAtMs);
    const latest = after[after.length - 1];
    if (latest && valid(latest.stage)) {
      return { stage: latest.stage, source: "moved_after", why: `staff moved it to ${label(latest.stage)} after it was ended` };
    }
  }
  if (lastMark && valid(lastMark.stage)) {
    return { stage: lastMark.stage, source: "recorded", why: `the stage it was at when it was ended` };
  }
  if (!Number.isNaN(endedAtMs)) {
    const before = stageMoves.filter((e) => Date.parse(e.created_at) <= endedAtMs);
    const latest = before[before.length - 1];
    if (latest && valid(latest.stage)) {
      return { stage: latest.stage, source: "history", why: `the last stage on the timeline before it was ended` };
    }
  }
  if (valid(input.currentStage)) {
    return { stage: input.currentStage, source: "current", why: "the stage on the file now" };
  }
  const fallback = input.anyPaid ? "paid" : "briefing";
  return { stage: valid(fallback) ? fallback : (input.validStages[0] ?? fallback), source: "default", why: "nothing recorded, so the first stage" };
}

/** The package status after resuming, the same values a paid checkout sets. */
export function resumeStatus(input: {
  billing: string | null | undefined;
  stage: string;
  signedOffAt?: string | null;
}): "live" | "trial" | "subscribed" {
  if (input.signedOffAt || input.stage === "live") return "live";
  return input.billing === "trial" ? "trial" : "subscribed";
}

/**
 * Order rows the refund or cancel touched go back to what Stripe shows. A
 * fully refunded order stays refunded: the money is gone.
 */
export function orderStatusAfterResume(
  orderStatus: string | null | undefined,
  sessionPaid: boolean,
  fullyRefunded = false,
): string | null {
  if (orderStatus !== "refunded" && orderStatus !== "cancelled") return null;
  if (fullyRefunded) return orderStatus === "refunded" ? null : "refunded";
  return sessionPaid ? "paid" : "pending";
}

export type SubscriptionNow = {
  id: string;
  status: string;
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
  trial_end?: number | null;
  current_period_end?: number | null;
};

export type SubscriptionPlan =
  | { kind: "none_needed"; text: string }
  | { kind: "running"; text: string }
  | { kind: "set_to_cancel"; text: string; subscriptionId: string }
  /** Still live in Stripe (unpaid, paused, incomplete): not ended, so nothing new is set up. */
  | { kind: "alive_other"; text: string }
  | { kind: "ended"; text: string; canCreate: boolean; createBlocked?: string; start: MonthlyStart; monthlyPence: number }
  | { kind: "unknown"; text: string };

function day(unix: number | null | undefined) {
  if (!unix) return null;
  return new Date(unix * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}

/** The latest a new subscription could start: 180 days from today, shown to staff before they tick. */
export function latestStartFrom(now: Date, days: number): { unix: number; label: string } {
  const unix = Math.floor(now.getTime() / 86_400_000) * 86_400 + days * 86_400;
  return { unix, label: day(unix)! };
}

/** A London calendar day, YYYY-MM-DD, for comparing days. */
function londonDayKey(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

/**
 * When a monthly set up on Resume starts. The 180 days count from the
 * site's ORIGINAL first payment, never from the resume date.
 * - first payment + 180 days still ahead: the monthly waits until then (or go live if sooner);
 * - that day is today or has passed: the monthly starts now and the first month is charged on resume.
 * With no payment on record the 180 days count from today.
 */
export type MonthlyStart =
  | { kind: "future"; trialEnd: number; date: string; text: string }
  | { kind: "now"; text: string };

export function monthlyStartOnResume(input: {
  /** Unix seconds of the first payment in the current package, or null if none. */
  firstPaidUnix: number | null | undefined;
  now: Date;
  days: number;
  monthlyLabel: string;
}): MonthlyStart {
  const nowUnix = Math.floor(input.now.getTime() / 1000);
  if (!input.firstPaidUnix) {
    const l = latestStartFrom(input.now, input.days);
    return {
      kind: "future",
      trialEnd: l.unix,
      date: l.label,
      text: `Monthly ${input.monthlyLabel} starts on ${l.label} (${input.days} days from today, as no first payment is on record), or at go live if that is sooner.`,
    };
  }
  const startUnix = input.firstPaidUnix + input.days * 86_400;
  if (londonDayKey(startUnix) <= londonDayKey(nowUnix)) {
    return {
      kind: "now",
      text: `Monthly ${input.monthlyLabel} starts today, because ${input.days} days from their first payment has passed. The first month is charged when you resume.`,
    };
  }
  const date = day(startUnix)!;
  return {
    kind: "future",
    trialEnd: startUnix,
    date,
    text: `Monthly ${input.monthlyLabel} starts on ${date} (${input.days} days from their first payment), or at go live if that is sooner.`,
  };
}

/** What Resume can do about the monthly plan, in words staff can act on. */
export function subscriptionPlan(input: {
  billing: string | null | undefined;
  subscription: SubscriptionNow | null;
  /** True when a stored subscription id could not be read from Stripe. */
  lookupFailed?: boolean;
  hadSubscription: boolean;
  stage: string;
  customerId: string | null | undefined;
  monthlyLabel: string;
  /** The old subscription's Stripe product, which a new subscription reuses. */
  productId?: string | null;
  /** Every other subscription on the Stripe customer that is not ended. */
  otherLive?: { id: string; status: string }[];
  /** True when the customer's subscriptions could not be listed. */
  listFailed?: boolean;
  /** When a new subscription would start (monthlyStartOnResume). */
  start: MonthlyStart;
  monthlyPence: number;
  /** A card on file (the old subscription's), needed to charge the first month now. */
  hasCard?: boolean;
}): SubscriptionPlan {
  const sub = input.subscription;
  if (input.lookupFailed) {
    return { kind: "unknown", text: "Could not read the monthly subscription from Stripe. Resume changes nothing in Stripe. Check it there by hand." };
  }
  if (!sub && !input.hadSubscription && input.billing === "trial") {
    return { kind: "none_needed", text: "60-day trial: there is no monthly subscription, so nothing changes in Stripe." };
  }
  if (sub && (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due")) {
    if (sub.cancel_at_period_end || sub.cancel_at) {
      const when = day(sub.cancel_at ?? sub.current_period_end ?? null);
      return {
        kind: "set_to_cancel",
        subscriptionId: sub.id,
        text: `The ${input.monthlyLabel} a month subscription is still ${sub.status === "trialing" ? "waiting for go live" : sub.status} but is set to cancel${when ? ` on ${when}` : ""}. Tick below to undo the cancel so it carries on. Nothing is charged by undoing it.`,
      };
    }
    const waiting = sub.status === "trialing" ? ` It waits for go live${day(sub.trial_end) ? ` (or ${day(sub.trial_end)} at the latest)` : ""}.` : "";
    return { kind: "running", text: `The ${input.monthlyLabel} a month subscription is still running, so nothing changes in Stripe.${waiting}` };
  }
  if (sub && !subscriptionEnded(sub.status)) {
    return {
      kind: "alive_other",
      text: `The ${input.monthlyLabel} a month subscription is ${sub.status} in Stripe, so it still counts as live. Resume will not touch it or set up another one. Sort it out in Stripe.`,
    };
  }
  const gone = sub ? `was fully cancelled in Stripe (status ${sub.status})` : input.hadSubscription ? "is gone from Stripe" : "was never set up";
  const live = input.otherLive ?? [];
  const blocked = input.listFailed
    ? "Could not check the customer's other subscriptions in Stripe, so a new one will not be set up from here."
    : live.length
      ? `This customer already has a live subscription in Stripe (${live.map((l) => `${l.id}, ${l.status}`).join("; ")}). Resume will not set up a second one.`
      : !input.customerId
        ? "There is no Stripe customer on this file, so a new subscription cannot be set up from here."
        : input.stage === "live" && input.start.kind === "future"
          ? "The site is already live but 180 days from their first payment have not passed, so a monthly that waits for go live does not fit. Set it up in Stripe by hand."
          : !input.productId
            ? "There is no earlier subscription to copy the monthly price from, so set it up in Stripe by hand."
            : input.start.kind === "now" && !input.hasCard
              ? "The first month would be charged today, but there is no card on file from the old subscription. Set the monthly up in Stripe by hand."
              : undefined;
  const when =
    input.start.kind === "now"
      ? `that starts today and charges the first month now, because 180 days from their first payment has passed`
      : `that starts when you mark the site Live, or on ${input.start.date} at the latest (180 days from their first payment)`;
  return {
    kind: "ended",
    canCreate: !blocked,
    createBlocked: blocked,
    start: input.start,
    monthlyPence: input.monthlyPence,
    text: `The ${input.monthlyLabel} a month subscription ${gone}. A cancelled subscription cannot be restarted. You can tick below to set up a new ${input.monthlyLabel} a month subscription ${when}. Or leave it and nothing is billed until you choose.`,
  };
}

export type ResumeChoice = {
  undoCancel: boolean;
  newSubscription: boolean;
  /** Owner tick, required before the first month is charged on resume. */
  customerAgreed?: boolean;
};

/** The owner tick that must be on before Resume charges a first month. */
export const CUSTOMER_AGREED_LABEL = "The customer has agreed to restart monthly billing";

/** Where Resume puts the package, in plain words. */
export function backOnPhrase(newStatus: string): string {
  if (newStatus === "trial") return "put them back on their 60-day trial";
  if (newStatus === "live") return "put them back to Live";
  return "put them back on the monthly plan";
}

/** The owed amount in plain words, for the panel. */
export function owedSentence(b: Balance): string {
  if (b.unknown) return "Some payments could not be read from Stripe, so the amount owed is unknown. Check Stripe before collecting anything.";
  if (b.neverPaid) {
    return b.owedPence > 0
      ? `No card payment has gone through on Stripe for this file, so the full ${gbp(b.owedPence)} on its order is owed.`
      : "No card payment has gone through on Stripe for this file, and nothing is due.";
  }
  if (b.refundedPence > 0) {
    return `After the ${gbp(b.refundedPence)} refund they have ${gbp(b.netPaidPence)} with us, so ${b.owedPence > 0 ? `${gbp(b.owedPence)} is owed` : "nothing is owed"}.`;
  }
  if (b.owedPence > 0) return `They have ${gbp(b.netPaidPence)} with us against ${gbp(b.duePence)}, so ${gbp(b.owedPence)} is owed.`;
  return `Nothing was refunded in Stripe, so they still have ${gbp(b.netPaidPence)} with us and nothing is owed.`;
}

/** Pence charged on confirm: the first month, only when the owner ticked a monthly that starts today. */
export function chargeNowPence(plan: SubscriptionPlan, choice: ResumeChoice): number {
  return plan.kind === "ended" && plan.canCreate && choice.newSubscription && plan.start.kind === "now" ? plan.monthlyPence : 0;
}

/**
 * The main button. A first month charged today is charged, not owed, so it
 * reads "Resume and charge £399 today (£4,500 still owed)".
 */
export function resumeButtonLabel(b: Balance, firstMonthNowPence = 0): string {
  if (firstMonthNowPence > 0) {
    const charge = `Resume and charge ${gbp(firstMonthNowPence)} today`;
    if (b.unknown) return `${charge} (amount owed unknown)`;
    return b.owedPence > 0 ? `${charge} (${gbp(b.owedPence)} still owed)` : charge;
  }
  if (b.unknown) return "Resume (amount owed unknown)";
  return b.owedPence > 0 ? `Resume with ${gbp(b.owedPence)} owed` : "Resume order";
}

/** True when the main button must wait for the customer-agreed tick. */
export function needsCustomerAgreement(plan: SubscriptionPlan, choice: ResumeChoice): boolean {
  return chargeNowPence(plan, choice) > 0 && !choice.customerAgreed;
}

/** A Stripe error from charging the first month, in words staff can act on. Nothing changed in every case. */
export function chargeErrorMessage(err: { code?: string | null; decline_code?: string | null; message?: string | null; type?: string | null }): string {
  const code = err.code ?? "";
  const decline = err.decline_code ?? "";
  if (code === "authentication_required" || decline === "authentication_required" || code === "subscription_payment_intent_requires_action") {
    return "The bank wants the customer to approve this payment themselves, so it cannot be charged now. Nothing changed. Untick the monthly, resume, and send the customer a payment link instead.";
  }
  if (code === "card_declined" || err.type === "StripeCardError") {
    return `The card on file was declined${decline ? ` (${decline.replace(/_/g, " ")})` : ""}. Nothing changed. Ask the customer to update their card, or send them a payment link.`;
  }
  return `Stripe did not set up the monthly (${err.message ?? "unknown error"}). Nothing changed.`;
}

/** The plain list of what Resume will do, shown before staff confirm. */
export function resumeSteps(input: {
  status: string;
  stage: StagePick;
  stageLabel: string;
  newStatus: string;
  balance: Balance;
  plan: SubscriptionPlan;
  choice: ResumeChoice;
}): string[] {
  const steps = [
    `Clear the ${input.status} flag and ${backOnPhrase(input.newStatus)}.`,
    `Put the order at ${input.stageLabel}: ${input.stage.why}.`,
    "Write a timeline event and an internal note with who resumed it, when, and these amounts.",
    chargeNowPence(input.plan, input.choice) > 0
      ? "Journey emails and the You're live email work again from the next stage move. The only email sent now is the first month notice below."
      : "Journey emails and the You're live email work again from the next stage move. Nothing is emailed by resuming.",
  ];
  if (input.plan.kind === "set_to_cancel") {
    steps.push(input.choice.undoCancel ? "Undo the cancel on the monthly subscription in Stripe. No charge." : "Leave the monthly subscription set to cancel.");
  } else if (input.plan.kind === "ended") {
    const p = input.plan;
    steps.push(
      input.choice.newSubscription && p.canCreate
        ? p.start.kind === "now"
          ? `Set up a new ${gbp(p.monthlyPence)} monthly subscription in Stripe that starts today. The first ${gbp(p.monthlyPence)} month is charged to the card on file now, because 180 days from their first payment has passed. The customer is emailed about the charge.`
          : `Set up a new monthly subscription in Stripe that starts at go live, or on ${p.start.date} at the latest (180 days from their first payment). Nothing is charged today.`
        : "No monthly subscription is set up. Nothing is billed until you choose.",
    );
  }
  steps.push(
    input.balance.unknown
      ? "The amount owed could not be checked in Stripe. Resuming does not charge the balance. Check Stripe before collecting."
      : input.balance.owedPence > 0
        ? `${gbp(input.balance.owedPence)} is still owed. Resuming does not charge it. Send the payment link above if you want it collected.`
        : "Nothing is owed, so no payment is needed.",
  );
  return steps;
}

/** Idempotency: resuming a file that is not ended does nothing. */
export function resumeDecision(status: string | null | undefined): "resume" | "noop" {
  return tenantEnded(status) ? "resume" : "noop";
}

/** The internal note and timeline line. Who, when, and the money. */
export function resumeNote(input: {
  actor: string;
  at: Date;
  from: string;
  toStatus: string;
  stageLabel: string;
  balance: Balance;
  stripe: string[];
}): string {
  const when = input.at.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const b = input.balance;
  const money = b.unknown
    ? `Amount owed unknown: Stripe could not be read for every payment. Paid before refunds ${gbp(b.paidPence)}, refunded ${gbp(b.refundedPence)}.`
    : b.neverPaid
    ? `No card payment has gone through on this file. ${gbp(b.duePence)} due, ${gbp(b.owedPence)} owed.`
    : `Paid before refunds ${gbp(b.paidPence)}, refunded ${gbp(b.refundedPence)}, package price so far ${gbp(b.duePence)}, owed now ${gbp(b.owedPence)}.`;
  return [
    `Resumed by ${input.actor} on ${when} (UK time). Was ${input.from}, now ${input.toStatus} at ${input.stageLabel}.`,
    money,
    ...input.stripe,
  ]
    .filter(Boolean)
    .join(" ");
}

export type ResumeDeps = {
  /** Stripe: undo a cancel. Called with a fixed idempotency key. */
  undoCancel: (subscriptionId: string, params: { cancel_at_period_end: false } | { cancel_at: "" }, idempotencyKey: string) => Promise<void>;
  /**
   * Save this attempt and its Stripe key before Stripe is called. Every
   * attempt gets a fresh key, so Stripe never replays an earlier attempt's
   * response (a rolled-back subscription or a declined card).
   */
  recordAttempt?: (idempotencyKey: string) => Promise<void>;
  /**
   * Stripe: a new monthly subscription. Must re-read it after creating and
   * refuse unless it is active or trialing. Returns its id.
   */
  createSubscription: (idempotencyKey: string) => Promise<{ id: string; line: string }>;
  /** Rollback step 1: refund any first month this call charged. Returns a line for the message, or null if nothing was charged. */
  refundFirstMonth?: (subscriptionId: string) => Promise<string | null>;
  /** Rollback step 2: cancel the subscription this call set up. Already cancelled counts as done. */
  cancelSubscription?: (subscriptionId: string) => Promise<void>;
  /** After a resume that charged a first month: tell the customer (journey engine, deduped). Returns a line for the message. */
  notifyCharge?: (subscriptionId: string) => Promise<string>;
  /** Conditional write: only a file still refunded or cancelled is changed. True if this call changed it. */
  claim: (patch: Record<string, unknown>) => Promise<boolean>;
  setOrderStatus: (orderId: number, status: string) => Promise<void>;
  timeline: (body: string, stage: string) => Promise<void>;
  note: (body: string) => Promise<void>;
  log: (msg: string, data: Record<string, unknown>) => void;
};

export type ResumeInput = {
  tenantId: number;
  status: string | null | undefined;
  expectStatus: string;
  owner: boolean;
  actor: string;
  now: Date;
  /** cancelled_at, part of the Stripe idempotency keys. */
  endedAt: string | null | undefined;
  plan: SubscriptionPlan;
  subscription: Pick<SubscriptionNow, "cancel_at_period_end"> | null;
  choice: ResumeChoice;
  newStatus: string;
  newStatusLabel: string;
  stage: string;
  stageLabel: string;
  balance: Balance;
  orders: { id: number; status: string | null; sessionPaid: boolean; fullyRefunded?: boolean }[];
  /** A fresh id per attempt from the panel; part of the Stripe key. */
  attemptId?: string;
};

export type ResumeResult = { ok: true; noop: boolean; message: string };

/**
 * Resume, in the safe order: refuse a stale panel, do any Stripe change (a
 * fresh key per attempt for a new subscription), then a conditional write
 * so only one request resumes the file, then the orders, timeline and note.
 * If the desk write fails, the new subscription is rolled back: refund
 * first, then cancel.
 */
export const OWNER_ONLY_MESSAGE = "Only an owner can resume an order. Nothing was changed.";

export async function executeResume(deps: ResumeDeps, input: ResumeInput): Promise<ResumeResult> {
  if (!input.owner) throw new Error(OWNER_ONLY_MESSAGE);
  if (resumeDecision(input.status) === "noop") {
    deps.log("[resume] no-op, already active", { tenantId: input.tenantId, status: input.status, by: input.actor });
    return { ok: true, noop: true, message: "This order is already active. Nothing changed." };
  }
  if (input.status !== input.expectStatus) {
    throw new Error("This file changed since you opened the panel. Nothing was changed. Open Resume order again.");
  }
  const undo = input.choice.undoCancel && input.plan.kind === "set_to_cancel";
  const create = input.choice.newSubscription && input.plan.kind === "ended";
  if (create && input.plan.kind === "ended" && !input.plan.canCreate) {
    throw new Error(input.plan.createBlocked ?? "Cannot set up a subscription from here.");
  }
  const chargesNow = create && input.plan.kind === "ended" && input.plan.start.kind === "now";
  if (chargesNow && !input.choice.customerAgreed) {
    throw new Error(`Tick "${CUSTOMER_AGREED_LABEL}" before the first month is charged. Nothing changed.`);
  }
  if (create && !/^[A-Za-z0-9-]{8,64}$/.test(input.attemptId ?? "")) {
    throw new Error("This try has no attempt id, so Stripe was not called. Nothing changed. Open Resume order again.");
  }
  const endKey = input.endedAt ? Date.parse(input.endedAt) || 0 : 0;
  const lines: string[] = [];
  let newSubscriptionId: string | null = null;
  if (undo && input.plan.kind === "set_to_cancel") {
    const params = input.subscription?.cancel_at_period_end === false ? ({ cancel_at: "" } as const) : ({ cancel_at_period_end: false } as const);
    await deps.undoCancel(input.plan.subscriptionId, params, `forecourt-resume-undo-${input.plan.subscriptionId}-${endKey}`);
    lines.push(`Undid the cancel on subscription ${input.plan.subscriptionId}. No charge.`);
  }
  if (create) {
    const key = resumeSubscriptionKey(input.tenantId, endKey, input.attemptId!);
    // Saved before the call; if it cannot be saved, Stripe is not called.
    if (deps.recordAttempt) await deps.recordAttempt(key);
    const sub = await deps.createSubscription(key);
    newSubscriptionId = sub.id;
    lines.push(sub.line);
  }
  const patch: Record<string, unknown> = { status: input.newStatus, cancelled_at: null, stage: input.stage };
  if (newSubscriptionId) patch.stripe_subscription_id = newSubscriptionId;
  let claimed: boolean;
  try {
    claimed = await deps.claim(patch);
  } catch (e) {
    // The desk write failed, so nothing points at the new subscription. Roll
    // it back rather than leave a second live one behind: refund first, then
    // cancel. A false claim is different: another request resumed the file,
    // so it is left alone.
    if (newSubscriptionId) throw new Error(await rollBack(deps, input.tenantId, newSubscriptionId, e, chargesNow));
    throw e;
  }
  if (!claimed) {
    deps.log("[resume] no-op, resumed by another request", { tenantId: input.tenantId, by: input.actor });
    return { ok: true, noop: true, message: "This order was already resumed. Nothing changed." };
  }
  for (const o of input.orders) {
    const next = orderStatusAfterResume(o.status, o.sessionPaid, o.fullyRefunded);
    if (next) await deps.setOrderStatus(o.id, next);
  }
  const body = resumeNote({
    actor: input.actor,
    at: input.now,
    from: input.status ?? "",
    toStatus: input.newStatusLabel,
    stageLabel: input.stageLabel,
    balance: input.balance,
    stripe: lines,
  });
  try {
    await deps.timeline(body, input.stage);
  } catch {
    /* best effort */
  }
  try {
    await deps.note(body);
  } catch {
    /* best effort */
  }
  let notice = "";
  if (chargesNow && newSubscriptionId && deps.notifyCharge) {
    try {
      notice = ` ${await deps.notifyCharge(newSubscriptionId)}`;
    } catch {
      notice = " The customer was not emailed about the charge. Tell them yourself.";
    }
  }
  deps.log("[resume] resumed", {
    tenantId: input.tenantId,
    from: input.status,
    to: input.newStatus,
    stage: input.stage,
    owed: input.balance.owedPence,
    by: input.actor,
  });
  const owed = input.balance.unknown
    ? " The amount owed could not be checked in Stripe. Check it there before collecting."
    : input.balance.owedPence > 0 ? ` ${gbp(input.balance.owedPence)} is still owed. Send a payment link if you want it collected.` : "";
  return {
    ok: true,
    noop: false,
    message: `Resumed. Now ${input.newStatusLabel} at ${input.stageLabel}. Journey emails work again from the next stage move.${lines.length ? ` ${lines.join(" ")}` : ""}${notice}${owed}`,
  };
}

/** The Stripe key for one attempt: tenant, the end being resumed, and a fresh attempt id. */
export function resumeSubscriptionKey(tenantId: number, endKey: number, attemptId: string) {
  return `forecourt-resume-sub-${tenantId}-${endKey}-${attemptId}`;
}

/** Undo a subscription set up by a resume whose desk write failed. Returns the message to show. */
async function rollBack(deps: ResumeDeps, tenantId: number, subscriptionId: string, cause: unknown, charged: boolean): Promise<string> {
  const why = cause instanceof Error ? cause.message : String(cause);
  let refundLine: string | null = null;
  let refundError: string | null = null;
  if (deps.refundFirstMonth) {
    try {
      refundLine = await deps.refundFirstMonth(subscriptionId);
    } catch (re) {
      refundError = re instanceof Error ? re.message : String(re);
    }
  }
  let cancelError: string | null = null;
  if (deps.cancelSubscription) {
    try {
      await deps.cancelSubscription(subscriptionId);
    } catch (ce) {
      cancelError = ce instanceof Error ? ce.message : String(ce);
    }
  } else {
    cancelError = "no cancel step";
  }
  deps.log("[resume] desk write failed, rolled back", { tenantId, subscription: subscriptionId, refundError, cancelError, refunded: Boolean(refundLine) });
  const head = `Resume failed (${why}), so nothing changed on the desk.`;
  const refund = refundError
    ? ` The first month charged on subscription ${subscriptionId} could NOT be refunded (${refundError}). Refund it in Stripe now.`
    : refundLine
      ? ` ${refundLine}`
      : charged
        ? ` No first month payment was found on subscription ${subscriptionId} to refund. Check it in Stripe now.`
        : "";
  const cancel = cancelError
    ? ` Subscription ${subscriptionId} could NOT be cancelled (${cancelError}). Cancel it in Stripe now.`
    : ` Subscription ${subscriptionId} was cancelled.`;
  const next = refundError || cancelError || (charged && !refundLine) ? "" : " Nothing is left in Stripe. You can try again.";
  return `${head}${refund}${cancel}${next}`;
}
