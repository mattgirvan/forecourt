/** Monthly billing starts at go live: checkout charges setup only, Live starts the plan. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { firstChargePence, monthlyChargedAtCheckout, PLANS } from "../catalog.ts";
import { monthlyStartMessage, startMonthlyAtGoLive, type SubscriptionLike } from "./billing-start.ts";

test("checkout charges the one-off setup only, monthly waits for go live", () => {
  assert.equal(firstChargePence("site", "subscription"), PLANS.site.setupPence);
  assert.equal(firstChargePence("site", "subscription"), 450_000);
  assert.equal(firstChargePence("group", "subscription", 3), PLANS.group.setupPence);
  assert.equal(firstChargePence("site", "trial"), 150_000);
  assert.equal(monthlyChargedAtCheckout("subscription"), false);
});

test("a site already live (trial converting) pays setup and its first month now", () => {
  assert.equal(firstChargePence("site", "subscription", 1, true, true), 300_000 + 39_900);
  assert.equal(monthlyChargedAtCheckout("subscription", true), true);
  assert.equal(firstChargePence("site", "subscription", 1, true, false), 300_000);
});

function fakeSubs(status: string, opts: { fail?: boolean } = {}) {
  const calls: unknown[][] = [];
  return {
    calls,
    subs: {
      async retrieve(id: string): Promise<SubscriptionLike> {
        calls.push(["retrieve", id]);
        if (opts.fail) throw new Error("No such subscription");
        return { id, status };
      },
      async update(id: string, params: unknown, options?: unknown): Promise<SubscriptionLike> {
        calls.push(["update", id, params, options]);
        return { id, status: "active" };
      },
    },
  };
}
const log = { error: () => {}, warn: () => {} };

test("going live ends the wait so the first month is charged today", async () => {
  const f = fakeSubs("trialing");
  const r = await startMonthlyAtGoLive({ subscriptions: f.subs, log }, "sub_1");
  assert.deepEqual(r, { started: true, subscriptionId: "sub_1" });
  assert.deepEqual(f.calls[1], [
    "update",
    "sub_1",
    { trial_end: "now", proration_behavior: "none" },
    { idempotencyKey: "forecourt-go-live-sub_1" },
  ]);
  assert.equal(monthlyStartMessage(r), "Monthly billing started in Stripe today.");
});

test("already running, no subscription, no Stripe or a Stripe error never throw or double charge", async () => {
  const active = fakeSubs("active");
  assert.equal((await startMonthlyAtGoLive({ subscriptions: active.subs, log }, "sub_1")).started, false);
  assert.equal(active.calls.length, 1);
  assert.deepEqual(await startMonthlyAtGoLive({ subscriptions: active.subs, log }, null), {
    started: false,
    reason: "no_subscription",
  });
  assert.deepEqual(await startMonthlyAtGoLive({ subscriptions: null, log }, "sub_1"), {
    started: false,
    reason: "stripe_not_configured",
  });
  const broken = fakeSubs("trialing", { fail: true });
  const r = await startMonthlyAtGoLive({ subscriptions: broken.subs, log }, "sub_1");
  assert.equal(r.started, false);
  assert.match(monthlyStartMessage(r), /by hand/);
  const cancelled = fakeSubs("canceled");
  assert.equal((await startMonthlyAtGoLive({ subscriptions: cancelled.subs, log }, "sub_1")).started, false);
});
