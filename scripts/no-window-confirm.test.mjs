import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Office and account confirms use the solid sheet (askConfirm), never the browser box.
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs)$/.test(n)) out.push(p);
  }
  return out;
}

test("no window.confirm left in app code", () => {
  const hits = walk("src").filter((f) =>
    /window\.confirm\s*\(|(^|[^.\w])confirm\s*\(\s*[`"']/m.test(readFileSync(f, "utf8")),
  );
  assert.deepEqual(hits, []);
});
