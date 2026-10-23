import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, cardLabel, siteDetails, statusTone, validStatus, isOpenStatus, STATUS_LABEL, CHANGE_TYPES, updatedWhen, ukDate } from "./live-view.ts";

test("term end is go live plus contract months, clamped to month end", () => {
  assert.equal(addMonths("2026-09-14T10:00:00.000Z", 12).slice(0, 10), "2027-09-14");
  assert.equal(addMonths("2027-01-31T00:00:00.000Z", 1).slice(0, 10), "2027-02-28");
});

test("site details prefer sign off, fall back to the live stage, no term without contract", () => {
  const a = siteDetails({ domain: " desk.x.co.uk ", signedOffAt: "2026-09-14T10:00:00Z", liveStageAt: "2026-09-10T10:00:00Z", contractMonths: 12, now: new Date("2026-10-23T00:00:00Z") });
  assert.equal(a.domain, "desk.x.co.uk");
  assert.equal(a.goLiveAt, "2026-09-14T10:00:00Z");
  assert.equal(a.renewsAt!.slice(0, 10), "2027-09-14");
  const later = siteDetails({ signedOffAt: "2024-09-14T10:00:00Z", contractMonths: null, now: new Date("2026-10-23T00:00:00Z") });
  assert.equal(later.renewsAt!.slice(0, 10), "2027-09-14");
  const b = siteDetails({ domain: "", liveStageAt: "2026-09-10T10:00:00Z", contractMonths: null });
  assert.equal(b.domain, null);
  assert.equal(b.renewsAt!.slice(0, 4) >= "2027", true);
});

test("statuses per kind and their tones", () => {
  assert.ok(validStatus("ticket", "resolved"));
  assert.ok(!validStatus("ticket", "done"));
  assert.ok(validStatus("change", "declined"));
  assert.equal(statusTone("done"), "done");
  assert.equal(statusTone("in_progress"), "strong");
  assert.ok(!isOpenStatus("resolved"));
});

test("card label and copy rules", () => {
  assert.equal(cardLabel({ brand: "visa", last4: "4242" }), "Visa ending 4242");
  assert.equal(cardLabel(null), "None on file");
  const copy = [...Object.values(STATUS_LABEL), ...CHANGE_TYPES.flatMap((c) => [c.label, c.hint])].join(" ");
  assert.doesNotMatch(copy, /[\u2013\u2014]|glass|portal/i);
});

test("dates say Sep, never Sept", () => {
  assert.equal(ukDate("2026-09-14T10:00:00Z"), "14 Sep 2026");
  assert.equal(updatedWhen("2026-09-14T10:00:00Z", new Date("2026-10-23T12:00:00Z")), "14 Sep");
});

test("updated when", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  assert.match(updatedWhen("2026-10-23T08:12:00Z", now), /^Today, 09:12$/);
  assert.equal(updatedWhen("2026-10-22T08:12:00Z", now), "Yesterday");
  assert.equal(updatedWhen("2026-10-12T08:12:00Z", now), "12 Oct");
});
