/**
 * Resume the setup difference payment for a plan change (plan change flow PR 6).
 * Pure flow behind injected deps, so it is tested with Stripe and the database mocked.
 *
 * Only the owner of the account (tenants.user_id) can call it, for their own
 * request, while it is pending_payment. Not the Forecourt team, not managers.
 * - The current Checkout session is still open: return its URL. Nothing new.
 * - It has gone (expired or missing): make a new session for the same request
 *   and the same stored setup_diff_pence (set by the PR 1 price rules at request
 *   time), with an idempotency key tied to the request and the session it
 *   replaces. Store the new id only if the stored id is still the old one, so
 *   there is one live session per request. No new prices, nothing is charged here.
 * The existing webhook still marks it paid. An old session expiring later does
 * not match checkout_session_id, so it cancels nothing and sends no reminder.
 */
export type ResumeChange = {
  id: number;
  tenant_id: number;
  status: string;
  setup_diff_pence: number;
  checkout_session_id: string | null;
};

export type ResumeDeps = {
  loadChange: (changeId: number) => Promise<ResumeChange | null>;
  retrieveSession: (sessionId: string) => Promise<{ id: string; status: string | null; url: string | null } | null>;
  createCheckout: (change: ResumeChange, idempotencyKey: string) => Promise<{ id: string; url: string | null }>;
  /** Conditional update: set checkout_session_id = newId where it is still oldId and the row is pending_payment. */
  swapSession: (changeId: number, oldId: string | null, newId: string) => Promise<boolean>;
  /** Best effort: expire a session we made but lost the race to store. */
  expireSession: (sessionId: string) => Promise<void>;
};

export type ResumeInput = { changeId: number; tenantId: number; callerUserId: string | null; ownerUserId: string | null };
export type ResumeResult = { ok: true; url: string; reused: boolean } | { ok: false; message: string };

export function resumeKey(changeId: number, replacing: string | null): string {
  return `plan-change-resume:${changeId}:${replacing ?? "none"}`;
}

export async function resumePayment(deps: ResumeDeps, input: ResumeInput): Promise<ResumeResult> {
  if (!input.callerUserId || !input.ownerUserId || input.callerUserId !== input.ownerUserId)
    return { ok: false, message: "Only the account owner can pay for this change." };
  const c = await deps.loadChange(input.changeId);
  if (!c || c.tenant_id !== input.tenantId) return { ok: false, message: "We could not find that request on your account." };
  if (c.status === "paid") return { ok: false, message: "This is already paid. Your request is with the Forecourt team." };
  if (c.status !== "pending_payment") return { ok: false, message: "There is nothing to pay on this request." };
  if (!(c.setup_diff_pence > 0)) return { ok: false, message: "There is nothing to pay on this request." };

  if (c.checkout_session_id) {
    const s = await deps.retrieveSession(c.checkout_session_id);
    if (s?.status === "open" && s.url) return { ok: true, url: s.url, reused: true };
    if (s?.status === "complete") return { ok: false, message: "Your payment is going through. Refresh in a minute to see it." };
  }

  const made = await deps.createCheckout(c, resumeKey(c.id, c.checkout_session_id));
  if (!made.url) return { ok: false, message: "Stripe did not return a payment page. Try again in a minute." };
  if (await deps.swapSession(c.id, c.checkout_session_id, made.id)) return { ok: true, url: made.url, reused: false };
  // Someone else stored a session first. Same idempotency key means it is often this one.
  const now = await deps.loadChange(c.id);
  if (now?.status === "pending_payment" && now.checkout_session_id === made.id) return { ok: true, url: made.url, reused: false };
  try {
    await deps.expireSession(made.id);
  } catch {
    /* it expires by itself; it does not match the request, so it cannot mark anything */
  }
  return { ok: false, message: "Your payment page has just changed. Refresh and press Pay again." };
}
