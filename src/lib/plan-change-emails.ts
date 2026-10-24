/**
 * Plan change emails (PR 5): words and dedupe keys only, no I/O. Sent through the
 * journey engine (sendAccountEventEmail), deduped in email_log per request and stage.
 * hello@forecourt.me gets a copy of the request and payment emails only.
 * Copy rules: UK dates, prices inc. VAT, no dashes.
 */
import { PLANS, type PlanId } from "./catalog.ts";
import { ukDate, type AccountEvent } from "./account-events.ts";

export type PlanChangeEmailStage = "received" | "receipt" | "applied" | "scheduled" | "rejected" | "reminder" | "payment_link";
export type PlanChangeEmail = AccountEvent & { office: boolean; link?: { url: string; label: string } };

export const PLAN_CHANGE_EMAIL_STAGES: readonly PlanChangeEmailStage[] = ["received", "receipt", "applied", "scheduled", "rejected", "reminder", "payment_link"];
/** Office copies: each request and each payment confirmation. */
const OFFICE_COPY: Record<PlanChangeEmailStage, boolean> = { received: true, receipt: true, applied: false, scheduled: false, rejected: false, reminder: false, payment_link: true };

export function planChangeKey(changeId: number, stage: PlanChangeEmailStage): string {
  return `plan-change:${changeId}:${stage}`;
}

const gbp = (p: number) => `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export type PlanChangeEmailInput = {
  changeId: number;
  from: PlanId;
  to: PlanId;
  stage: PlanChangeEmailStage;
  /** Setup difference in pence (paid, refunded or owed). */
  setupPence?: number;
  /** New monthly price in pence, inc. VAT. */
  newMonthlyPence?: number;
  /** A drop or equal swap: the price moves at period end. */
  atPeriodEnd?: boolean;
  periodEnd?: string | null;
  goLiveAt?: string | null;
  invoiceUrl?: string | null;
  refunded?: boolean;
  /** payment_link: the Stripe Checkout page the Forecourt team opened for the customer. */
  payUrl?: string | null;
};

export function planChangeEmail(d: PlanChangeEmailInput): PlanChangeEmail {
  const from = PLANS[d.from].name;
  const to = PLANS[d.to].name;
  const monthly = d.newMonthlyPence ? `${gbp(d.newMonthlyPence)} a month (inc. VAT)` : null;
  const endDay = d.periodEnd ? `, on ${ukDate(d.periodEnd)}` : "";
  const setup = d.setupPence ? `${gbp(d.setupPence)} (inc. VAT)` : null;
  const track = "You can follow each step under Plan in your account.";
  let title: string;
  let lines: string[];
  let link: PlanChangeEmail["link"];
  switch (d.stage) {
    case "received":
      title = "Plan change request received";
      lines = [
        `We have your request to move from ${from} to ${to}.`,
        d.atPeriodEnd
          ? `There is nothing to pay. Your plan switches when the team applies your change. Your new price${monthly ? ` of ${monthly}` : ""} starts at the end of this billing period${endDay}. Until then you pay your current price.`
          : "There is nothing to pay. We will set up your change and email you on the day it goes live.",
        ...(!d.atPeriodEnd && monthly ? [`Your new price of ${monthly} starts from the day your change goes live. The part month is added to your next bill.`] : []),
        track,
      ];
      break;
    case "receipt":
      title = "Payment received for your plan change";
      lines = [
        `Thank you. We have received ${setup ?? "your payment"}, the setup difference for your move from ${from} to ${to}.`,
        `Your new price${monthly ? ` of ${monthly}` : ""} starts from the day your change goes live. We will email you when it does.`,
        track,
      ];
      if (d.invoiceUrl) link = { url: d.invoiceUrl, label: "View your invoice" };
      break;
    case "applied":
      title = `Your move to ${to} is live`;
      lines = [
        `Your move from ${from} to ${to} is done. Your account is now on ${to}.`,
        `Your new price${monthly ? ` of ${monthly}` : ""} started ${d.goLiveAt ? `on ${ukDate(d.goLiveAt)}, ` : ""}the day your change went live. The part month is added to your next bill.`,
      ];
      break;
    case "scheduled":
      title = `Your move to ${to} is done`;
      lines = [
        `Your account is now on ${to}. Your new price${monthly ? ` of ${monthly}` : ""} starts at the end of this billing period${endDay}.`,
        "Until then you pay your current price.",
        "There is no charge and no refund for the part month.",
      ];
      break;
    case "rejected":
      title = "Your plan change is not going ahead";
      lines = [
        `We are not able to go ahead with your move from ${from} to ${to}, so your account stays on ${from}.`,
        d.refunded && setup
          ? `We have refunded the setup difference of ${setup} to your card. It can take 5 to 10 working days to show.`
          : "Nothing was charged.",
        "If you have any questions, reply to this email.",
      ];
      break;
    case "reminder":
      title = "Your plan change is waiting for payment";
      lines = [
        `You started a move from ${from} to ${to}, but the setup difference${setup ? ` of ${setup}` : ""} was not paid, so your request was not sent.`,
        "Nothing has changed on your account. You can start again any time under Plan in your account.",
      ];
      break;
    case "payment_link":
      title = "Your plan change is ready to pay";
      lines = [
        `The Forecourt team has set up your move from ${from} to ${to}. To send it ahead, pay the setup difference${setup ? ` of ${setup}` : ""}.`,
        `Your new price${monthly ? ` of ${monthly}` : ""} starts from the day your change goes live. The part month is added to your next bill.`,
        "If the payment link has stopped working, open your account and press Pay under Plan. It opens a fresh page for the same amount.",
        "Paying by bank transfer instead? Reply to this email and we will mark it as paid when it arrives.",
      ];
      if (d.payUrl) link = { url: d.payUrl, label: "Pay the setup difference" };
      break;
  }
  return { kind: "plan_change", title, lines, dedupe: planChangeKey(d.changeId, d.stage), office: OFFICE_COPY[d.stage], ...(link ? { link } : {}) };
}
