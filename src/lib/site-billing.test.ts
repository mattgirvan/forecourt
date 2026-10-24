import { test } from "node:test";
import assert from "node:assert/strict";
import { linesFor, liveSiteCount, monthlyPence, paidSlotsThisPeriod, parseBillingSites, prorationFor, siteBreakdown, type BillingSite } from "./site-billing.ts";

const live = (n: number): BillingSite[] => Array.from({ length: n }, (_, i) => ({ code: `S${i}`, name: `Site ${i}`, status: "live" }));

test("group: £249 x live sites at 0, 1, 5, 6 and 12", () => {
  for (const [n, pence] of [[0, 0], [1, 24_900], [5, 124_500], [6, 149_400], [12, 298_800]] as const) {
    const lines = linesFor("group", n);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].quantity, n);
    assert.equal(monthlyPence(lines), pence, `group ${n}`);
  }
});

test("franchise: £899 flat, extra site line only past 5", () => {
  for (const [n, extra, pence] of [[0, 0, 89_900], [1, 0, 89_900], [5, 0, 89_900], [6, 1, 99_900], [12, 7, 159_900]] as const) {
    const lines = linesFor("franchise", n);
    assert.equal(lines[0].quantity, 1);
    assert.equal(lines.find((l) => l.key === "franchise_extra")?.quantity ?? 0, extra, `franchise ${n}`);
    assert.equal(monthlyPence(lines), pence);
  }
});

test("site plan is never touched by site events", () => {
  assert.deepEqual(linesFor("site", 4), []);
});

test("only live sites count: setting up and archived do not", () => {
  const sites: BillingSite[] = [...live(5), { code: "N", name: "New one", status: "setting_up" }, { code: "X", name: "Old", status: "archived" }];
  assert.equal(liveSiteCount(sites), 5);
  assert.equal(monthlyPence(linesFor("franchise", liveSiteCount(sites))), 89_900);
  assert.equal(monthlyPence(linesFor("group", liveSiteCount(sites))), 124_500);
});

test("breakdown shows each site and what it adds", () => {
  const sites: BillingSite[] = [...live(6), { code: "N", name: "Vans", status: "setting_up" }, { code: "X", name: "Yard", status: "archived" }];
  const f = siteBreakdown("franchise", sites);
  assert.equal(f.total, 99_900);
  assert.equal(f.rows.filter((r) => r.pence === 10_000).length, 1);
  assert.equal(f.rows[6].pence, 0);
  assert.match(f.rows[6].note, /go live day/);
  assert.match(f.rows[7].note, /not billed from the next period/);
  assert.equal(siteBreakdown("group", sites).total, 149_400);
});

test("archiving mid period: no proration down, and the paid slot is reused at no charge", () => {
  const start = "2026-10-01T00:00:00Z";
  const sites: BillingSite[] = [
    { code: "A", name: "A", status: "live", liveAt: "2026-09-01T00:00:00Z" },
    { code: "B", name: "B", status: "live", liveAt: "2026-09-01T00:00:00Z" },
    { code: "C", name: "C", status: "archived", liveAt: "2026-09-01T00:00:00Z", archivedAt: "2026-10-12T00:00:00Z" },
  ];
  assert.equal(liveSiteCount(sites), 2);
  assert.equal(paidSlotsThisPeriod(sites, start), 3);
  assert.equal(prorationFor(3, 2, 3), "none");
  assert.equal(prorationFor(2, 3, 3), "none");
  assert.equal(prorationFor(3, 4, 3), "create_prorations");
  // A site archived before this period started is not a paid slot.
  const older: BillingSite[] = [{ ...sites[2], archivedAt: "2026-09-20T00:00:00Z" }];
  assert.equal(paidSlotsThisPeriod(older, start), 0);
});

test("parses tenants.sites JSON, plain names count as live", () => {
  assert.deepEqual(parseBillingSites('["Main"]'), [{ code: "Main", name: "Main", status: "live" }]);
  assert.equal(parseBillingSites('[{"name":"A","status":"archived","archived_at":"2026-10-01"}]')[0].archivedAt, "2026-10-01");
  assert.deepEqual(parseBillingSites("nope"), []);
});
