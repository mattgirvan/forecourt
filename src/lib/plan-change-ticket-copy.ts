/** Office plan change ticket copy (PR 4). Plain text, so it is unit tested. */
export type TicketSheetView = {
  from: string;
  to: string;
  setupPaid: string | null;
  newMonthly: string;
  monthlyStarts: "on_go_live" | "period_end" | "never";
  effectiveAt: string | null;
  syncOn: boolean;
};

export const ticketDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

/** Confirm sheet wording for the shared #70 sheet (askConfirm). */
export function applySheet(v: TicketSheetView) {
  const price =
    v.monthlyStarts === "on_go_live"
      ? v.syncOn
        ? `The ${v.newMonthly} a month price starts today. Stripe adds the part month to the next bill.`
        : `Plan sync is off, so Stripe is not changed. Next you get the exact price to set in Stripe by hand.`
      : v.syncOn
        ? `The ${v.newMonthly} a month price starts at period end${v.effectiveAt ? `, ${ticketDay(v.effectiveAt)}` : ""}.`
        : `Plan sync is off. Next you get the exact price to set in Stripe by hand from period end.`;
  return {
    title: `Apply the move to ${v.to}?`,
    body: `Switches the account from ${v.from} to ${v.to} today and sets the go live date. ${price}`,
    confirmLabel: `Apply ${v.to}`,
    cancelLabel: "Not yet",
    tone: "action" as const,
  };
}

export function rejectSheet(v: TicketSheetView) {
  return {
    title: v.setupPaid ? `Reject and refund ${v.setupPaid}?` : "Reject this plan change?",
    body: v.setupPaid
      ? `Refunds the ${v.setupPaid} setup difference to their card and closes the request. The plan stays on ${v.from}. This cannot be undone.`
      : `Closes the request. Nothing was charged and the plan stays on ${v.from}.`,
    confirmLabel: v.setupPaid ? "Reject and refund" : "Reject",
    cancelLabel: "Keep it",
    tone: "danger" as const,
  };
}

