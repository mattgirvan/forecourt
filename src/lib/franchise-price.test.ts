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

test("franchise is £899 up to 5 sites, then £100 a month per extra site", () => {
  assert.equal(FRANCHISE_INCLUDED_SITES, 5);
  assert.equal(FRANCHISE_EXTRA_SITE_PENCE, 10_000);
  assert.equal(monthTotalPence("franchise", 5), 89_900);
  assert.equal(monthTotalPence("franchise", 6), 99_900);
  assert.equal(monthTotalPence("franchise", 8), 119_900);
});

test("checkout, quotes and plan change all price Franchise extras the same way", async () => {
  const { siteBreakdown } = await import("./site-billing.ts");
  const { planMonthlyPence } = await import("./plan-change.ts");
  const live = (n: number) => Array.from({ length: n }, (_, i) => ({ code: `S${i}`, name: `Site ${i}`, status: "live" as const }));
  for (const [n, pence] of [[5, 89_900], [6, 99_900], [8, 119_900]] as const) {
    assert.equal(siteBreakdown("franchise", live(n) as never).total, pence, `breakdown ${n}`);
    assert.equal(planMonthlyPence("franchise", n), pence, `plan change ${n}`);
  }
  const { readFileSync } = await import("node:fs");
  const c = readFileSync("src/lib/server/commerce.ts", "utf8");
  assert.match(c, /franchiseExtraSites\(siteCount\)/);
  assert.match(c, /\$\{productName\} \(extra site\)/);
  assert.doesNotMatch(c, /"pilot" : /);
  assert.doesNotMatch(readFileSync("src/lib/catalog.ts", "utf8"), /checkout charges the flat line/);
  assert.doesNotMatch(readFileSync("src/components/account/plan-change.tsx", "utf8"), /Site \(Dealer\)/);
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

test("role table and Administrator copy say role, not seat", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["src/components/trust/seat-matrix.tsx", "src/components/account/portal.tsx", "src/components/trust/doors-map.tsx", "src/routes/trust.tsx", "src/routes/how.tsx", "src/lib/roles.ts"]) {
    const s = readFileSync(f, "utf8");
    assert.ok(!/>Seats</.test(s), f);
    assert.ok(!/administrator seat/i.test(s), f);
  }
});
