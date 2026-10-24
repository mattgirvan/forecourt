import { STATUS_LABEL, changeTypeLabel, ticketRef, type SupportKind, type SupportStatus } from "./live-view.ts";
import { formatUkDate } from "./uk-date.ts";
import { WAITING_LABEL, isWaitingTicket } from "./server/plan-change-ticket.ts";

/** Ticket detail chip (slice 12): amber only when it waits on us, green when solved, grey otherwise. */
export function ticketChip(i: { status: SupportStatus; needs_reply: boolean; change_type?: string | null; waiting_on_customer?: boolean | null }): { tone: "action" | "live" | "neutral"; label: string } {
  // A plan change waiting for the customer to pay: grey, staff have nothing to do.
  if (!i.needs_reply && isWaitingTicket(i)) return { tone: "neutral", label: WAITING_LABEL };
  if (i.needs_reply) return { tone: "action", label: "Waiting on us" };
  if (i.status === "resolved") return { tone: "live", label: "Solved" };
  if (i.status === "done") return { tone: "live", label: STATUS_LABEL.done };
  return { tone: "neutral", label: STATUS_LABEL[i.status] };
}

/** "T-1038, opened 19 Oct 2026". */
export function ticketMeta(i: { kind: SupportKind | string; ref: number; change_type: string | null; created_at: string }) {
  const what = i.kind === "ticket" ? ticketRef(i.ref) : changeTypeLabel(i.change_type);
  return `${what}, opened ${formatUkDate(i.created_at)}`;
}
