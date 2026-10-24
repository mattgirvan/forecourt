/** PR 4 wiring: the dry run gate, the first bill true up, and the go live paths. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dryRunSubs, modeMessage, siteBillingModeFrom, syncSiteBilling, type ItemChange, type SiteSubLike, type SiteSubsLike } from "./site-billing-sync.ts";
import type { BillingSite } from "../site-billing.ts";

const START = Date.parse("2026-10-01T00:00:00Z") / 1000;
function fake(sub: SiteSubLike) {
  const calls: unknown[] = [];
  const subs: SiteSubsLike = {
    retrieve: async () => sub,
    update: async (id, params, options) => {
      calls.push({ id, params, options });
      return {};
    },
  };
  return { subs, calls };
}
const live = (n: number): BillingSite[] => Array.from({ length: n }, (_, i) => ({ code: `S${i}`, name: `S${i}`, status: "live", liveAt: "2026-09-01T00:00:00Z", archivedAt: null }));
const groupSub = (qty: number, status = "active"): SiteSubLike => ({
  id: "sub_g", status, current_period_start: START,
  items: { data: [{ id: "si_g", quantity: qty, price: { product: "prod_group", unit_amount: 24_900, recurring: { interval: "month" } } }] },
});

test("gate: only the exact value on goes live, everything else is a dry run", () => {
  assert.equal(siteBillingModeFrom("on"), "live");
  for (const v of [undefined, null, "", "true", "ON", "1", "yes", "off"]) assert.equal(siteBillingModeFrom(v), "dry_run");
});

test("dry run reads the subscription but never sends the update", async () => {
  const { subs, calls } = fake(groupSub(2));
  const sent: ItemChange[][] = [];
  const r = await syncSiteBilling({ subscriptions: dryRunSubs(subs, sent) }, { tenantId: 7, plan: "group", subscriptionId: "sub_g", sites: live(3), event: { code: "S2", from: "setting_up", to: "live" } });
  assert.equal(calls.length, 0);
  assert.deepEqual(sent, [[{ id: "si_g", quantity: 3 }]]);
  assert.ok(r.changed);
  assert.match(modeMessage("dry_run", r), /^Dry run, Stripe not changed\. Would have: /);
  assert.doesNotMatch(modeMessage("live", r), /Dry run/);
  assert.equal(dryRunSubs(null, sent), null);
});

test("true up: a trialing Group with 1 live site is set to the 2 site minimum, no proration", async () => {
  const { subs, calls } = fake(groupSub(1, "trialing"));
  const r = await syncSiteBilling({ subscriptions: subs }, { tenantId: 7, plan: "group", tenantStatus: "building", subscriptionId: "sub_g", sites: live(1), event: { code: "true-up", from: null, to: "live" } });
  assert.ok(r.changed);
  assert.deepEqual((calls[0] as { params: unknown }).params, { items: [{ id: "si_g", quantity: 2 }], proration_behavior: "none" });
});

test("true up: a trialing Group with 4 live sites bills 4", async () => {
  const { subs, calls } = fake(groupSub(2, "trialing"));
  await syncSiteBilling({ subscriptions: subs }, { tenantId: 7, plan: "group", subscriptionId: "sub_g", sites: live(4), event: { code: "true-up", from: null, to: "live" } });
  assert.deepEqual((calls[0] as { params: unknown }).params, { items: [{ id: "si_g", quantity: 4 }], proration_behavior: "none" });
});

const src = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");

test("both go live paths reach the true up through startMonthlyForTenant", () => {
  assert.match(src("src/lib/server/billing-go-live.ts"), /trueUpSiteBilling\(sb, tenantId, actorEmail\)/);
  const goLive = src("src/lib/server/billing-go-live.ts");
  assert.ok(goLive.indexOf("trueUpSiteBilling(") < goLive.indexOf("startMonthlyAtGoLive("), "true up runs before the trial ends");
  assert.match(src("src/lib/server/build.ts"), /startMonthlyForTenant\(/);
  assert.match(src("src/lib/server/portal.ts"), /startMonthlyForTenant\(/);
});

test("server: Stripe writes only in live mode, setSiteState is team only", () => {
  const s = src("src/lib/server/site-billing-server.ts");
  assert.match(s, /siteBillingModeFrom\(siteBillingSyncFlag\(\)\)/);
  assert.match(src("src/lib/server/staff-actor.ts"), /env\("SITE_BILLING_SYNC"\)/);
  assert.match(s, /mode === "live" \? real : dryRunSubs\(real, sent\)/);
  assert.match(s, /export const setSiteState[\s\S]*?if \(!team\) throw/);
});
