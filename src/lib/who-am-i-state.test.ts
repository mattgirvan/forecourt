import { test } from "node:test";
import assert from "node:assert/strict";
import { whoAmIPending } from "./who-am-i-state.ts";

test("pending until the stored session has been read", () => {
  assert.equal(whoAmIPending(false, null, undefined), true);
  assert.equal(whoAmIPending(false, null, null), true);
});

test("pending while the lookup for the current token runs", () => {
  assert.equal(whoAmIPending(true, "t1", undefined), true);
  assert.equal(whoAmIPending(true, "t1", null), true);
  assert.equal(whoAmIPending(true, "t2", "t1"), true);
});

test("done once the current token (or signed out) has resolved", () => {
  assert.equal(whoAmIPending(true, "t1", "t1"), false);
  assert.equal(whoAmIPending(true, null, null), false);
});
