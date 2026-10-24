import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PLAN_CHANGE_NOT_RECORDED,
  planChangeErrorFeedback,
  planChangeFeedback,
  planChangeOfficeRecordedMessage,
  planChangeRecordedMessage,
  quotePlanChange,
} from "./plan-change.ts";

const up = quotePlanChange({ from: "site", to: "franchise", live: 1, periodStart: null, periodEnd: null });
const down = quotePlanChange({ from: "group", to: "franchise", live: 2, periodStart: null, periodEnd: null });

test("each outcome has a tone: green only for done", () => {
  assert.equal(planChangeFeedback({ outcome: "applied", message: "x" }, "franchise").tone, "success");
  assert.equal(planChangeFeedback({ outcome: "scheduled", message: "x" }, "franchise").tone, "success");
  assert.equal(planChangeFeedback({ outcome: "recorded", message: "x" }, "franchise").tone, "pending");
  assert.equal(planChangeFeedback({ outcome: "checkout", message: "" }, "franchise").tone, "pending");
  assert.equal(planChangeFeedback({ outcome: "unchanged", message: "x" }, "franchise").tone, "pending");
  assert.equal(planChangeFeedback({ outcome: "failed", message: "" }, "franchise").tone, "error");
});

test("recorded reads as pending with a clear title", () => {
  const f = planChangeFeedback({ outcome: "recorded", message: planChangeRecordedMessage(up) }, "franchise");
  assert.equal(f.title, "Request recorded, we will apply it");
  assert.match(f.body, /Nothing has been charged/);
});

test("empty, missing or unknown replies never end in silence", () => {
  for (const r of [null, undefined, {}, { message: "" }, { outcome: "weird", message: "" }]) {
    const f = planChangeFeedback(r as never, "franchise");
    assert.equal(f.tone, "error");
    assert.ok(f.title.length > 0 && f.body.length > 0);
  }
  assert.equal(planChangeFeedback({ outcome: "failed", message: "" }, "site").body, PLAN_CHANGE_NOT_RECORDED);
  assert.ok(planChangeErrorFeedback(new Error("")).body.length > 0);
  assert.equal(planChangeErrorFeedback(new Error("Account not found.")).body, "Account not found.");
});

test("customer copy has no dashes and names the plan", () => {
  for (const m of [planChangeRecordedMessage(up), planChangeRecordedMessage(down), PLAN_CHANGE_NOT_RECORDED]) {
    assert.doesNotMatch(m, /[\u2012-\u2015]| - |glass/i);
    assert.doesNotMatch(m, /customer would/i);
  }
  assert.match(planChangeRecordedMessage(down), /Franchise/);
});

test("server: every requestPlanChange reply carries an outcome, dry run records a note", () => {
  const src = readFileSync("src/lib/server/plan-change-server.ts", "utf8");
  const body = src.slice(src.indexOf("export const requestPlanChange"), src.indexOf("async function noteOk"));
  assert.doesNotMatch(body, /return \{ message/);
  assert.match(body, /noteOk\(/);
  assert.match(body, /reply\(\s*"recorded"/);
  assert.match(body, /reply\("failed", PLAN_CHANGE_NOT_RECORDED\)/);
});

test("panel: a confirm always sets a message and errors stay in the sheet", () => {
  const src = readFileSync("src/components/account/plan-change.tsx", "utf8");
  assert.match(src, /planChangeFeedback\(r, to\)/);
  assert.match(src, /setSheetError\(planChangeErrorFeedback\(e\)\)/);
  assert.match(src, /role=\{feedback\.tone === "error" \? "alert" : "status"\}/);
});

test("office copy with sync off is plain English, not a dry run", () => {
  const m = planChangeOfficeRecordedMessage(down);
  assert.equal(m, "Billing switch off: request to move to Franchise recorded, nothing charged. Noted on the file.");
  assert.doesNotMatch(m, /dry run|[\u2012-\u2015]| - |glass/i);
  const src = readFileSync("src/lib/server/plan-change-server.ts", "utf8");
  assert.match(src, /data\.from === "office" \? planChangeOfficeRecordedMessage\(q\)/);
  assert.doesNotMatch(src, /\$\{planChangeDryRunMessage\(q\)\} Noted on the file/);
});
