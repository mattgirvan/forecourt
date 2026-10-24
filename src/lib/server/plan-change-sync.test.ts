import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPlanChange, upgradeCheckoutParams } from "./plan-change-sync.ts";
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

test("downgrade at period end: no proration", async () => {
  const { deps, calls } = fake({ ...siteSub(), items: { data: [{ id: "si_g", quantity: 3, price: { unit_amount: 24_900, recurring: { interval: "month" } } }] } });
  const r = await applyPlanChange(deps, { subscriptionId: "sub_1", from: "group", to: "franchise", live: 7, key: "k" });
  assert.ok(r.applied && r.proration === "none");
  const items = (calls[0].params as { items: unknown[] }).items;
  assert.equal(items.length, 3);
});

test("downgrade with the switch set to now is pro-rated", async () => {
  const { deps } = fake(siteSub());
  const r = await applyPlanChange(deps, { subscriptionId: "sub_1", from: "group", to: "site", live: 1, key: "k", downgradeTiming: "now" });
  assert.ok(r.applied && r.proration === "create_prorations");
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
