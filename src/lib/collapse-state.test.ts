import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collapseKey, collapseLabel, initialOpen, storedValue } from "./collapse-state.ts";

test("collapsed under 768px, open on desktop, stored choice wins", () => {
  assert.equal(initialOpen(null, 390), false);
  assert.equal(initialOpen(null, 767), false);
  assert.equal(initialOpen(null, 768), true);
  assert.equal(initialOpen(null, 1280), true);
  assert.equal(initialOpen("open", 390), true);
  assert.equal(initialOpen("closed", 1280), false);
  assert.equal(initialOpen("junk", 390), false);
  assert.equal(initialOpen(null, undefined), true);
});

test("storage key and label", () => {
  assert.equal(collapseKey("dealer-history"), "fc-collapse:dealer-history");
  assert.equal(storedValue(true), "open");
  assert.equal(storedValue(false), "closed");
  assert.equal(collapseLabel("History", 12), "History (12)");
  assert.equal(collapseLabel("History"), "History");
});

test("component is accessible and animates with transform and opacity only", () => {
  const c = readFileSync("src/components/ui/collapsible-section.tsx", "utf8");
  assert.match(c, /aria-expanded=\{open\}/);
  assert.match(c, /aria-controls=\{bodyId\}/);
  const css = readFileSync("src/styles.css", "utf8");
  const kf = css.slice(css.indexOf("@keyframes fc-collapse-in"), css.indexOf("}", css.indexOf("to {", css.indexOf("@keyframes fc-collapse-in"))) + 1);
  assert.doesNotMatch(kf, /height|max-height/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\n  \.fc-collapse-in \{ animation: none; \}/);
  assert.match(readFileSync("src/components/build/order-desk.tsx", "utf8"), /<CollapsibleSection id="dealer-history" title="History"/);
});

test("Office Overview Recently live uses the foldable section with a count", () => {
  const src = readFileSync("src/components/office/overview.tsx", "utf8");
  assert.match(src, /<CollapsibleSection\s+id="overview-recent"\s+title="Recently live"\s+count=\{recent\.length\}/);
  assert.doesNotMatch(src, /<Section title="Recently live"/);
});
