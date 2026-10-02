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

function fakeSubs(
  status: string,
  opts: { fail?: boolean; extra?: Partial<SubscriptionLike>; afterStatus?: string } = {},
) {
  const calls: unknown[][] = [];
  return {
    calls,
    subs: {
      async retrieve(id: string): Promise<SubscriptionLike> {
        calls.push(["retrieve", id]);
        if (opts.fail) throw new Error("No such subscription");
        return { id, status, ...opts.extra };
      },
      async update(id: string, params: unknown, options?: unknown): Promise<SubscriptionLike> {
        calls.push(["update", id, params, options]);
        return { id, status: opts.afterStatus ?? "active" };
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

test("a subscription set to cancel never starts billing at go live", async () => {
  for (const extra of [{ cancel_at_period_end: true }, { cancel_at: 1_900_000_000 }]) {
    const f = fakeSubs("trialing", { extra });
    const r = await startMonthlyAtGoLive({ subscriptions: f.subs, log }, "sub_1");
    assert.deepEqual(r, { started: false, reason: "set_to_cancel", detail: "trialing" });
    assert.equal(f.calls.length, 1, "no update call");
    assert.match(monthlyStartMessage(r), /set to cancel/);
    const p = await previewMonthlyStart({ subscriptions: f.subs, log }, "sub_1");
    assert.equal(
      goLiveConfirmText(p, "£399"),
      "Mark live? Their subscription is set to cancel, so this will not start the monthly plan.",
    );
  }
});

test("a cancelled or refunded file never starts billing, even with a waiting subscription", async () => {
  for (const tenantStatus of ["cancelled", "refunded"]) {
    const f = fakeSubs("trialing");
    const r = await startMonthlyAtGoLive({ subscriptions: f.subs, log }, "sub_1", { tenantStatus });
    assert.deepEqual(r, { started: false, reason: "tenant_ended", detail: tenantStatus });
    assert.equal(f.calls.length, 0, "Stripe is not even asked");
    assert.equal(monthlyStartMessage(r), `This file is ${tenantStatus}, so monthly billing was not started.`);
    const p = await previewMonthlyStart({ subscriptions: f.subs, log }, "sub_1", { tenantStatus });
    assert.equal(goLiveConfirmText(p, "£399"), `Mark live? This file is ${tenantStatus}, so this will not start the monthly plan.`);
  }
  // A live or subscribed file still starts.
  const ok = await startMonthlyAtGoLive({ subscriptions: fakeSubs("trialing").subs, log }, "sub_1", { tenantStatus: "subscribed" });
  assert.equal(ok.started, true);
});

test("a declined card at go live is reported as a failed payment, not as started", async () => {
  for (const afterStatus of ["past_due", "incomplete", "unpaid"]) {
    const f = fakeSubs("trialing", { afterStatus });
    const r = await startMonthlyAtGoLive({ subscriptions: f.subs, log }, "sub_1");
    assert.deepEqual(r, { started: false, reason: "payment_failed", detail: afterStatus });
    assert.doesNotMatch(monthlyStartMessage(r), /^Monthly billing started/);
    assert.match(monthlyStartMessage(r), /first payment failed/);
  }
  const pastDue = await startMonthlyAtGoLive({ subscriptions: fakeSubs("past_due").subs, log }, "sub_1");
  assert.match(monthlyStartMessage(pastDue), /last payment failed/);
});

test("no 'You're live' email when going live skipped the £399 because the file is ending", async () => {
  const { progressEmailHold } = await import("./billing-start.ts");
  // Cancelled or refunded file: held, whatever the stage.
  for (const priorStatus of ["cancelled", "refunded"]) {
    const start = await startMonthlyAtGoLive({ subscriptions: fakeSubs("trialing").subs, log }, "sub_1", { tenantStatus: priorStatus });
    assert.match(progressEmailHold({ stage: "live", priorStatus, start }) ?? "", new RegExp(`this file is ${priorStatus}`));
    assert.ok(progressEmailHold({ stage: "testing", priorStatus }));
  }
  // Subscription set to cancel: the live email is held.
  const setToCancel = await startMonthlyAtGoLive(
    { subscriptions: fakeSubs("trialing", { extra: { cancel_at_period_end: true } }).subs, log },
    "sub_1",
    { tenantStatus: "subscribed" },
  );
  assert.match(progressEmailHold({ stage: "live", priorStatus: "subscribed", start: setToCancel }) ?? "", /set to cancel/);
  // Normal go live, a trial with no subscription, a plan already running, or a declined card: still emailed.
  const ok = await startMonthlyAtGoLive({ subscriptions: fakeSubs("trialing").subs, log }, "sub_1", { tenantStatus: "subscribed" });
  assert.equal(progressEmailHold({ stage: "live", priorStatus: "subscribed", start: ok }), null);
  const trial = await startMonthlyAtGoLive({ subscriptions: fakeSubs("trialing").subs, log }, null, { tenantStatus: "trial" });
  assert.equal(progressEmailHold({ stage: "live", priorStatus: "trial", start: trial }), null);
  const running = await startMonthlyAtGoLive({ subscriptions: fakeSubs("active").subs, log }, "sub_1");
  assert.equal(progressEmailHold({ stage: "live", priorStatus: "subscribed", start: running }), null);
  const declined = await startMonthlyAtGoLive({ subscriptions: fakeSubs("trialing", { afterStatus: "past_due" }).subs, log }, "sub_1");
  assert.equal(progressEmailHold({ stage: "live", priorStatus: "subscribed", start: declined }), null);
  assert.equal(progressEmailHold({ stage: "preview", priorStatus: "subscribed" }), null);
});
