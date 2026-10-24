import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPlanChange, finishScheduledChange, planChangeMessage, releasePlanChangeSchedule, scheduledChangeDue, upgradeCheckoutParams, type SchedulesLike } from "./plan-change-sync.ts";
import type { SiteSubLike, SiteSubsLike } from "./site-billing-sync.ts";

function fake(sub: SiteSubLike, fail = false) {
  const calls: { id: string; params: unknown; options: unknown }[] = [];
  const subscriptions: SiteSubsLike = {
    retrieve: async () => sub,
    update: async (id, params, options) => {
      if (fail) throw new Error("card declined");
      calls.push({ id, params, options });
      return {};
    },
  };
  return { deps: { subscriptions, productFor: async (p: string) => `prod_${p}` }, calls };
}
const siteSub = (status = "active"): SiteSubLike => ({
  id: "sub_1", status,
  items: { data: [{ id: "si_setup", price: { unit_amount: 450_000, recurring: null } }, { id: "si_site", quantity: 1, price: { unit_amount: 39_900, recurring: { interval: "month" } } }] },
});

test("upgrade swaps recurring lines for Group per site, pro-rated, keyed for retries", async () => {
  const { deps, calls } = fake(siteSub());
  const r = await applyPlanChange(deps, { subscriptionId: "sub_1", from: "site", to: "group", live: 3, key: "paid:cs_1" });
  assert.ok(r.applied);
  assert.deepEqual(calls[0], {
    id: "sub_1",
    params: {
      items: [
        { id: "si_site", deleted: true },
        { price_data: { currency: "gbp", unit_amount: 24_900, recurring: { interval: "month" }, product: "prod_group" }, quantity: 3, metadata: { forecourt_line: "group_site" } },
      ],
      proration_behavior: "create_prorations",
    },
    options: { idempotencyKey: "plan-change:paid:cs_1" },
  });
});

function fakeSchedules(fail = false) {
  const calls: { op: string; id?: string; params?: unknown; options: unknown }[] = [];
  const schedules: SchedulesLike = {
    create: async (params, options) => { if (fail) throw new Error("boom"); calls.push({ op: "create", params, options }); return { id: "sub_sched_1", phases: [{ start_date: 1_000, end_date: 2_000 }] }; },
    update: async (id, params, options) => { calls.push({ op: "update", id, params, options }); return {}; },
    release: async (id, options) => { calls.push({ op: "release", id, options }); return {}; },
  };
  return { schedules, calls };
}
const groupSub = (extra: Record<string, unknown> = {}): SiteSubLike => ({
  id: "sub_1", status: "active", current_period_start: 1_000, current_period_end: 2_000,
  items: { data: [{ id: "si_g", quantity: 7, price: { id: "price_g", unit_amount: 24_900, recurring: { interval: "month" } } as never }] },
  ...extra,
});

test("price drop never swaps now: books a schedule that changes at period end", async () => {
  const { deps, calls } = fake(groupSub());
  const s = fakeSchedules();
  const r = await applyPlanChange({ ...deps, schedules: s.schedules }, { subscriptionId: "sub_1", from: "group", to: "franchise", live: 7, key: "k" });
  assert.equal(calls.length, 0, "no immediate subscription update");
  assert.ok(r.applied && r.mode === "scheduled");
  assert.equal(r.scheduleId, "sub_sched_1");
  assert.equal(r.effectiveAt, new Date(2_000_000).toISOString());
  assert.deepEqual(s.calls[0], { op: "create", params: { from_subscription: "sub_1" }, options: { idempotencyKey: "plan-change-schedule:k" } });
  const up = s.calls[1] as { id: string; params: { end_behavior: string; proration_behavior: string; phases: { start_date: number; end_date?: number; items: unknown[] }[] }; options: unknown };
  assert.equal(up.id, "sub_sched_1");
  assert.equal(up.params.end_behavior, "release");
  assert.equal(up.params.proration_behavior, "none");
  assert.deepEqual(up.params.phases[0], { start_date: 1_000, end_date: 2_000, items: [{ price: "price_g", quantity: 7 }], proration_behavior: "none" });
  assert.equal(up.params.phases[1].start_date, 2_000);
  assert.equal(up.params.phases[1].items.length, 2, "Franchise base plus extra sites");
  assert.deepEqual(up.options, { idempotencyKey: "plan-change-schedule-phases:k" });
});

test("moves down to Site are booked, not swapped", async () => {
  const { deps, calls } = fake(groupSub());
  const s = fakeSchedules();
  const r = await applyPlanChange({ ...deps, schedules: s.schedules }, { subscriptionId: "sub_1", from: "group", to: "site", live: 1, key: "k2" });
  assert.ok(r.applied && r.mode === "scheduled");
  assert.equal(calls.length, 0);
});

test("price drop with no schedules client refuses instead of swapping now", async () => {
  const { deps, calls } = fake(groupSub());
  const r = await applyPlanChange(deps, { subscriptionId: "sub_1", from: "group", to: "franchise", live: 7, key: "k" });
  assert.deepEqual(r, { applied: false, reason: "stripe_not_configured" });
  assert.equal(calls.length, 0);
});

test("an existing schedule or a missing period end books nothing", async () => {
  const s = fakeSchedules();
  const a = await applyPlanChange({ ...fake(groupSub({ schedule: "sub_sched_old" })).deps, schedules: s.schedules }, { subscriptionId: "sub_1", from: "group", to: "site", live: 1, key: "k" });
  assert.deepEqual(a, { applied: false, reason: "already_scheduled", detail: "sub_sched_old" });
  const b = await applyPlanChange({ ...fake(groupSub({ current_period_end: null })).deps, schedules: s.schedules }, { subscriptionId: "sub_1", from: "group", to: "site", live: 1, key: "k" });
  assert.deepEqual(b, { applied: false, reason: "no_period_end" });
  assert.equal(s.calls.length, 0);
});

test("a Stripe error while booking is reported, never thrown", async () => {
  const r = await applyPlanChange({ ...fake(groupSub()).deps, schedules: fakeSchedules(true).schedules }, { subscriptionId: "sub_1", from: "group", to: "site", live: 1, key: "k" });
  assert.equal(!r.applied && r.reason, "stripe_error");
});

test("Group (2 sites) to Franchise is a price rise: swaps now with proration (go live day)", async () => {
  const { deps, calls } = fake(groupSub());
  const s = fakeSchedules();
  const r = await applyPlanChange({ ...deps, schedules: s.schedules }, { subscriptionId: "sub_1", from: "group", to: "franchise", live: 2, key: "k" });
  assert.ok(r.applied && r.mode === "now" && r.proration === "create_prorations");
  assert.equal(calls.length, 1);
  assert.equal(s.calls.length, 0);
});

test("cancelling releases the schedule, keyed per change; already released counts as done", async () => {
  const s = fakeSchedules();
  assert.deepEqual(await releasePlanChangeSchedule({ schedules: s.schedules }, "sub_sched_1", 9), { released: true });
  assert.deepEqual(s.calls[0], { op: "release", id: "sub_sched_1", options: { idempotencyKey: "plan-change-release:9" } });
  assert.deepEqual(await releasePlanChangeSchedule({ schedules: s.schedules }, null, 9), { released: false, reason: "no_schedule" });
  assert.deepEqual(await releasePlanChangeSchedule({ schedules: null }, "x", 9), { released: false, reason: "stripe_not_configured" });
  const gone: SchedulesLike = { ...s.schedules, release: async () => { throw new Error("You cannot release a subscription schedule that is currently in the `released` status."); } };
  assert.deepEqual(await releasePlanChangeSchedule({ schedules: gone }, "x", 9), { released: true });
  const down: SchedulesLike = { ...s.schedules, release: async () => { throw new Error("network"); } };
  assert.deepEqual(await releasePlanChangeSchedule({ schedules: down }, "x", 9), { released: false, reason: "network" });
});

test("a booked change lands once when due: webhook and cron race, one wins", async () => {
  const now = new Date("2026-12-01T00:00:00Z");
  const row = { id: 9, tenant_id: 4, to_plan: "site", status: "scheduled", effective_at: "2026-11-30T23:00:00Z" };
  assert.equal(scheduledChangeDue(row, now), true);
  assert.equal(scheduledChangeDue({ ...row, effective_at: "2026-12-02T00:00:00Z" }, now), false);
  assert.equal(scheduledChangeDue({ ...row, status: "cancelled" }, now), false);
  assert.equal(scheduledChangeDue({ ...row, effective_at: null }, now), false);
  let claimed = false;
  const plans: string[] = [];
  const deps = { claim: async () => (claimed ? false : (claimed = true)), setPlan: async (_t: number, to: string) => void plans.push(to) };
  const id = (p: string) => p as never;
  assert.equal(await finishScheduledChange(deps, row, now, id), "finished");
  assert.equal(await finishScheduledChange(deps, row, now, id), "lost_race");
  assert.equal(await finishScheduledChange(deps, { ...row, effective_at: "2027-01-01T00:00:00Z" }, now, id), "not_due");
  assert.deepEqual(plans, ["site"]);
});

test("customer messages for booked changes have no dashes", () => {
  const msg = planChangeMessage({ applied: true, mode: "scheduled", proration: "none", scheduleId: "s", effectiveAt: "2026-11-30T00:00:00.000Z", items: [] }, "group", "site");
  assert.ok(!/[-\u2010-\u2015]/.test(msg), msg);
  assert.ok(msg.includes("Site"));
});

test("trialing never prorates; same plan, no subscription, no Stripe and errors never throw", async () => {
  const t = fake(siteSub("trialing"));
  const r = await applyPlanChange(t.deps, { subscriptionId: "sub_1", from: "site", to: "franchise", live: 1, key: "k" });
  assert.ok(r.applied && r.proration === "none");
  assert.deepEqual(await applyPlanChange(t.deps, { subscriptionId: "sub_1", from: "site", to: "site", live: 1, key: "k" }), { applied: false, reason: "same_plan" });
  assert.deepEqual(await applyPlanChange(t.deps, { subscriptionId: null, from: "site", to: "group", live: 1, key: "k" }), { applied: false, reason: "no_subscription" });
  assert.deepEqual(await applyPlanChange({ ...t.deps, subscriptions: null }, { subscriptionId: "s", from: "site", to: "group", live: 1, key: "k" }), { applied: false, reason: "stripe_not_configured" });
  const bad = fake(siteSub(), true);
  const e = await applyPlanChange(bad.deps, { subscriptionId: "sub_1", from: "site", to: "group", live: 1, key: "k" });
  assert.equal(!e.applied && e.reason, "stripe_error");
});

test("upgrade checkout charges only the setup difference and tags the change", () => {
  const p = upgradeCheckoutParams({ tenantId: 4, changeId: 9, from: "site", to: "group", setupDiffPence: 400_000, customer: "cus_1", successUrl: "s", cancelUrl: "c" });
  assert.equal(p.mode, "payment");
  assert.equal(p.line_items[0].price_data.unit_amount, 400_000);
  assert.deepEqual(p.metadata, { kind: "plan_change", tenant_id: "4", change_id: "9", from: "site", to: "group" });
  assert.equal((p as { customer?: string }).customer, "cus_1");
});
