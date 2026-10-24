import { test } from "node:test";
import assert from "node:assert/strict";
import { changeDirection, quoteLines, quotePlanChange, planMonthlyPence, DOWNGRADE_TIMING } from "./plan-change.ts";

const START = 1_000_000;
const END = START + 30 * 86_400;
const HALF = START + 15 * 86_400;

test("direction follows Site < Franchise < Group", () => {
  assert.equal(changeDirection("site", "group"), "upgrade");
  assert.equal(changeDirection("group", "franchise"), "downgrade");
  assert.equal(changeDirection("franchise", "franchise"), "same");
});

test("monthly per plan: Site £399, Franchise £899 (+£100 per site past 5), Group £249 per site min 2", () => {
  assert.equal(planMonthlyPence("site", 3), 39_900);
  assert.equal(planMonthlyPence("franchise", 7), 109_900);
  assert.equal(planMonthlyPence("group", 1), 49_800);
  assert.equal(planMonthlyPence("group", 4), 99_600);
});

test("upgrade Site to Group at half period: £4,000 setup now, half the monthly difference pro-rated, after payment", () => {
  const q = quotePlanChange({ from: "site", to: "group", live: 1, periodStart: START, periodEnd: END, now: HALF });
  assert.equal(q.setupDiffPence, 400_000);
  assert.equal(q.dueNowPence, 400_000);
  assert.equal(q.newMonthlyPence, 49_800);
  assert.equal(q.proratedPence, Math.round((49_800 - 39_900) / 2));
  assert.equal(q.effective, "after_payment");
  assert.match(quoteLines(q).join("\n"), /Setup difference, paid now: £4,000\n.*£49\.50\nNew monthly: £498 \(was £399\)\nGroup turns on once the setup payment succeeds\./);
});

test("upgrade Franchise to Group: £2,000 setup difference", () => {
  assert.equal(quotePlanChange({ from: "franchise", to: "group", live: 6 }).setupDiffPence, 200_000);
});

test("downgrade: no setup refund, period end by default, nothing pro-rated", () => {
  assert.equal(DOWNGRADE_TIMING, "period_end");
  const q = quotePlanChange({ from: "group", to: "site", live: 3, periodStart: START, periodEnd: END, now: HALF });
  assert.deepEqual([q.setupDiffPence, q.dueNowPence, q.proratedPence, q.effective], [0, 0, 0, "period_end"]);
  assert.match(quoteLines(q).join("\n"), /^No setup refund\.\nNothing extra to pay this month\.\nNew monthly: £399 \(was £747\), from 11 Feb 1970/);
});

test("downgrade with the switch on now: pro-rated credit", () => {
  const q = quotePlanChange({ from: "group", to: "site", live: 3, periodStart: START, periodEnd: END, now: HALF, downgradeTiming: "now" });
  assert.equal(q.effective, "now");
  assert.equal(q.proratedPence, Math.round((39_900 - 74_700) / 2));
  assert.match(quoteLines(q)[1], /credit on your next bill: £174/);
});
