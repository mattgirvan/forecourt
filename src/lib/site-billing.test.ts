import { test } from "node:test";
import assert from "node:assert/strict";
import { amountLabel, lineLabel, linesFor, liveSiteCount, monthlyPence, paidSlotsThisPeriod, parseBillingSites, prorationFor, siteBreakdown, type BillingSite } from "./site-billing.ts";

const live = (n: number): BillingSite[] => Array.from({ length: n }, (_, i) => ({ code: `S${i}`, name: `Site ${i}`, status: "live" }));

test("group: £249 x live sites, minimum 2, at 0, 1, 2, 5, 6 and 12", () => {
  for (const [n, qty, pence] of [[0, 2, 49_800], [1, 2, 49_800], [2, 2, 49_800], [5, 5, 124_500], [6, 6, 149_400], [12, 12, 298_800]] as const) {
    const lines = linesFor("group", n);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].quantity, qty);
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
  assert.equal(f.rows[0].note, "");
  assert.equal(amountLabel(f.rows[0]), "Included");
  assert.equal(amountLabel(f.rows[5]), "£100");
  assert.equal(amountLabel(f.rows[6]), "Not billed");
  assert.equal(amountLabel(f.rows[7]), "Not billed");
  assert.equal(amountLabel(siteBreakdown("group", sites).rows[0]), "£249");
  assert.equal(f.rows[0].included, true);
  assert.equal(f.rows[5].note, "Extra site");
  assert.equal(f.rows[5].included, undefined);
  assert.equal(siteBreakdown("group", sites).rows[0].note, "");
  assert.equal(f.rows[6].pence, 0);
  assert.equal(f.rows[6].note, "");
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

test("totals copy", () => {
  assert.equal(lineLabel(linesFor("group", 3)[0]), "3 live sites at £249");
  assert.equal(lineLabel(linesFor("group", 1)[0]), "2 site minimum at £249 (1 live)");
  assert.equal(lineLabel(linesFor("group", 2)[0]), "2 live sites at £249");
  const f = linesFor("franchise", 7);
  assert.equal(lineLabel(f[0]), "Franchise, up to 5 sites");
  assert.equal(lineLabel(f[1]), "2 extra sites at £100");
});

test("Atlas copy: go live and archive confirms use real totals, period end from the billing start day", async () => {
  const { goLiveConfirmCopy, archiveConfirmCopy, periodEndFrom, totalIf } = await import("./site-billing.ts");
  const sites: BillingSite[] = [
    { code: "N", name: "Ridgeway North", status: "live" },
    { code: "S", name: "Ridgeway South", status: "live" },
    { code: "R", name: "Ridgeway Retail", status: "setting_up" },
  ];
  assert.equal(totalIf("group", sites, "R", "live"), 74_700);
  assert.equal(goLiveConfirmCopy("Ridgeway Retail", 49_800, 74_700), "Put Ridgeway Retail live? From today the bill goes up by £249 to £747 a month. The part month is added to the next invoice.");
  assert.equal(goLiveConfirmCopy("Ridgeway South", 49_800, 49_800), "Put Ridgeway South live? The bill stays at £498 a month.");
  const end = periodEndFrom("2026-08-31T10:00:00Z", new Date("2026-10-24T07:00:00Z"));
  assert.equal(end, "2026-10-31T10:00:00.000Z");
  assert.equal(periodEndFrom("2026-01-31T10:00:00Z", new Date("2026-02-10T00:00:00Z")), "2026-02-28T10:00:00.000Z");
  assert.equal(periodEndFrom(null), null);
  assert.equal(archiveConfirmCopy("Ridgeway North", 74_700, 49_800, end), "Archive Ridgeway North? The bill goes down by one site from 31 Oct 2026, the end of this billing period. We don't refund part months. New monthly total: £498.");
  assert.equal(archiveConfirmCopy("Ridgeway North", 49_800, 49_800, null), "Archive Ridgeway North? The bill stays at £498 a month. We don't refund part months.");
});
