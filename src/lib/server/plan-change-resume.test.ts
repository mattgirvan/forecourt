import { test } from "node:test";
import assert from "node:assert/strict";
import { resumeKey, resumePayment, type ResumeChange, type ResumeDeps } from "./plan-change-resume.ts";
import { markRequestExpired } from "./plan-change-request.ts";

/** A tiny in-memory plan_changes row and Stripe, with the same conditional writes as the server. */
function world(start: Partial<ResumeChange> = {}, sessions: Record<string, { status: string; url: string }> = {}) {
  const row: ResumeChange = { id: 7, tenant_id: 3, status: "pending_payment", setup_diff_pence: 200000, checkout_session_id: "cs_old", ...start };
  const log: string[] = [];
  const deps: ResumeDeps = {
    loadChange: async (id) => (id === row.id ? { ...row } : null),
    retrieveSession: async (id) => (sessions[id] ? { id, ...sessions[id]! } : null),
    createCheckout: async (c, key) => {
      log.push(`create:${c.setup_diff_pence}:${key}`);
      const id = `cs_new_${Object.keys(sessions).length}`;
      sessions[id] = { status: "open", url: `https://checkout.stripe.test/${id}` };
      return { id, url: sessions[id]!.url };
    },
    swapSession: async (id, oldId, newId) => {
      if (id !== row.id || row.status !== "pending_payment" || row.checkout_session_id !== oldId) return false;
      row.checkout_session_id = newId;
      return true;
    },
    expireSession: async (id) => void log.push(`expire:${id}`),
  };
  return { row, log, deps, sessions };
}
const owner = { changeId: 7, tenantId: 3, callerUserId: "u1", ownerUserId: "u1" };

test("only the owner of that account can resume", async () => {
  const w = world({}, { cs_old: { status: "open", url: "https://checkout.stripe.test/cs_old" } });
  for (const who of [{ callerUserId: "u2" }, { callerUserId: null }, { ownerUserId: null }]) {
    const r = await resumePayment(w.deps, { ...owner, ...who });
    assert.deepEqual(r, { ok: false, message: "Only the account owner can pay for this change." });
  }
  // Another tenant's request id is not found, even for an owner.
  assert.equal((await resumePayment(w.deps, { ...owner, tenantId: 4 })).ok, false);
  assert.deepEqual(w.log, []);
});

test("an open session is reused: same URL, nothing new made", async () => {
  const w = world({}, { cs_old: { status: "open", url: "https://checkout.stripe.test/cs_old" } });
  assert.deepEqual(await resumePayment(w.deps, owner), { ok: true, url: "https://checkout.stripe.test/cs_old", reused: true });
  assert.deepEqual(w.log, []);
  assert.equal(w.row.checkout_session_id, "cs_old");
});

test("after expiry a new session is made for the same amount and stored, one live session per request", async () => {
  const w = world({}, { cs_old: { status: "expired", url: "" } });
  const r = await resumePayment(w.deps, owner);
  assert.ok(r.ok && !r.reused);
  assert.deepEqual(w.log, [`create:200000:${resumeKey(7, "cs_old")}`]);
  assert.equal(resumeKey(7, "cs_old"), "plan-change-resume:7:cs_old");
  assert.equal(w.row.checkout_session_id, "cs_new_1");
  // Pressing Pay again reuses the new open session.
  assert.deepEqual(await resumePayment(w.deps, owner), { ok: true, url: "https://checkout.stripe.test/cs_new_1", reused: true });
  assert.equal(w.log.length, 1);
});

test("losing the race to store expires our extra session and makes no second live one", async () => {
  const w = world({}, { cs_old: { status: "expired", url: "" } });
  const swap = w.deps.swapSession;
  w.deps.swapSession = async (id, oldId, newId) => {
    w.row.checkout_session_id = "cs_other";
    return swap(id, oldId, newId);
  };
  const r = await resumePayment(w.deps, owner);
  assert.equal(r.ok, false);
  assert.ok(w.log.includes("expire:cs_new_1"));
  assert.equal(w.row.checkout_session_id, "cs_other");
});

test("paid, cancelled and £0 requests have nothing to pay", async () => {
  assert.match((await resumePayment(world({ status: "paid" }).deps, owner) as { message: string }).message, /already paid/);
  assert.equal((await resumePayment(world({ status: "cancelled" }).deps, owner)).ok, false);
  assert.equal((await resumePayment(world({ setup_diff_pence: 0 }).deps, owner)).ok, false);
});

test("a stale expiry webhook for the old session cancels nothing and sends no reminder", async () => {
  const row = { id: 7, status: "pending_payment", checkout_session_id: "cs_new_1" };
  let after = 0;
  const deps = {
    // Same filter as expirePlanChange: id, pending_payment AND the stored session id.
    cancelPending: async (id: number, sessionId: string) => {
      if (id !== row.id || row.status !== "pending_payment" || row.checkout_session_id !== sessionId) return false;
      row.status = "cancelled";
      return true;
    },
    afterExpired: async () => void after++,
  };
  const stale = await markRequestExpired(deps, { id: "cs_old", metadata: { change_id: "7", tenant_id: "3" } } as never);
  assert.equal(stale.body, "plan change not pending");
  assert.equal(row.status, "pending_payment");
  assert.equal(after, 0);
  // The live session expiring still cancels as before.
  await markRequestExpired(deps, { id: "cs_new_1", metadata: { change_id: "7", tenant_id: "3" } } as never);
  assert.equal(row.status, "cancelled");
  assert.equal(after, 1);
});
