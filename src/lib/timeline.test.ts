import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newestFirst, timelineMeta } from "./timeline.ts";

test("meta line drops the trailing full stop before the comma", () => {
  assert.equal(timelineMeta("Logged by the office.", "24 Sep 2026, 14:04"), "Logged by the office, 24 Sep 2026, 14:04");
  assert.equal(timelineMeta("Logged by the office", "24 Sep 2026, 14:04"), "Logged by the office, 24 Sep 2026, 14:04");
  assert.equal(timelineMeta("", "24 Sep 2026, 14:04"), "24 Sep 2026, 14:04");
  assert.equal(timelineMeta(null, "24 Sep 2026, 14:04"), "24 Sep 2026, 14:04");
  assert.equal(timelineMeta("Done.", ""), "Done");
});

test("events show newest first", () => {
  const ev = [
    { id: 1, created_at: "2026-09-24T13:04:00Z" },
    { id: 2, created_at: "2026-10-06T13:04:00Z" },
    { id: 3, created_at: "2026-09-30T13:04:00Z" },
    { id: 4, created_at: null },
  ];
  assert.deepEqual(newestFirst(ev).map((e) => e.id), [2, 3, 1, 4]);
  assert.deepEqual(ev.map((e) => e.id), [1, 2, 3, 4]);
});

test("Timeline uses the helpers", () => {
  const src = readFileSync("src/components/build/order-desk.tsx", "utf8");
  assert.match(src, /order = "oldest"/);
  assert.match(src, /order === "newest" \? newestFirst\(events\) : events/);
  const uses = src.match(/<Timeline [^>]*\/>/g) ?? [];
  assert.equal(uses.filter((u) => u.includes('order="newest"')).length, 1);
  assert.ok(uses.some((u) => !u.includes("order=")));
  assert.match(src, /timelineMeta\(e\.body/);
});
