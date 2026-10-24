/**
 * Live view (account page once a desk is live): labels, status rules and the
 * site details we can derive. Pure module, no `@/` imports, so it can be unit
 * tested with plain `node --test`. Copy follows the Live view design spec.
 */
import { formatUkDate } from "./uk-date.ts";

export type SupportKind = "ticket" | "change";
export type TicketStatus = "open" | "in_progress" | "resolved";
export type ChangeStatus = "submitted" | "in_progress" | "done" | "declined";
export type SupportStatus = TicketStatus | ChangeStatus;
export type ChangeType = "new_page" | "content_tweak" | "add_staff" | "other";

export const TICKET_STATUSES: readonly TicketStatus[] = ["open", "in_progress", "resolved"];
export const CHANGE_STATUSES: readonly ChangeStatus[] = [
  "submitted",
  "in_progress",
  "done",
  "declined",
];

export const STATUS_LABEL: Record<SupportStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  submitted: "Submitted",
  done: "Done",
  declined: "Not going ahead",
};

export const CHANGE_TYPES: readonly { id: ChangeType; label: string; hint: string }[] = [
  { id: "new_page", label: "New page", hint: "A new page on your site" },
  {
    id: "content_tweak",
    label: "Content or branding tweak",
    hint: "Words, photos, colours or logo",
  },
  { id: "add_staff", label: "Add staff member", hint: "Give someone access to the desk" },
  { id: "other", label: "Other", hint: "Anything else" },
];

/**
 * Type label for a ticket row. Anything that is not a ticket or a change
 * request reads "Question", never "Other" (slice 11 tweak).
 */
export function itemTypeLabel(i: { kind: string; ref: number; change_type: string | null }) {
  if (i.kind === "ticket") return `Ticket ${ticketRef(i.ref)}`;
  if (i.kind === "change") return changeTypeLabel(i.change_type);
  return "Question";
}

export function changeTypeLabel(t: string | null | undefined) {
  // Opened by the plan change flow, never picked by a customer.
  if (t === "plan_change") return "Plan change";
  return CHANGE_TYPES.find((c) => c.id === t)?.label ?? "Other";
}

export function isChangeType(v: unknown): v is ChangeType {
  return CHANGE_TYPES.some((c) => c.id === v);
}

export function validStatus(kind: SupportKind, s: unknown): s is SupportStatus {
  return kind === "ticket"
    ? (TICKET_STATUSES as readonly unknown[]).includes(s)
    : (CHANGE_STATUSES as readonly unknown[]).includes(s);
}

/** Green pill on the customer side. Amber is never used there. */
export function statusTone(s: SupportStatus): "done" | "strong" | "neutral" {
  if (s === "resolved" || s === "done") return "done";
  if (s === "in_progress") return "strong";
  return "neutral";
}

/** Still open for the Office queue (not resolved, done or declined). */
export function isOpenStatus(s: SupportStatus) {
  return s === "open" || s === "submitted" || s === "in_progress";
}

export function ticketRef(ref: number | null | undefined) {
  return ref ? `T-${ref}` : "T-";
}

/** The desk is live: the account page switches to the Live view. */
export function isLiveTenant(
  t: { stage?: string | null; status?: string | null } | null | undefined,
) {
  return Boolean(t && (t.stage === "live" || t.status === "live"));
}

/** Add whole months, clamping to the month end (31 Jan + 1 month = 28 or 29 Feb). */
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  const out = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes()),
  );
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out.toISOString();
}

export type SiteDetails = {
  /** Web address the desk runs on, or null before the domain is connected. */
  domain: string | null;
  /** When it went live: sign off date, else the first move to the Live stage. */
  goLiveAt: string | null;
  /** Next annual renewal: go live plus 12 months, rolling forward each year. */
  renewsAt: string | null;
  contractMonths: number | null;
};

export function siteDetails(input: {
  domain?: string | null;
  signedOffAt?: string | null;
  liveStageAt?: string | null;
  contractMonths: number | null;
  now?: Date;
}): SiteDetails {
  const domain = (input.domain ?? "").trim() || null;
  const goLiveAt = input.signedOffAt || input.liveStageAt || null;
  const renewsAt = goLiveAt ? nextRenewal(goLiveAt, input.now ?? new Date()) : null;
  return { domain, goLiveAt, renewsAt, contractMonths: input.contractMonths };
}

/** Every plan renews every 12 months from go live (Matt, 23 Oct 2026). The first anniversary still ahead of now. */
export const RENEWAL_MONTHS = 12;
export function nextRenewal(goLiveAt: string, now: Date): string {
  for (let n = 1; n < 200; n++) {
    const at = addMonths(goLiveAt, RENEWAL_MONTHS * n);
    if (new Date(at) > now) return at;
  }
  return addMonths(goLiveAt, RENEWAL_MONTHS);
}

export const CHANGE_COPY = "Unlimited change requests, included in your plan.";
export const STAFF_COPY = "Unlimited staff logins, included in your plan.";
export const REPLY_TIME_COPY = "We usually reply within one working day.";

/** en-GB gives "Sept"; house style is "Sep". */
const sep = (s: string) => s.replace("Sept", "Sep");

export const PAYMENT_BANNER =
  "Your last payment didn't go through. It happens. Your site is still live. Update your card in billing and we'll try again automatically.";

export function ukDate(iso: string | null | undefined) {
  return sep(formatUkDate(iso));
}

/**
 * One line preview for a ticket row: the latest message, else the opening
 * details, with line breaks and runs of spaces folded to single spaces.
 * The row truncates it with an ellipsis (slice 11).
 */
export function lastLine(i: { details?: string | null; last_line?: string | null; messages?: { body: string }[] }) {
  const latest = i.messages?.length ? i.messages[i.messages.length - 1].body : (i.last_line ?? i.details ?? "");
  return latest.replace(/\s+/g, " ").trim();
}

/** "Today, 09:12", "Yesterday" or "12 Oct". */
export function updatedWhen(iso: string, now = new Date()) {
  const d = new Date(iso);
  const key = (x: Date) => x.toLocaleDateString("en-GB", { timeZone: "Europe/London" });
  if (key(d) === key(now))
    return `Today, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}`;
  if (key(d) === key(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return sep(
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }),
  );
}

/** What Plan and billing shows. All read from Stripe, never typed in our UI. */
export type BillingSummary = {
  connected: boolean;
  planName: string;
  monthlyPence: number | null;
  nextPaymentAt: string | null;
  card: { brand: string; last4: string } | null;
  pastDue: boolean;
  /** When Stripe retries a failed payment, if it is retrying. */
  retryAt: string | null;
  canManage: boolean;
};

export function cardLabel(card: BillingSummary["card"]) {
  if (!card) return "None on file";
  const brand = card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : "Card";
  return `${brand} ending ${card.last4}`;
}

export type SeatMember = { name: string; email: string; role: string };

export function seatsUsed(members: SeatMember[]) {
  return members.filter((m) => (m.name || m.email).trim()).length;
}

/** Banner for a manager: they cannot open billing, so point them at the owner. */
export const PAYMENT_BANNER_MANAGER =
  "Your last payment didn't go through. It happens. Your site is still live. The account owner can update the card in billing and we'll try again automatically.";

export const ACCESS_COPY =
  "Managers see the plan, billing summary, tickets and change requests, and can raise and reply to them. Only you can manage billing or change who has access.";

export const MANAGER_COPY =
  "You have manager access. Billing and account access are looked after by the account owner.";
