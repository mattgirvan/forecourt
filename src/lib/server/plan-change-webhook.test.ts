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
