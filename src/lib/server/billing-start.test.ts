/** Monthly billing starts at go live: checkout charges setup only, Live starts the plan. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkoutQuote,
  firstChargePence,
  monthlyChargedAtCheckout,
  monthlyStartSentence,
  onPaidTrial,
  PLANS,
  siteIsLive,
} from "../catalog.ts";
import {
  goLiveConfirmText,
  monthlyStartMessage,
  previewMonthlyStart,
  startMonthlyAtGoLive,
  type SubscriptionLike,
} from "./billing-start.ts";

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

// One shared quote: the account page Pay button and startCheckout both use it.
const trialBuilding = { plan: "pilot", billing: "trial", status: "paid", stage: "build" };
const trialLiveStage = { plan: "pilot", billing: "trial", status: "paid", stage: "live" };
const trialLiveStatus = { plan: "site", billing: "trial", status: "live", stage: "testing" };

test("checkoutQuote: a new Site subscription pays setup only today", () => {
  const q = checkoutQuote({ plan: "site", billing: "subscription", tenant: null });
  assert.deepEqual(q, {
    convert: false,
    siteAlreadyLive: false,
    setupPence: 450_000,
    monthlyPence: 39_900,
    monthlyNow: false,
    dueTodayPence: 450_000,
  });
});

test("checkoutQuote: a trial still building converts with the credit, monthly waits", () => {
  const q = checkoutQuote({ plan: "site", billing: "subscription", convertFromTrial: true, tenant: trialBuilding });
  assert.equal(q.convert, true);
  assert.equal(q.setupPence, 300_000);
  assert.equal(q.monthlyNow, false);
  assert.equal(q.dueTodayPence, 300_000);
});

test("checkoutQuote: a trial whose desk is live still converts, and pays its first month now", () => {
  for (const t of [trialLiveStage, trialLiveStatus]) {
    assert.equal(onPaidTrial(t), true);
    assert.equal(siteIsLive(t), true);
    const q = checkoutQuote({ plan: "site", billing: "subscription", convertFromTrial: true, tenant: t });
    assert.equal(q.convert, true);
    assert.equal(q.monthlyNow, true);
    assert.equal(q.dueTodayPence, 300_000 + 39_900);
  }
});

test("checkoutQuote: no credit unless the site really is on a paid trial", () => {
  assert.equal(onPaidTrial(null), false);
  assert.equal(onPaidTrial({ plan: "site", billing: "subscription", status: "paid" }), false);
  assert.equal(onPaidTrial({ plan: "site", billing: "trial", status: "briefing" }), false);
  assert.equal(onPaidTrial({ plan: "site", billing: null, status: "paid" }), false);
  assert.equal(onPaidTrial({ plan: "group", billing: "trial", status: "paid" }), false);
  const q = checkoutQuote({
    plan: "site",
    billing: "subscription",
    convertFromTrial: true,
    tenant: { plan: "site", billing: "subscription", status: "paid" },
  });
  assert.equal(q.convert, false);
  assert.equal(q.dueTodayPence, 450_000);
  // A trial checkout itself is never a convert.
  assert.equal(checkoutQuote({ plan: "site", billing: "trial", convertFromTrial: true, tenant: trialBuilding }).convert, false);
});

test("checkoutQuote: Group counts sites and keeps the minimum", () => {
  const q = checkoutQuote({ plan: "group", billing: "subscription", siteCount: 1, tenant: null });
  assert.equal(q.monthlyPence, PLANS.group.monthPence * PLANS.group.minSites);
  assert.equal(q.dueTodayPence, PLANS.group.setupPence);
});

test("monthly start wording keeps the 180-day cap", () => {
  assert.equal(
    monthlyStartSentence(39_900),
    "The £399 a month starts on your go live day, or 180 days after payment if that comes first.",
  );
});

test("go live confirm: says the plan starts only when it will", async () => {
  const waiting = await previewMonthlyStart({ subscriptions: fakeSubs("trialing").subs, log }, "sub_1");
  assert.deepEqual(waiting, { kind: "will_start" });
  assert.equal(goLiveConfirmText(waiting, "£399"), "Mark live? This starts their £399 monthly plan today.");

  const running = await previewMonthlyStart({ subscriptions: fakeSubs("active").subs, log }, "sub_1");
  assert.equal(goLiveConfirmText(running, "£399"), "Mark live?");

  const none = await previewMonthlyStart({ subscriptions: fakeSubs("trialing").subs, log }, null);
  assert.equal(goLiveConfirmText(none, "£399"), "Mark live?");

  // A subscription exists but Stripe can't be asked: still warn.
  const noStripe = await previewMonthlyStart({ subscriptions: null, log }, "sub_1");
  assert.equal(goLiveConfirmText(noStripe, "£399"), "Mark live? This starts their £399 monthly plan today.");
  const failed = await previewMonthlyStart({ subscriptions: fakeSubs("trialing", { fail: true }).subs, log }, "sub_1");
  assert.equal(failed.kind, "unknown");
});
