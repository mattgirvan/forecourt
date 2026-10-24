import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../routes/account.tsx", import.meta.url), "utf8");

const rule = (sel: string) => {
  const m = css.match(new RegExp(`\\n\\s*\\${sel} \\{([^}]*)\\}`, "g")) ?? [];
  return m.join("\n");
};

test("mobile top bar and bottom bar are solid, nothing shows through", () => {
  for (const sel of [".fc-mtop", ".fc-bnav"]) {
    const r = rule(sel);
    assert.ok(r, `${sel} rule found`);
    assert.doesNotMatch(r, /backdrop-filter/, `${sel} has no blur`);
    assert.doesNotMatch(r, /background:\s*rgba/, `${sel} has no see through background`);
  }
});

test("shell nav marks only the showing view as current", () => {
  // The router's Link sets aria-current on any URL match; account views share a URL.
  assert.doesNotMatch(shell, /<Link[^>]*\bto=\{i\.to\}/);
  assert.doesNotMatch(shell, /<Link[^>]*\bto=\{item\.to\}/);
  assert.match(shell, /aria-current=\{current \? "page" : undefined\}/);
  assert.match(account, /section === "overview" \? "overview" : null/);
});
