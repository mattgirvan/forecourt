import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANS, monthTotalPence, FRANCHISE_INCLUDED_SITES, FRANCHISE_EXTRA_SITE_PENCE } from "./catalog.ts";

test("franchise is £899 flat a month with £6,500 setup", () => {
  assert.equal(PLANS.franchise.monthPence, 89_900);
  assert.equal(PLANS.franchise.setupPence, 650_000);
  assert.equal(PLANS.franchise.perSite, false);
  assert.equal(monthTotalPence("franchise", 1), 89_900);
  assert.equal(monthTotalPence("franchise", 5), 89_900);
});

test("franchise extras are defined for the group build", () => {
  assert.equal(FRANCHISE_INCLUDED_SITES, 5);
  assert.equal(FRANCHISE_EXTRA_SITE_PENCE, 10_000);
});

test("site and group prices unchanged", () => {
  assert.equal(PLANS.site.monthPence, 39_900);
  assert.equal(PLANS.group.monthPence, 24_900);
  assert.equal(monthTotalPence("group", 3), 3 * 24_900);
});

test("franchise copy has no dashes and never says glass", () => {
  const f = PLANS.franchise;
  for (const s of [f.body, f.why, f.tag, ...f.includes]) {
    assert.ok(!/[\u2013\u2014]/.test(s), s);
    assert.ok(!/glass/i.test(s), s);
  }
});

test("plan cards say roles, not seats", () => {
  assert.equal(PLANS.franchise.body, "Manufacturer feed, option codes, unlimited staff logins.");
  assert.ok(PLANS.franchise.includes.includes("Every role: host, progressor, admin, accounts"));
  for (const p of Object.values(PLANS)) {
    for (const s of [p.body, p.why, p.tag, ...p.includes]) assert.ok(!/seat/i.test(s), s);
  }
});
