import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS, accountStatusLabel, advance, isUpgrade, nextStage, officeCanMark, priceDue, scenarioFor, trackerFor, type MigrationRow } from "./migration.ts";
import { migrationEvent, migrationKey } from "./account-events.ts";

const row = (p: Partial<MigrationRow>): MigrationRow => ({ id: 7, from_plan: "site", to_plan: "group", status: "pending_payment", migration_stage: "requested", stage_times: {}, created_at: "2026-10-01T09:00:00Z", ...p });

test("six scenarios, upgrades pay first, downgrades never pay", () => {
  assert.deepEqual(Object.keys(SCENARIOS).sort(), ["franchise_to_group", "franchise_to_site", "group_to_franchise", "group_to_site", "site_to_franchise", "site_to_group"]);
  for (const s of ["site_to_franchise", "site_to_group", "franchise_to_group"] as const) {
    assert.deepEqual(SCENARIOS[s].map((x) => x.stage), ["requested", "paid", "switched", "setup", "complete"]);
    assert.ok(isUpgrade(s));
  }
  for (const s of ["group_to_franchise", "group_to_site", "franchise_to_site"] as const) {
    assert.deepEqual(SCENARIOS[s].map((x) => x.stage), ["requested", "switched", "setup", "priced", "complete"]);
    assert.ok(!isUpgrade(s));
  }
  assert.equal(scenarioFor("site", "site"), null);
});

test("tracker: reached stages are done, the next one is now", () => {
  const t = trackerFor(row({ migration_stage: "switched", status: "applied" }))!;
  assert.deepEqual(t.steps.map((s) => s.state), ["done", "done", "done", "now", "next"]);
  assert.equal(accountStatusLabel(t), "Migration");
  assert.equal(t.steps[0]!.at, "2026-10-01T09:00:00Z");
});

test("exit back to Live: complete, cancelled, failed or no tracker", () => {
  assert.equal(accountStatusLabel(trackerFor(row({ migration_stage: "complete", status: "applied" }))), "Live");
  assert.equal(accountStatusLabel(trackerFor(row({ migration_cancelled_at: "2026-10-02T00:00:00Z" }))), "Live");
  assert.equal(accountStatusLabel(trackerFor(row({ status: "cancelled" }))), "Live");
  assert.equal(accountStatusLabel(trackerFor(row({ migration_stage: null }))), "Live");
  assert.equal(accountStatusLabel(null), "Live");
  const done = trackerFor(row({ migration_stage: "complete", status: "applied" }))!;
  assert.ok(done.steps.every((s) => s.state === "done"));
});

test("Office marks only Forecourt steps, in order", () => {
  assert.equal(officeCanMark("site_to_group", "requested", "paid"), false);
  assert.equal(officeCanMark("site_to_group", "switched", "setup"), true);
  assert.equal(officeCanMark("site_to_group", "switched", "complete"), false);
  assert.equal(officeCanMark("group_to_site", "switched", "setup"), true);
  assert.equal(officeCanMark("group_to_site", "setup", "priced"), false);
  assert.equal(officeCanMark("group_to_site", "priced", "complete"), true);
  assert.equal(nextStage("group_to_site", "complete"), null);
});

test("downgrade price step is due only after the period end and the trim", () => {
  const r = row({ from_plan: "group", to_plan: "site", status: "scheduled", migration_stage: "setup", effective_at: "2026-11-01T00:00:00Z" });
  assert.equal(priceDue(trackerFor(r)!, new Date("2026-10-31T23:00:00Z")), false);
  assert.equal(priceDue(trackerFor(r)!, new Date("2026-11-01T00:00:01Z")), true);
  assert.equal(priceDue(trackerFor({ ...r, migration_stage: "switched" })!, new Date("2026-12-01T00:00:00Z")), false);
});

test("advance fills skipped stage times and sets completed_at only at the end", () => {
  const a = advance(row({}), "switched", "2026-10-03T10:00:00Z");
  assert.equal(a.stage_times.paid, "2026-10-03T10:00:00Z");
  assert.equal(a.stage_times.requested, "2026-10-03T10:00:00Z");
  assert.equal(a.completed_at, null);
  assert.equal(advance(row({ migration_stage: "setup" }), "complete", "x").completed_at, "x");
});

test("emails: one dedupe key per change and stage, honest lines", () => {
  assert.equal(migrationKey(7, "paid"), "migration:7:paid");
  const up = migrationEvent({ changeId: 7, from: "site", to: "group", stage: "requested", upgrade: true, setupDiffPence: 400_000 });
  assert.equal(up.dedupe, "migration:7:requested");
  assert.match(up.lines.join(" "), /£4,000/);
  const down = migrationEvent({ changeId: 8, from: "group", to: "site", stage: "requested", upgrade: false, periodEnd: "2026-11-01T00:00:00Z" });
  assert.match(down.title, /plan switched/);
  assert.match(down.lines.join(" "), /No setup refund/);
  assert.match(migrationEvent({ changeId: 8, from: "group", to: "site", stage: "cancelled", upgrade: false }).lines[0]!, /back to Live/);
  for (const st of ["requested", "paid", "priced", "complete", "cancelled"] as const) {
    const e = migrationEvent({ changeId: 1, from: "franchise", to: "group", stage: st, upgrade: true, newMonthlyPence: 50_000 });
    assert.doesNotMatch(e.title + e.lines.join(" "), /[–—]|glass/i);
  }
});
