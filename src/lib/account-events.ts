/**
 * Account event confirmations: the words and dedupe keys, no I/O. Every event
 * here goes to the account admin AND hello@forecourt.me (sendAccountEventEmail).
 */
import { PLANS, type PlanId } from "./catalog.ts";

export type AccountEvent = { kind: string; title: string; lines: string[]; dedupe: string };

const money = (p: number) => `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function siteLiveEvent(d: { tenantId: number; eventKey: string; siteName: string; billing: string }): AccountEvent {
  return {
    kind: "site_live",
    title: `${d.siteName} is live`,
    lines: [`${d.siteName} went live on your Forecourt desk.`, d.billing],
    dedupe: `site-live:${d.eventKey}`,
  };
}

export function ukDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).replace("Sept", "Sep");
}

export function siteArchivedEvent(d: { tenantId: number; eventKey: string; siteName: string; billing: string; periodEnd?: string | null }): AccountEvent {
  const when = d.periodEnd ? `${ukDate(d.periodEnd)}, the end of this billing period` : "the end of this billing period";
  return {
    kind: "site_archived",
    title: `${d.siteName} archived`,
    lines: [`${d.siteName} has been archived.`, `Your bill goes down by one site from ${when}. We don't refund part months. You can restore it within 30 days.`, d.billing].filter(Boolean),
    dedupe: `site-archived:${d.eventKey}`,
  };
}

export function planChangedEvent(d: { tenantId: number; changeKey: string; from: PlanId; to: PlanId; newMonthlyPence: number; when: string }): AccountEvent {
  return {
    kind: "plan_changed",
    title: `Account type changed to ${PLANS[d.to].name}`,
    lines: [`Your account moved from ${PLANS[d.from].name} to ${PLANS[d.to].name}.`, `New monthly: ${money(d.newMonthlyPence)}, ${d.when}.`],
    dedupe: `plan-changed:${d.changeKey}`,
  };
}

export function monthlyStartedEvent(d: { tenantId: number; subscriptionId: string }): AccountEvent {
  return {
    kind: "monthly_started",
    title: "Monthly billing has started",
    lines: [
      "Your monthly plan has started. It starts at go live or 180 days after payment, whichever comes first, and your desk is now live.",
      "Receipts are in your account under Billing.",
    ],
    dedupe: `monthly-started:tenant:${d.tenantId}:sub:${d.subscriptionId}`,
  };
}

export function managerAddedEvent(d: { tenantId: number; memberId: number; email: string; by: string }): AccountEvent {
  return {
    kind: "access_added",
    title: "New access to your account",
    lines: [`${d.email} was invited to your Forecourt account${d.by ? ` by ${d.by}` : ""}.`],
    dedupe: `access-added:${d.tenantId}:${d.memberId}`,
  };
}

export function managerRemovedEvent(d: { tenantId: number; memberId: number; email: string; by: string }): AccountEvent {
  return {
    kind: "access_removed",
    title: "Access removed from your account",
    lines: [`${d.email || "A manager"} no longer has access to your Forecourt account${d.by ? ` (removed by ${d.by})` : ""}.`],
    dedupe: `access-removed:${d.tenantId}:${d.memberId}`,
  };
}

/**
 * A site was added in the desk. The price preview says what it adds once it
 * goes live (setting up sites are not billed). Sent from the desk event hook.
 */
export function siteAddedEvent(d: { tenantId: number; eventKey: string; siteName: string; addsPence: number; totalAfterPence: number }): AccountEvent {
  const preview =
    d.addsPence > 0
      ? `From its go live day this adds ${money(d.addsPence)} a month, bringing your monthly total to ${money(d.totalAfterPence)}. Until then it is not billed.`
      : `It is included in your plan, so your monthly total stays at ${money(d.totalAfterPence)} when it goes live.`;
  return {
    kind: "site_added",
    title: `${d.siteName} added`,
    lines: [`${d.siteName} was added to your Forecourt desk. Adding a site has no setup fee.`, preview],
    dedupe: `site-added:${d.eventKey}`,
  };
}
