import test from "node:test";
import assert from "node:assert/strict";
import { moveLines, partMonthPence, planMove, priceDirection } from "./plan-change-rules.ts";

const pick = (m: ReturnType<typeof planMove>) => [m.direction, m.setupDuePence, m.needsPayment, m.monthlyStarts];

test("prices: Group £249 a site, Franchise £899, Site £399", () => {
  assert.equal(planMove({ from: "site", to: "group", live: 2 }).newMonthlyPence, 49_800);
  assert.equal(planMove({ from: "site", to: "franchise", live: 2 }).newMonthlyPence, 89_900);
  assert.equal(planMove({ from: "franchise", to: "site", live: 1 }).newMonthlyPence, 39_900);
});

test("Site to Franchise: price up, £2,000 now, starts on go live", () => {
  assert.deepEqual(pick(planMove({ from: "site", to: "franchise", live: 1 })), ["up", 200_000, true, "on_go_live"]);
});

test("Site to Group at 2 sites: price up, £4,000 now, starts on go live", () => {
  assert.deepEqual(pick(planMove({ from: "site", to: "group", live: 2 })), ["up", 400_000, true, "on_go_live"]);
});

test("Onto Group when the price falls still pays setup, monthly at period end", () => {
  const m = planMove({ from: "site", to: "group", live: 1, oldMonthlyPence: 60_000, newMonthlyPence: 49_800 });
  assert.deepEqual(pick(m), ["down", 400_000, true, "period_end"]);
});

test("Franchise to Group at 2 and 3 sites: price falls, £2,000 now, monthly at period end", () => {
  for (const live of [2, 3]) assert.deepEqual(pick(planMove({ from: "franchise", to: "group", live })), ["down", 200_000, true, "period_end"]);
});

test("Franchise to Group at 4 sites: price up, £2,000 now, starts on go live", () => {
  assert.deepEqual(pick(planMove({ from: "franchise", to: "group", live: 4 })), ["up", 200_000, true, "on_go_live"]);
});

test("Group (2 or 3 sites) to Franchise: price up, £0 setup, no payment step, starts on go live", () => {
  for (const live of [2, 3]) assert.deepEqual(pick(planMove({ from: "group", to: "franchise", live })), ["up", 0, false, "on_go_live"]);
});

test("Group at 4 sites to Franchise: price falls, nothing to pay, period end", () => {
  assert.deepEqual(pick(planMove({ from: "group", to: "franchise", live: 4 })), ["down", 0, false, "period_end"]);
});

test("Moves down to Site: no charge, no refund, period end", () => {
  assert.deepEqual(pick(planMove({ from: "franchise", to: "site", live: 1 })), ["down", 0, false, "period_end"]);
  assert.deepEqual(pick(planMove({ from: "group", to: "site", live: 3 })), ["down", 0, false, "period_end"]);
});

test("Equal price swap: no charge, change at period end", () => {
  const m = planMove({ from: "franchise", to: "site", live: 1, oldMonthlyPence: 50_000, newMonthlyPence: 50_000 });
  assert.deepEqual(pick(m), ["equal", 0, false, "period_end"]);
  const g = planMove({ from: "franchise", to: "group", live: 2, oldMonthlyPence: 50_000, newMonthlyPence: 50_000 });
  assert.deepEqual(pick(g), ["equal", 200_000, true, "period_end"], "onto Group still pays setup");
});

test("Same plan: nothing happens", () => {
  assert.deepEqual(pick(planMove({ from: "group", to: "group", live: 2 })), ["same_plan", 0, false, "never"]);
  assert.equal(priceDirection(1, 1, true), "same_plan");
});

test("Part month runs from go live to period end, rises only", () => {
  const START = 1_700_000_000, END = START + 30 * 86_400;
  const up = planMove({ from: "site", to: "franchise", live: 1 });
  assert.equal(partMonthPence(up, START + 15 * 86_400, START, END), Math.round((89_900 - 39_900) / 2));
  assert.equal(partMonthPence(up, END + 5, START, END), 0);
  assert.equal(partMonthPence(up, START, null, null), 0);
  assert.equal(partMonthPence(planMove({ from: "franchise", to: "group", live: 2 }), START, START, END), 0);
});

test("Copy: inc. VAT, go live wording, no dashes, no glass", () => {
  const all = [
    ...moveLines(planMove({ from: "site", to: "franchise", live: 1 })),
    ...moveLines(planMove({ from: "group", to: "franchise", live: 2 })),
    ...moveLines(planMove({ from: "franchise", to: "group", live: 2 }), "1 Dec 2026"),
    ...moveLines(planMove({ from: "group", to: "group", live: 2 })),
  ];
  assert.ok(all.some((l) => /^New monthly price: £[\d,]+ inc\. VAT, from the day your change goes live\.$/.test(l)));
  assert.ok(all.some((l) => /^New monthly price: £[\d,]+ inc\. VAT \(was £[\d,]+\), from 1 Dec 2026\.$/.test(l)));
  assert.ok(all.some((l) => l === "There is no refund for setup or part months."));
  assert.ok(!all.some((l) => l.startsWith("New monthly:")));
  assert.ok(all.some((l) => l.includes("£2,000 inc. VAT")));
  assert.ok(all.some((l) => l === "Nothing to pay now."));
  for (const l of all) {
    assert.ok(!/[-\u2010-\u2015]/.test(l), l);
    assert.ok(!/glass/i.test(l), l);
  }
});
