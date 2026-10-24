/**
 * Plan change request and its one payment (plan change flow PR 3).
 * Pure flow behind injected deps so it is tested with Stripe and the
 * database mocked. Routing follows the PR 1 rules (plan-change-rules.ts):
 *  - setup difference above 0 (price rise with setup, or any move onto
 *    Group): Stripe Checkout for the setup difference only, keyed to the request.
 *  - £0 setup and a price rise: straight to "requested" for the team.
 *  - price drop or equal swap: booked for period end (PR 2, "scheduled").
 * Paying never switches the plan; staff apply it later (PR 4).
 */
import type { PlanMove } from "../plan-change-rules.ts";

export type RequestRoute = "checkout" | "requested" | "schedule" | "none";

export function routeRequest(move: PlanMove): RequestRoute {
  if (move.direction === "same_plan") return "none";
  if (move.setupDuePence > 0) return "checkout";
  return move.direction === "up" ? "requested" : "schedule";
}

/** Statuses that count as an open request. One per account. */
export const OPEN_STATUSES = ["pending_payment", "paid", "requested", "scheduled"] as const;

export type RequestRow = {
  tenant_id: number;
  from_plan: string;
  to_plan: string;
  direction: string;
  setup_diff_pence: number;
  prorated_pence: number;
  new_monthly_pence: number;
  effective: string;
  requested_by: string;
};

export type StartDeps = {
  /** An open request for this account, if any. */
  findOpen: (tenantId: number) => Promise<{ id: number; status: string } | null>;
  /** Insert; "duplicate" when the one open index refuses it. */
  insert: (row: RequestRow & { status: string }) => Promise<{ id: number } | "duplicate">;
  setSession: (id: number, sessionId: string) => Promise<void>;
  /** Mark the row cancelled (Checkout could not be created). */
  cancel: (id: number, message: string) => Promise<void>;
  createCheckout: (changeId: number, idempotencyKey: string) => Promise<{ id: string; url: string | null }>;
};

export type StartResult =
  | { kind: "checkout"; changeId: number; url: string | null; sessionId: string }
  | { kind: "requested"; changeId: number; deferred: boolean }
  | { kind: "schedule" }
  | { kind: "refused"; reason: "same_plan" | "open_request" | "checkout_failed"; message: string };

export const OPEN_REQUEST_MESSAGE = "You already have a plan change in progress. You can see it under Plan, and we’ll email you when it’s done.";

/**
 * Start a request. The "schedule" route is handed back to the caller, which
 * runs the PR 2 booking (applyPlanChange) and stores the scheduled row.
 */
export async function startRequest(deps: StartDeps, move: PlanMove, row: RequestRow, opts: { scheduleBooking?: boolean } = {}): Promise<StartResult> {
  // With PLAN_CHANGE_SYNC off there is no Stripe schedule booking: a drop or
  // equal swap is recorded as "requested" for period end and staff apply it.
  const raw = routeRequest(move);
  const route = raw === "schedule" && opts.scheduleBooking === false ? "requested" : raw;
  const deferred = raw === "schedule" && route === "requested";
  if (route === "none") return { kind: "refused", reason: "same_plan", message: "You are already on that plan." };
  if (await deps.findOpen(row.tenant_id)) return { kind: "refused", reason: "open_request", message: OPEN_REQUEST_MESSAGE };
  if (route === "schedule") return { kind: "schedule" };
  const ins = await deps.insert({ ...row, setup_diff_pence: move.setupDuePence, status: route === "checkout" ? "pending_payment" : "requested" });
  if (ins === "duplicate") return { kind: "refused", reason: "open_request", message: OPEN_REQUEST_MESSAGE };
  if (route === "requested") return { kind: "requested", changeId: ins.id, deferred };
  try {
    const s = await deps.createCheckout(ins.id, `plan-change-checkout:${ins.id}`);
    await deps.setSession(ins.id, s.id);
    return { kind: "checkout", changeId: ins.id, url: s.url, sessionId: s.id };
  } catch (err) {
    await deps.cancel(ins.id, `Checkout could not be created: ${err instanceof Error ? err.message : String(err)}`);
    return { kind: "refused", reason: "checkout_failed", message: "We could not start the payment. Please try again in a moment." };
  }
}

export type SessionLike = {
  id: string;
  payment_status?: string | null;
  amount_total?: number | null;
  payment_intent?: string | { id: string } | null;
  invoice?: string | { id: string } | null;
  metadata?: Record<string, string> | null;
};

export type PaidDeps = {
  load: (changeId: number) => Promise<{ id: number; tenant_id: number; status: string; setup_diff_pence: number } | null>;
  /** pending_payment -> paid, only if still pending. True when this call won. */
  claimPaid: (changeId: number, patch: { checkout_session_id: string; payment_intent_id: string | null; invoice_id: string | null }) => Promise<boolean>;
  /** Tracker stage, ticket and emails. Must dedupe itself. Never turns the answer into an error. */
  afterPaid?: (changeId: number, tenantId: number) => Promise<void>;
};

const ref = (r: string | { id: string } | null | undefined) => (r == null ? null : typeof r === "string" ? r : r.id);

/** Webhook: the setup difference was paid. Marks the request paid. Never switches the plan. */
export async function markRequestPaid(deps: PaidDeps, session: SessionLike): Promise<{ status: number; body: string }> {
  const changeId = Number(session.metadata?.change_id);
  const tenantId = Number(session.metadata?.tenant_id);
  if (!Number.isInteger(changeId) || !Number.isInteger(tenantId)) return { status: 422, body: "not applied: bad plan change metadata" };
  if (session.payment_status !== "paid") return { status: 200, body: "not paid yet" };
  const pc = await deps.load(changeId);
  if (!pc || pc.tenant_id !== tenantId) return { status: 422, body: "not applied: plan change not found" };
  if (pc.status !== "pending_payment") return { status: 200, body: `plan change already ${pc.status}` };
  if ((session.amount_total ?? -1) !== pc.setup_diff_pence) return { status: 422, body: "not applied: amount does not match" };
  const won = await deps.claimPaid(changeId, { checkout_session_id: session.id, payment_intent_id: ref(session.payment_intent), invoice_id: ref(session.invoice) });
  if (!won) return { status: 200, body: "plan change already paid" };
  if (deps.afterPaid) {
    try {
      await deps.afterPaid(changeId, tenantId);
    } catch {
      /* the payment is recorded; side effects dedupe and can be redone */
    }
  }
  return { status: 200, body: "plan change paid" };
}

export type ExpiredDeps = {
  /** pending_payment -> cancelled for this change and session. True when this call won. */
  cancelPending: (changeId: number, sessionId: string) => Promise<boolean>;
  afterExpired?: (changeId: number, tenantId: number) => Promise<void>;
};

/** Webhook: Checkout expired (or async payment failed). Cancels the request; the plan stays as it is. */
export async function markRequestExpired(deps: ExpiredDeps, session: SessionLike): Promise<{ status: number; body: string }> {
  const changeId = Number(session.metadata?.change_id);
  const tenantId = Number(session.metadata?.tenant_id);
  if (!Number.isInteger(changeId) || !Number.isInteger(tenantId)) return { status: 200, body: "ignored: bad plan change metadata" };
  const won = await deps.cancelPending(changeId, session.id);
  if (!won) return { status: 200, body: "plan change not pending" };
  if (deps.afterExpired) {
    try {
      await deps.afterExpired(changeId, tenantId);
    } catch {
      /* best effort */
    }
  }
  return { status: 200, body: "plan change cancelled" };
}
