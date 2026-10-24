import { test } from "node:test";
import assert from "node:assert/strict";
import { compare } from "./desk-template-catchup.mjs";

test("finds missing and changed migrations", () => {
  const t = [{ name: "0001.sql", sha: "a" }, { name: "0005.sql", sha: "b" }, { name: "0007.sql", sha: "c" }];
  const d = [{ name: "0001.sql", sha: "a" }, { name: "0005.sql", sha: "x" }];
  assert.deepEqual(compare(t, d), { missing: ["0007.sql"], changed: ["0005.sql"] });
});
