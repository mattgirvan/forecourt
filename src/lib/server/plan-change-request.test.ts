import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { planMove } from "../plan-change-rules.ts";
import { markRequestExpired, markRequestPaid, routeRequest, startRequest, OPEN_REQUEST_MESSAGE, type StartDeps } from "./plan-change-request.ts";
import { upgradeCheckoutParams } from "./plan-change-sync.ts";

const row = (from: string, to: string) => ({ tenant_id: 4, from_plan: from, to_plan: to, direction: "", setup_diff_pence: 0, prorated_pence: 0, new_monthly_pence: 0, effective: "", requested_by: "a@b.c" });

function db(opts: { open?: boolean; duplicate?: boolean; checkoutFails?: boolean } = {}) {
  const log: { op: string; args: unknown[] }[] = [];
  const deps: StartDeps = {
    findOpen: async () => (opts.open ? { id: 1, status: "requested" } : null),
    insert: async (r) => (log.push({ op: "insert", args: [r] }), opts.duplicate ? "duplicate" : { id: 9 }),
    setSession: async (id, s) => void log.push({ op: "setSession", args: [id, s] }),
    cancel: async (id, m) => void log.push({ op: "cancel", args: [id, m] }),
    createCheckout: async (id, key) => {
      log.push({ op: "checkout", args: [id, key] });
      if (opts.checkoutFails) throw new Error("stripe down");
      return { id: "cs_9", url: "https://checkout.stripe.test/cs_9" };
    },
  };
  return { deps, log };
}
const ops = (log: { op: string }[]) => log.map((l) => l.op);

test("routing follows the price rules", () => {
  assert.equal(routeRequest(planMove({ from: "site", to: "franchise", live: 1 })), "checkout");
  assert.equal(routeRequest(planMove({ from: "franchise", to: "group", live: 2 })), "checkout", "onto Group pays setup even as the price falls");
  assert.equal(routeRequest(planMove({ from: "group", to: "franchise", live: 2 })), "requested", "£0 setup rise goes straight to the team");
  assert.equal(routeRequest(planMove({ from: "group", to: "site", live: 3 })), "schedule");
  assert.equal(routeRequest(planMove({ from: "franchise", to: "site", live: 1, oldMonthlyPence: 1, newMonthlyPence: 1 })), "schedule", "equal swap books for period end");
  assert.equal(routeRequest(planMove({ from: "site", to: "site", live: 1 })), "none");
});

test("setup above 0: Checkout for the setup difference only, keyed to the request", async () => {
  const { deps, log } = db();
  const r = await startRequest(deps, planMove({ from: "franchise", to: "group", live: 2 }), row("franchise", "group"));
  assert.deepEqual(r, { kind: "checkout", changeId: 9, url: "https://checkout.stripe.test/cs_9", sessionId: "cs_9" });
  assert.deepEqual(ops(log), ["insert", "checkout", "setSession"]);
  const ins = log[0].args[0] as { status: string; setup_diff_pence: number };
  assert.equal(ins.status, "pending_payment");
  assert.equal(ins.setup_diff_pence, 200_000);
  assert.deepEqual(log[1].args, [9, "plan-change-checkout:9"]);
  const p = upgradeCheckoutParams({ tenantId: 4, changeId: 9, from: "franchise", to: "group", setupDiffPence: 200_000, successUrl: "s", cancelUrl: "c" });
  assert.equal(p.line_items.length, 1);
  assert.equal(p.line_items[0].price_data.unit_amount, 200_000);
  assert.ok(!("subscription_data" in p));
  for (const t of [p.line_items[0].price_data.product_data.name, p.line_items[0].price_data.product_data.description]) assert.ok(!/[\u2010-\u2015]|\s-\s/.test(t), t);
});

test("£0 setup goes straight to requested, no Stripe", async () => {
  const { deps, log } = db();
  const r = await startRequest(deps, planMove({ from: "group", to: "franchise", live: 3 }), row("group", "franchise"));
  assert.deepEqual(r, { kind: "requested", changeId: 9, deferred: false });
  assert.deepEqual(ops(log), ["insert"]);
  assert.equal((log[0].args[0] as { status: string }).status, "requested");
});

test("drop or equal swap is handed to the PR 2 booking, nothing inserted here", async () => {
  const { deps, log } = db();
  assert.deepEqual(await startRequest(deps, planMove({ from: "group", to: "site", live: 3 }), row("group", "site")), { kind: "schedule" });
  assert.equal(log.length, 0);
});

test("one open request per account: checked first, and the unique index backs it", async () => {
  const a = db({ open: true });
  assert.deepEqual(await startRequest(a.deps, planMove({ from: "site", to: "franchise", live: 1 }), row("site", "franchise")), { kind: "refused", reason: "open_request", message: OPEN_REQUEST_MESSAGE });
  assert.equal(a.log.length, 0);
  const a2 = db({ open: true });
  assert.equal((await startRequest(a2.deps, planMove({ from: "group", to: "site", live: 3 }), row("group", "site"))).kind, "refused", "a booking is refused too");
  const b = db({ duplicate: true });
  const r = await startRequest(b.deps, planMove({ from: "site", to: "franchise", live: 1 }), row("site", "franchise"));
  assert.equal(r.kind === "refused" && r.reason, "open_request");
  assert.deepEqual(ops(b.log), ["insert"], "no Checkout after the index refuses");
});

test("Checkout failing cancels the row so the account is not stuck", async () => {
  const { deps, log } = db({ checkoutFails: true });
  const r = await startRequest(deps, planMove({ from: "site", to: "franchise", live: 1 }), row("site", "franchise"));
  assert.equal(r.kind === "refused" && r.reason, "checkout_failed");
  assert.deepEqual(ops(log), ["insert", "checkout", "cancel"]);
  assert.ok(r.kind === "refused" && !/[\u2010-\u2015]|\s-\s/.test(r.message));
});

const paidSession = { id: "cs_9", payment_status: "paid", amount_total: 200_000, payment_intent: "pi_1", invoice: { id: "in_1" }, metadata: { kind: "plan_change", tenant_id: "4", change_id: "9" } };

function paidDeps(status = "pending_payment", setup = 200_000) {
  let current = status;
  const claims: unknown[] = [];
  const after: number[] = [];
  return {
    claims,
    after,
    deps: {
      load: async () => ({ id: 9, tenant_id: 4, status: current, setup_diff_pence: setup }),
      claimPaid: async (_id: number, patch: unknown) => {
        if (current !== "pending_payment") return false;
        current = "paid";
        claims.push(patch);
        return true;
      },
      afterPaid: async (id: number) => void after.push(id),
    },
  };
}

test("webhook marks the request paid, records Stripe ids, no plan switch, once only", async () => {
  const p = paidDeps();
  assert.deepEqual(await markRequestPaid(p.deps, paidSession), { status: 200, body: "plan change paid" });
  assert.deepEqual(p.claims, [{ checkout_session_id: "cs_9", payment_intent_id: "pi_1", invoice_id: "in_1" }]);
  assert.deepEqual(await markRequestPaid(p.deps, paidSession), { status: 200, body: "plan change already paid" });
  assert.deepEqual(p.after, [9], "side effects run once");
  assert.ok(!("applyPlanChange" in p.deps));
});

test("webhook refuses wrong amount, wrong account, bad metadata; waits for unpaid", async () => {
  assert.equal((await markRequestPaid(paidDeps("pending_payment", 400_000).deps, paidSession)).status, 422);
  assert.equal((await markRequestPaid(paidDeps().deps, { ...paidSession, metadata: { ...paidSession.metadata, tenant_id: "5" } })).status, 422);
  assert.equal((await markRequestPaid(paidDeps().deps, { ...paidSession, metadata: {} })).status, 422);
  assert.deepEqual(await markRequestPaid(paidDeps().deps, { ...paidSession, payment_status: "unpaid" }), { status: 200, body: "not paid yet" });
  assert.deepEqual(await markRequestPaid(paidDeps("cancelled").deps, paidSession), { status: 200, body: "plan change already cancelled" });
});

test("a failing side effect never undoes the payment", async () => {
  const p = paidDeps();
  const r = await markRequestPaid({ ...p.deps, afterPaid: async () => { throw new Error("email down"); } }, paidSession);
  assert.deepEqual(r, { status: 200, body: "plan change paid" });
});

test("expired Checkout cancels the pending request once; a paid one is left alone", async () => {
  let status = "pending_payment";
  const seen: unknown[] = [];
  const deps = {
    cancelPending: async (id: number, s: string) => {
      seen.push([id, s]);
      if (status !== "pending_payment") return false;
      status = "cancelled";
      return true;
    },
  };
  const s = { id: "cs_9", metadata: { kind: "plan_change", tenant_id: "4", change_id: "9" } };
  assert.deepEqual(await markRequestExpired(deps, s), { status: 200, body: "plan change cancelled" });
  assert.deepEqual(await markRequestExpired(deps, s), { status: 200, body: "plan change not pending" });
  assert.deepEqual(seen[0], [9, "cs_9"]);
  assert.deepEqual(await markRequestExpired(deps, { id: "cs_x", metadata: {} }), { status: 200, body: "ignored: bad plan change metadata" });
});

test("sync off: drop or equal swap is recorded as requested for period end, staff apply it", async () => {
  const { deps, log } = db();
  const r = await startRequest(deps, planMove({ from: "group", to: "site", live: 3 }), row("group", "site"), { scheduleBooking: false });
  assert.deepEqual(r, { kind: "requested", changeId: 9, deferred: true });
  assert.deepEqual(ops(log), ["insert"]);
  assert.equal((log[0].args[0] as { status: string }).status, "requested");
});

test("sync off: a setup difference still goes to Checkout", async () => {
  const { deps, log } = db();
  const r = await startRequest(deps, planMove({ from: "site", to: "franchise", live: 1 }), row("site", "franchise"), { scheduleBooking: false });
  assert.equal(r.kind, "checkout");
  assert.deepEqual(ops(log), ["insert", "checkout", "setSession"]);
});

test("server: sync off does not stop routing, and an open request is not a failure", () => {
  const src = readFileSync(new URL("./plan-change-server.ts", import.meta.url), "utf8");
  const handler = src.slice(src.indexOf("export const requestPlanChange"), src.indexOf("async function noteOk"));
  assert.ok(!/mode !== "live"\) \{/.test(handler), "no sync off early return before routing");
  assert.match(handler, /scheduleBooking: mode === "live"/);
  assert.match(handler, /open_request" \? "in_progress"/);
});
