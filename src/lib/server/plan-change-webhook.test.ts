import { test } from "node:test";
import assert from "node:assert/strict";
import { handleStripeWebhook, type WebhookDeps } from "./payments.ts";

const session = { id: "cs_1", payment_status: "paid", amount_total: 400_000, metadata: { kind: "plan_change", tenant_id: "4", change_id: "9" } };
const deps = (planChange?: WebhookDeps["planChange"]): WebhookDeps => ({
  stripeSecret: "x",
  webhookSecret: "y",
  store: {} as never,
  constructEvent: () => ({ id: "evt_1", type: "checkout.session.completed", data: { object: session } }) as never,
  log: { error: () => {}, warn: () => {}, info: () => {} } as never,
  planChange,
});

test("a paid plan change session goes to the plan change handler, never the order path", async () => {
  const seen: unknown[] = [];
  const r = await handleStripeWebhook(deps(async (s) => { seen.push(s); return { status: 200, body: "plan change applied" }; }), "{}", "sig");
  assert.deepEqual(r, { status: 200, body: "plan change applied" });
  assert.equal((seen[0] as { id: string }).id, "cs_1");
});

test("unwired plan change answers 500 so Stripe retries", async () => {
  assert.equal((await handleStripeWebhook(deps(), "{}", "sig")).status, 500);
});

test("subscription updated goes to the booked plan change handler when wired, ignored when not", async () => {
  const ev = { id: "evt_2", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } };
  const seen: string[] = [];
  const wired: WebhookDeps = { ...deps(), constructEvent: () => ev as never, planSchedule: async (id) => { seen.push(id); return { status: 200, body: "booked plan change landed" }; } };
  assert.deepEqual(await handleStripeWebhook(wired, "{}", "sig"), { status: 200, body: "booked plan change landed" });
  assert.deepEqual(seen, ["sub_1"]);
  assert.deepEqual(await handleStripeWebhook({ ...deps(), constructEvent: () => ev as never }, "{}", "sig"), { status: 200, body: "ignored" });
});

test("expired or failed plan change Checkout goes to the expiry handler; other expiries are ignored", async () => {
  const seen: string[] = [];
  const planChangeExpired: WebhookDeps["planChangeExpired"] = async (s) => { seen.push(s.id); return { status: 200, body: "plan change cancelled" }; };
  for (const type of ["checkout.session.expired", "checkout.session.async_payment_failed"]) {
    const ev = { id: "evt_3", type, data: { object: { id: "cs_9", metadata: { kind: "plan_change", tenant_id: "4", change_id: "9" } } } };
    assert.deepEqual(await handleStripeWebhook({ ...deps(), constructEvent: () => ev as never, planChangeExpired }, "{}", "sig"), { status: 200, body: "plan change cancelled" });
  }
  assert.deepEqual(seen, ["cs_9", "cs_9"]);
  const order = { id: "evt_4", type: "checkout.session.expired", data: { object: { id: "cs_o", metadata: { order_id: "1" } } } };
  assert.deepEqual(await handleStripeWebhook({ ...deps(), constructEvent: () => order as never, planChangeExpired }, "{}", "sig"), { status: 200, body: "ignored" });
});
