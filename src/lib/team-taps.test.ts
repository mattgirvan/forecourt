import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("Team and ticket controls are at least 44px tall", () => {
  for (const f of ["../components/office/staff-panel.tsx", "../components/office/support-desk.tsx"]) {
    const src = read(f);
    assert.doesNotMatch(src, /\b(md:)?h-(7|8|9|10)\b/, `${f} has no short tap targets`);
  }
});

test("Team copy uses commas, not dots or dashes", () => {
  const src = read("../components/office/staff-panel.tsx");
  assert.doesNotMatch(src, /[·—–]/);
});
