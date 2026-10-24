/**
 * Office: an owner marks a plan change setup difference as paid, for money that
 * came in another way (bank transfer). Pure flow behind injected deps, so it is
 * tested with Stripe and the database mocked.
 *
 * - Owner only, checked here on the server, not just by hiding the button.
 * - Only a pending_payment request. Paid, cancelled or anything else is refused.
 * - The customer's open Checkout page is closed first, so they cannot also pay
 *   by card. If Stripe says that page is already complete, we stop: the card
 *   payment wins and the webhook moves the request on.
 * - The claim is the same conditional pending_payment to paid write the webhook
 *   uses, so only one of them ever wins. A later Stripe event for this request
 *   finds it paid and does nothing.
 * - Then the same after paid steps as the webhook: ticket, tracker, receipt.
 */
export type MarkPaidChange = {
  id: number;
  tenant_id: number;
  status: string;
  setup_diff_pence: number;
  checkout_session_id: string | null;
};

export type MarkPaidDeps = {
  loadChange: (changeId: number) => Promise<MarkPaidChange | null>;
  retrieveSession: (sessionId: string) => Promise<{ id: string; status: string | null } | null>;
  expireSession: (sessionId: string) => Promise<void>;
  /** pending_payment to paid, only while still pending. Records who and when. True when this call won. */
  claimPaid: (changeId: number, patch: { marked_paid_by: string; marked_paid_at: string }) => Promise<boolean>;
  /** Best effort: a Stripe invoice marked paid out of band, so the books match a card payment. */
  issueInvoice?: (change: MarkPaidChange) => Promise<string | null>;
  /** The webhook's after paid steps. Must dedupe itself. */
  afterPaid: (changeId: number, tenantId: number, invoiceId: string | null) => Promise<void>;
  now: () => Date;
};

export type MarkPaidInput = { changeId: number; role: string | null; email: string | null };
export type MarkPaidResult = { ok: true; message: string; markedAt: string; invoiceId: string | null } | { ok: false; message: string };

export const MARK_PAID_OWNER_ONLY = "Only an owner can mark a payment as paid.";

export async function markPaidOffline(deps: MarkPaidDeps, input: MarkPaidInput): Promise<MarkPaidResult> {
  if (input.role !== "owner") return { ok: false, message: MARK_PAID_OWNER_ONLY };
  const who = (input.email ?? "").trim();
  if (!who) return { ok: false, message: "We could not tell who you are, so nothing was marked. Sign in again." };
  const c = await deps.loadChange(input.changeId);
  if (!c) return { ok: false, message: "No plan change with that id." };
  if (c.status === "paid") return { ok: false, message: "This is already paid. Nothing more to do." };
  if (c.status !== "pending_payment") return { ok: false, message: "This request is not waiting for payment, so there is nothing to mark." };
  if (!(c.setup_diff_pence > 0)) return { ok: false, message: "There is nothing to pay on this request." };

  if (c.checkout_session_id) {
    const s = await deps.retrieveSession(c.checkout_session_id);
    if (s?.status === "complete") return { ok: false, message: "The customer has just paid by card. Refresh in a minute; Stripe moves it on." };
    if (s?.status === "open") {
      try {
        await deps.expireSession(s.id);
      } catch {
        const again = await deps.retrieveSession(s.id);
        if (again?.status === "complete") return { ok: false, message: "The customer has just paid by card. Refresh in a minute; Stripe moves it on." };
        if (again?.status === "open") return { ok: false, message: "We could not close the customer's payment page, so nothing was marked. Try again in a minute." };
      }
    }
  }

  const markedAt = deps.now().toISOString();
  const won = await deps.claimPaid(c.id, { marked_paid_by: who, marked_paid_at: markedAt });
  if (!won) return { ok: false, message: "This request has just moved on. Refresh to see where it is." };
  let invoiceId: string | null = null;
  if (deps.issueInvoice) {
    try {
      invoiceId = await deps.issueInvoice(c);
    } catch {
      invoiceId = null;
    }
  }
  try {
    await deps.afterPaid(c.id, c.tenant_id, invoiceId);
  } catch {
    /* the payment is recorded; the after paid steps dedupe and can be redone */
  }
  return { ok: true, message: "Marked as paid. The request is with the team, the ticket is open and the customer has their receipt.", markedAt, invoiceId };
}

/** Webhook guard: an Office started request is not cancelled when its Checkout page expires. */
export function keepOnExpiry(metadata: Record<string, string> | null | undefined): boolean {
  return metadata?.started_from === "office";
}
