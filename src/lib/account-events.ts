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

export function monthlyStartedEvent(d: { tenantId: number; subscriptionId: string; totalPence?: number | null; startedAt?: string | Date }): AccountEvent {
  const on = ukDate(new Date(d.startedAt ?? Date.now()).toISOString());
  const plan = d.totalPence != null ? `Your monthly plan of ${money(d.totalPence)} a month started on ${on}.` : `Your monthly plan started on ${on}.`;
  return {
    kind: "monthly_started",
    title: "Monthly billing has started",
    lines: [`${plan} The monthly fee starts at go live or 180 days after payment, whichever comes first.`, "Receipts are in your account under Billing."],
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
/** One key per site add, whoever sends it (Office or the desk hook), so it emails once. */
export function siteAddedKey(tenantId: number, siteCode: string): string {
  return `site-added:${tenantId}:${siteCode.trim().toLowerCase()}`;
}

export function siteAddedEvent(d: { tenantId: number; siteCode: string; siteName: string; addsPence: number; totalAfterPence: number }): AccountEvent {
  const preview =
    d.addsPence > 0
      ? `From its go live day this adds ${money(d.addsPence)} a month, bringing your monthly total to ${money(d.totalAfterPence)}. Until then it is not billed.`
      : `It is included in your plan, so your monthly total stays at ${money(d.totalAfterPence)} when it goes live.`;
  return {
    kind: "site_added",
    title: `${d.siteName} added`,
    lines: [`${d.siteName} was added to your Forecourt desk. Adding a site has no setup fee.`, preview],
    dedupe: siteAddedKey(d.tenantId, d.siteCode),
  };
}

/** What the bill did when a site was archived or restored in the desk (from changeSiteState). */
export type DeskBilling = {
  from: string;
  to: string;
  beforePence: number;
  afterPence: number;
  plan: string;
  periodEnd: string | null;
  samePeriod: boolean;
} | null;

function staysReason(b: NonNullable<DeskBilling>, archiving: boolean): string {
  if (archiving && b.from === "setting_up") return ", because it was not live yet";
  if (!archiving && b.to === "setting_up") return ", until it goes live";
  if (b.plan === "group") return ", because Group already bills a 2 site minimum";
  if (b.plan === "franchise") return ", because Franchise includes up to 5 sites";
  return "";
}

/** A site was archived in the desk. The bill follows automatically (SITE_BILLING_SYNC). */
export function siteRemovedEvent(d: { eventKey: string; siteName: string; by?: string; billing?: DeskBilling }): AccountEvent {
  const b = d.billing ?? null;
  const when = b?.periodEnd ? ukDate(b.periodEnd) : "the end of this billing period";
  const money2 = (p: number) => money(p);
  const bill = !b
    ? "You can restore it in your desk within 30 days."
    : b.afterPence < b.beforePence
      ? `Your bill goes down by one site from ${when}. We don't refund part months. You can restore it in your desk within 30 days.`
      : `Your bill stays at ${money2(b.afterPence)} a month${staysReason(b, true)}. You can restore it in your desk within 30 days.`;
  return {
    kind: "site_removed",
    title: `${d.siteName} archived`,
    lines: [`${d.siteName} was archived on your Forecourt desk${d.by ? ` by ${d.by}` : ""}.`, bill],
    dedupe: `site-removed:${d.eventKey}`,
  };
}

export function siteRestoredEvent(d: { eventKey: string; siteName: string; by?: string; billing?: DeskBilling }): AccountEvent {
  const b = d.billing ?? null;
  let bill: string;
  if (!b) bill = "";
  else if (b.to === "setting_up") bill = "It is still setting up, so it is billed from its go live day.";
  else if (b.samePeriod) bill = "Its archive is cancelled and it stays on your bill as before.";
  else if (b.afterPence > b.beforePence) bill = `It goes back on your bill from today, so your monthly total is ${money(b.afterPence)}. The part month is added to the next invoice.`;
  else bill = `It goes back on your desk from today. Your bill stays at ${money(b.afterPence)} a month${staysReason(b, false)}.`;
  return {
    kind: "site_restored",
    title: `${d.siteName} restored`,
    lines: [`${d.siteName} was restored on your Forecourt desk${d.by ? ` by ${d.by}` : ""}.`, bill].filter(Boolean),
    dedupe: `site-restored:${d.eventKey}`,
  };
}

export function staffAccessEvent(d: { eventKey: string; email: string; allSites: boolean | null; sites: string[]; siteNames: Record<string, string>; by?: string }): AccountEvent {
  const names = d.sites.map((c) => d.siteNames[c] ?? c);
  const now = d.allSites ? "All sites" : names.length ? names.join(", ") : "no sites";
  return {
    kind: "staff_access_changed",
    title: `Site access changed for ${d.email}`,
    lines: [`${d.email} can now see: ${now}.`, d.by ? `Changed by ${d.by} on your Forecourt desk.` : "Changed on your Forecourt desk."],
    dedupe: `staff-access:${d.eventKey}`,
  };
}
