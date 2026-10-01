/**
 * Payment hardening: an order only turns paid from a verified Stripe session,
 * the signed webhook, or (with no Stripe key at all) the preview shortcut.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  confirmPaymentFlow,
  handleStripeWebhook,
  verifyPaidSession,
  type CheckoutSessionLike,
  type OrderRow,
  type PaymentStore,
  type WebhookEvent,
} from "./payments.ts";

const NOW = new Date("2026-10-01T21:00:00Z");

function order(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 7,
    user_id: "user-a",
    tenant_id: 3,
    plan: "site",
    amount_pence: 249_900,
    status: "pending",
    kind: "subscription",
    site_count: 1,
    stripe_session_id: "cs_test_1",
    ...over,
  };
}

function session(over: Partial<CheckoutSessionLike> = {}): CheckoutSessionLike {
  return {
    id: "cs_test_1",
    status: "complete",
    payment_status: "paid",
    amount_total: 249_900,
    currency: "gbp",
    mode: "subscription",
    metadata: { order_id: "7", tenant_id: "3", plan: "group", billing: "subscription" },
    subscription: "sub_1",
    customer: "cus_1",
    ...over,
  };
}

function memoryStore(o: OrderRow | null, opts: { failWrites?: boolean; tenantOwner?: string } = {}) {
  const calls: { op: string; id: number | string; patch?: unknown }[] = [];
  const state = { order: o ? { ...o } : null };
  const store: PaymentStore = {
    async loadOrder(id) {
      return state.order && state.order.id === id ? { ...state.order } : null;
    },
    async loadTenant() {
      return { user_id: opts.tenantOwner ?? "user-a", status: "briefing", trial_ends_at: null };
    },
    async updateTenant(id, patch) {
      if (opts.failWrites) throw new Error("update tenant: permission denied");
      calls.push({ op: "updateTenant", id, patch });
    },
    async markOrderPaid(id, fields) {
      if (opts.failWrites) throw new Error("mark order paid: permission denied");
      calls.push({ op: "markOrderPaid", id, patch: fields });
      if (state.order) state.order.status = "paid";
    },
    async cancelBySubscription(id) {
      if (opts.failWrites) throw new Error("cancel tenant: permission denied");
      calls.push({ op: "cancel", id });
    },
    async seedPaid(id, actor) {
      calls.push({ op: "seed", id, patch: actor });
    },
  };
  return { store, calls, state };
}

function quietLog() {
  const lines: string[] = [];
  return {
    lines,
    log: {
      error: (...a: unknown[]) => lines.push(`error ${a.map(String).join(" ")}`),
      warn: (...a: unknown[]) => lines.push(`warn ${a.map(String).join(" ")}`),
    },
  };
}

const noRetrieve = async (): Promise<CheckoutSessionLike> => {
  throw new Error("retrieveSession should not be called");
};

// ---- confirmPayment ------------------------------------------------------

test("with a Stripe key set, the preview shortcut is refused and nothing is written", async () => {
  const { store, calls } = memoryStore(order());
  const { log, lines } = quietLog();
  const r = await confirmPaymentFlow(
    { stripeSecret: "sk_live_configured", userId: "user-a", store, retrieveSession: noRetrieve, log, now: NOW },
    { previewOrderId: 7 },
  );
  assert.deepEqual(r, { ok: false, reason: "preview_disabled" });
  assert.equal(calls.length, 0);
  assert.ok(lines.some((l) => l.includes("preview confirmation refused")));
});

test("without a Stripe key, the preview shortcut still marks the caller's own order paid", async () => {
  const { store, calls } = memoryStore(order({ stripe_session_id: null }));
  const { log } = quietLog();
  const r = await confirmPaymentFlow(
    { stripeSecret: undefined, userId: "user-a", store, retrieveSession: noRetrieve, log, now: NOW },
    { previewOrderId: 7 },
  );
  assert.equal(r.ok, true);
  assert.deepEqual(
    calls.map((c) => c.op),
    ["updateTenant", "markOrderPaid", "seed"],
  );
  assert.equal((calls[0].patch as { status: string }).status, "subscribed");
});

test("without a key, the preview shortcut still refuses someone else's order", async () => {
  const { store, calls } = memoryStore(order({ user_id: "user-b" }));
  const r = await confirmPaymentFlow(
    { stripeSecret: undefined, userId: "user-a", store, retrieveSession: noRetrieve, log: quietLog().log },
    { previewOrderId: 7 },
  );
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});

test("a verified Checkout session marks the order paid; plan and billing come from the order row", async () => {
  const { store, calls, state } = memoryStore(order());
  let retrieved = "";
  const r = await confirmPaymentFlow(
    {
      stripeSecret: "sk_live_configured",
      userId: "user-a",
      store,
      retrieveSession: async (id) => {
        retrieved = id;
        return session();
      },
      log: quietLog().log,
      now: NOW,
    },
    { sessionId: "cs_test_1" },
  );
  assert.equal(r.ok, true);
  assert.equal(retrieved, "cs_test_1");
  assert.equal(state.order?.status, "paid");
  const tenantPatch = calls.find((c) => c.op === "updateTenant")?.patch as Record<string, unknown>;
  // metadata said "group"; the order row says "site" and wins.
  assert.equal(tenantPatch.plan, "site");
  assert.equal(tenantPatch.status, "subscribed");
  assert.equal(tenantPatch.stripe_subscription_id, "sub_1");
  assert.equal(tenantPatch.stripe_customer_id, "cus_1");
  // Order is marked paid after the tenant update.
  assert.deepEqual(
    calls.map((c) => c.op),
    ["updateTenant", "markOrderPaid", "seed"],
  );
});

test("a trial order sets a 60 day trial end", async () => {
  const { store, calls } = memoryStore(order({ plan: "pilot", kind: "trial", amount_pence: 50_000 }));
  const r = await confirmPaymentFlow(
    {
      stripeSecret: "sk",
      userId: "user-a",
      store,
      retrieveSession: async () => session({ amount_total: 50_000 }),
      log: quietLog().log,
      now: NOW,
    },
    { sessionId: "cs_test_1" },
  );
  assert.equal(r.ok, true);
  const p = calls[0].patch as Record<string, unknown>;
  assert.equal(p.status, "trial");
  assert.equal(p.billing, "trial");
  assert.equal(p.trial_ends_at, "2026-11-30T21:00:00.000Z");
});

test("sessions that are not proof of payment for this order are refused", async () => {
  const cases: [string, Partial<CheckoutSessionLike>, Partial<OrderRow>][] = [
    ["session_not_complete", { status: "open" }, {}],
    ["session_not_paid", { payment_status: "unpaid" }, {}],
    ["amount_mismatch", { amount_total: 100 }, {}],
    ["currency_mismatch", { currency: "usd" }, {}],
    ["session_mismatch", { id: "cs_other" }, {}],
    ["not_your_order", {}, { user_id: "user-b" }],
  ];
  for (const [reason, s, o] of cases) {
    const { store, calls } = memoryStore(order(o));
    const r = await confirmPaymentFlow(
      { stripeSecret: "sk", userId: "user-a", store, retrieveSession: async () => session(s), log: quietLog().log },
      { sessionId: "cs_test_1" },
    );
    assert.deepEqual(r, { ok: false, reason }, reason);
    assert.equal(calls.length, 0, reason);
  }
  const { store } = memoryStore(order());
  const r = await confirmPaymentFlow(
    {
      stripeSecret: "sk",
      userId: "user-a",
      store,
      retrieveSession: async () => session({ metadata: { order_id: "99" } }),
      log: quietLog().log,
    },
    { sessionId: "cs_test_1" },
  );
  assert.deepEqual(r, { ok: false, reason: "order_not_found" });
});

test("verifyPaidSession accepts an order whose session id was never recorded", () => {
  assert.deepEqual(verifyPaidSession(session(), order({ stripe_session_id: null })), { ok: true });
});

test("an order that is already paid is not written again", async () => {
  const { store, calls } = memoryStore(order({ status: "paid" }));
  const r = await confirmPaymentFlow(
    { stripeSecret: "sk", userId: "user-a", store, retrieveSession: async () => session(), log: quietLog().log },
    { sessionId: "cs_test_1" },
  );
  assert.equal(r.ok, true);
  assert.equal(calls.length, 0);
});

// ---- webhook --------------------------------------------------------------

const completed = (s: CheckoutSessionLike = session()): WebhookEvent => ({
  id: "evt_1",
  type: "checkout.session.completed",
  data: { object: s as unknown as Record<string, unknown> },
});

function hookDeps(store: PaymentStore | null, event: WebhookEvent | Error) {
  const q = quietLog();
  return {
    q,
    deps: {
      stripeSecret: "sk",
      webhookSecret: "whsec_configured",
      store,
      constructEvent: () => {
        if (event instanceof Error) throw event;
        return event;
      },
      log: q.log,
      now: NOW,
    },
  };
}

test("webhook answers 500 with a clear log line when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
  const { deps, q } = hookDeps(null, completed());
  const r = await handleStripeWebhook(deps, "{}", "t=1,v1=x");
  assert.equal(r.status, 500);
  assert.ok(q.lines.some((l) => l.startsWith("error") && l.includes("SUPABASE_SERVICE_ROLE_KEY is not configured")));
});

test("webhook keeps a bad signature at 400", async () => {
  const { deps } = hookDeps(memoryStore(order()).store, new Error("No signatures found"));
  const r = await handleStripeWebhook(deps, "{}", "bad");
  assert.equal(r.status, 400);
});

test("webhook answers 500 when the Stripe key or webhook secret is missing", async () => {
  const a = hookDeps(memoryStore(order()).store, completed());
  assert.equal((await handleStripeWebhook({ ...a.deps, stripeSecret: undefined }, "{}", "s")).status, 500);
  assert.equal((await handleStripeWebhook({ ...a.deps, webhookSecret: " " }, "{}", "s")).status, 500);
});

test("webhook answers 500 when the database write fails, so Stripe retries", async () => {
  const { deps, q } = hookDeps(memoryStore(order(), { failWrites: true }).store, completed());
  const r = await handleStripeWebhook(deps, "{}", "s");
  assert.equal(r.status, 500);
  assert.ok(q.lines.some((l) => l.includes("database write failed")));
});

test("webhook marks a verified paid session's order paid", async () => {
  const m = memoryStore(order());
  const { deps } = hookDeps(m.store, completed());
  const r = await handleStripeWebhook(deps, "{}", "s");
  assert.deepEqual(r, { status: 200, body: "ok" });
  assert.equal(m.state.order?.status, "paid");
});

test("webhook does not mark an unpaid completed session paid", async () => {
  const m = memoryStore(order());
  const { deps } = hookDeps(m.store, completed(session({ payment_status: "unpaid" })));
  const r = await handleStripeWebhook(deps, "{}", "s");
  assert.equal(r.status, 200);
  assert.equal(m.calls.length, 0);
  assert.equal(m.state.order?.status, "pending");
});

test("webhook refuses a paid session whose amount does not match the order", async () => {
  const m = memoryStore(order());
  const { deps, q } = hookDeps(m.store, completed(session({ amount_total: 1 })));
  const r = await handleStripeWebhook(deps, "{}", "s");
  assert.equal(r.status, 422);
  assert.equal(m.calls.length, 0);
  assert.ok(q.lines.some((l) => l.includes("amount_mismatch")));
});

test("webhook cancels on subscription deleted and ignores other events", async () => {
  const m = memoryStore(order());
  const del = hookDeps(m.store, { type: "customer.subscription.deleted", data: { object: { id: "sub_1" } } });
  assert.equal((await handleStripeWebhook(del.deps, "{}", "s")).status, 200);
  assert.deepEqual(m.calls, [{ op: "cancel", id: "sub_1" }]);
  const other = hookDeps(null, { type: "invoice.paid", data: { object: {} } });
  assert.deepEqual(await handleStripeWebhook(other.deps, "{}", "s"), { status: 200, body: "ignored" });
});

test("an order pointing at another account's site is never applied", async () => {
  const pre = memoryStore(order({ stripe_session_id: null }), { tenantOwner: "user-b" });
  const r1 = await confirmPaymentFlow(
    { stripeSecret: undefined, userId: "user-a", store: pre.store, retrieveSession: noRetrieve, log: quietLog().log },
    { previewOrderId: 7 },
  );
  assert.deepEqual(r1, { ok: false, reason: "tenant_not_owned" });
  assert.equal(pre.calls.length, 0);

  const hook = memoryStore(order(), { tenantOwner: "user-b" });
  const { deps } = hookDeps(hook.store, completed());
  const r2 = await handleStripeWebhook(deps, "{}", "s");
  assert.equal(r2.status, 422);
  assert.equal(hook.calls.length, 0);
});

test("a session id is always checked with Stripe, even if a preview order id is also sent", async () => {
  const { store, calls } = memoryStore(order());
  let retrieved = false;
  const r = await confirmPaymentFlow(
    {
      stripeSecret: "sk",
      userId: "user-a",
      store,
      retrieveSession: async () => {
        retrieved = true;
        return session({ payment_status: "unpaid" });
      },
      log: quietLog().log,
    },
    { sessionId: "cs_test_1", previewOrderId: 7 },
  );
  assert.equal(retrieved, true);
  assert.deepEqual(r, { ok: false, reason: "session_not_paid" });
  assert.equal(calls.length, 0);
});
