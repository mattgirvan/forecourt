/** Mocked Stripe only. Nothing here talks to Stripe. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { syncSiteBilling, siteSyncMessage, type SiteSubLike, type SiteSubsLike } from "./site-billing-sync.ts";
import type { BillingSite } from "../site-billing.ts";

const START = Date.parse("2026-10-01T00:00:00Z") / 1000;
function fake(sub: SiteSubLike, opts: { fail?: boolean } = {}) {
  const calls: { id: string; params: unknown; options: unknown }[] = [];
  const subs: SiteSubsLike = {
    retrieve: async () => sub,
    update: async (id, params, options) => {
      calls.push({ id, params, options });
      if (opts.fail) throw new Error("card_declined");
      return {};
    },
  };
  return { subs, calls };
}
const sites = (n: number, extra: BillingSite[] = []): BillingSite[] => [
  ...Array.from({ length: n }, (_, i): BillingSite => ({ code: `S${i}`, name: `S${i}`, status: "live", liveAt: "2026-09-01T00:00:00Z" })),
  ...extra,
];
const groupSub = (qty: number, tagged = false): SiteSubLike => ({
  id: "sub_g",
  status: "active",
  current_period_start: START,
  items: { data: [{ id: "si_g", quantity: qty, metadata: tagged ? { forecourt_line: "group_site" } : {}, price: { unit_amount: 24_900, product: "prod_g", recurring: {} } }] },
});
const franchiseSub = (extraQty?: number): SiteSubLike => ({
  id: "sub_f",
  status: "active",
  current_period_start: START,
  items: {
    data: [
      { id: "si_base", quantity: 1, metadata: {}, price: { unit_amount: 89_900, product: "prod_f", recurring: {} } },
      ...(extraQty != null ? [{ id: "si_extra", quantity: extraQty, metadata: { forecourt_line: "franchise_extra" }, price: { unit_amount: 10_000, product: "prod_f", recurring: {} } }] : []),
    ],
  },
});
const goLive = (code: string) => ({ code, from: "setting_up" as const, to: "live" as const });
const archive = (code: string) => ({ code, from: "live" as const, to: "archived" as const });

test("group: a site going live raises the quantity, prorated, with an idempotency key", async () => {
  const { subs, calls } = fake(groupSub(2));
  const newSite: BillingSite = { code: "N", name: "N", status: "live", liveAt: "2026-10-15T00:00:00Z" };
  const r = await syncSiteBilling({ subscriptions: subs }, { tenantId: 7, plan: "group", subscriptionId: "sub_g", sites: sites(2, [newSite]), event: goLive("N") });
  assert.equal(r.changed, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, { items: [{ id: "si_g", quantity: 3 }], proration_behavior: "create_prorations" });
  assert.deepEqual(calls[0].options, { idempotencyKey: "site-billing:7:N:live:group_site:2-3" });
});

test("group: archiving lowers the quantity with no proration", async () => {
  const { subs, calls } = fake(groupSub(3, true));
  const gone: BillingSite = { code: "S2", name: "S2", status: "archived", liveAt: "2026-09-01T00:00:00Z", archivedAt: "2026-10-12T00:00:00Z" };
  const r = await syncSiteBilling({ subscriptions: subs }, { tenantId: 7, plan: "group", subscriptionId: "sub_g", sites: [...sites(2), gone], event: archive("S2") });
  assert.equal(r.changed && r.proration, "none");
  assert.deepEqual(calls[0].params, { items: [{ id: "si_g", quantity: 2 }], proration_behavior: "none" });
});

test("re-running the same event changes nothing (idempotent)", async () => {
  const { subs, calls } = fake(groupSub(3));
  const r = await syncSiteBilling({ subscriptions: subs }, { tenantId: 7, plan: "group", subscriptionId: "sub_g", sites: sites(3), event: goLive("S2") });
  assert.deepEqual(r, { changed: false, reason: "already_in_step" });
  assert.equal(calls.length, 0);
});

test("no state change, site plan, no subscription and ended packages never call Stripe", async () => {
  const { subs, calls } = fake(groupSub(1));
  const base = { tenantId: 1, subscriptionId: "sub_g", sites: sites(2) };
  assert.equal((await syncSiteBilling({ subscriptions: subs }, { ...base, plan: "group", event: { code: "S0", from: "live", to: "live" } }) as { reason: string }).reason, "no_state_change");
  assert.equal((await syncSiteBilling({ subscriptions: subs }, { ...base, plan: "site", event: goLive("S0") }) as { reason: string }).reason, "plan_not_per_site");
  assert.equal((await syncSiteBilling({ subscriptions: subs }, { ...base, plan: "group", subscriptionId: null, event: goLive("S0") }) as { reason: string }).reason, "no_subscription");
  assert.equal((await syncSiteBilling({ subscriptions: subs }, { ...base, plan: "group", tenantStatus: "cancelled", event: goLive("S0") }) as { reason: string }).reason, "tenant_ended");
  assert.equal((await syncSiteBilling({ subscriptions: null }, { ...base, plan: "group", event: goLive("S0") }) as { reason: string }).reason, "stripe_not_configured");
  assert.equal(calls.length, 0);
});

test("set to cancel, ended and unrecognised subscriptions are left alone", async () => {
  for (const [sub, reason] of [
    [{ ...groupSub(1), cancel_at_period_end: true }, "set_to_cancel"],
    [{ ...groupSub(1), status: "canceled" }, "subscription_ended"],
    [{ ...groupSub(1), items: { data: [] } }, "unrecognised_items"],
  ] as const) {
    const { subs, calls } = fake(sub as SiteSubLike);
    const r = await syncSiteBilling({ subscriptions: subs }, { tenantId: 1, plan: "group", subscriptionId: "sub_g", sites: sites(2), event: goLive("S1") });
    assert.equal((r as { reason: string }).reason, reason);
    assert.equal(calls.length, 0);
  }
});

test("trialing subscription: quantity follows sites without any proration", async () => {
  const { subs, calls } = fake({ ...groupSub(2), status: "trialing" });
  await syncSiteBilling({ subscriptions: subs }, { tenantId: 1, plan: "group", subscriptionId: "sub_g", sites: sites(1), event: goLive("S0") });
  assert.deepEqual(calls[0].params, { items: [{ id: "si_g", quantity: 1 }], proration_behavior: "none" });
});

test("franchise: 5 live sites never touch the subscription", async () => {
  const { subs, calls } = fake(franchiseSub());
  const r = await syncSiteBilling({ subscriptions: subs }, { tenantId: 2, plan: "franchise", subscriptionId: "sub_f", sites: sites(5), event: goLive("S4") });
  assert.deepEqual(r, { changed: false, reason: "already_in_step" });
  assert.equal(calls.length, 0);
});

test("franchise: the 6th live site adds the Extra site line on the base product", async () => {
  const { subs, calls } = fake(franchiseSub());
  const sixth: BillingSite = { code: "S5", name: "S5", status: "live", liveAt: "2026-10-20T00:00:00Z" };
  await syncSiteBilling({ subscriptions: subs }, { tenantId: 2, plan: "franchise", subscriptionId: "sub_f", sites: sites(5, [sixth]), event: goLive("S5") });
  assert.deepEqual(calls[0].params, {
    items: [{ price_data: { currency: "gbp", unit_amount: 10_000, recurring: { interval: "month" }, product: "prod_f" }, quantity: 1, metadata: { forecourt_line: "franchise_extra" } }],
    proration_behavior: "create_prorations",
  });
});

test("franchise: 12 to 11 lowers extra sites, 6 to 5 removes the line, both with no proration", async () => {
  let f = fake(franchiseSub(7));
  const gone = (c: string): BillingSite => ({ code: c, name: c, status: "archived", liveAt: "2026-09-01T00:00:00Z", archivedAt: "2026-10-10T00:00:00Z" });
  await syncSiteBilling({ subscriptions: f.subs }, { tenantId: 2, plan: "franchise", subscriptionId: "sub_f", sites: sites(11, [gone("X")]), event: archive("X") });
  assert.deepEqual(f.calls[0].params, { items: [{ id: "si_extra", quantity: 6 }], proration_behavior: "none" });
  f = fake(franchiseSub(1));
  await syncSiteBilling({ subscriptions: f.subs }, { tenantId: 2, plan: "franchise", subscriptionId: "sub_f", sites: sites(5, [gone("Y")]), event: archive("Y") });
  assert.deepEqual(f.calls[0].params, { items: [{ id: "si_extra", deleted: true }], proration_behavior: "none" });
});

test("a Stripe failure is reported, never thrown", async () => {
  const { subs } = fake(groupSub(1), { fail: true });
  const r = await syncSiteBilling({ subscriptions: subs }, { tenantId: 1, plan: "group", subscriptionId: "sub_g", sites: sites(2), event: goLive("S1") });
  assert.equal((r as { reason: string }).reason, "stripe_error");
  assert.match(siteSyncMessage(r), /nothing changed/);
});
