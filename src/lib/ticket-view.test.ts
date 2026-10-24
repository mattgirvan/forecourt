import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ticketChip, ticketMeta } from "./ticket-view.ts";

test("ticket chip: amber only when waiting on us, green when solved, grey otherwise", () => {
  assert.deepEqual(ticketChip({ status: "open", needs_reply: true }), { tone: "action", label: "Waiting on us" });
  assert.deepEqual(ticketChip({ status: "resolved", needs_reply: false }), { tone: "live", label: "Solved" });
  assert.deepEqual(ticketChip({ status: "in_progress", needs_reply: false }), { tone: "neutral", label: "In progress" });
  assert.deepEqual(ticketChip({ status: "open", needs_reply: false }), { tone: "neutral", label: "Open" });
});

test("ticket meta uses commas and a UK date", () => {
  assert.equal(ticketMeta({ kind: "ticket", ref: 1038, change_type: null, created_at: "2026-10-19T10:00:00Z" }), "T-1038, opened 19 Oct 2026");
});

test("reply dock is solid and sits above the mobile bottom bar", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const dock = css.slice(css.indexOf(".fc-tix-dock {"), css.indexOf("}", css.indexOf(".fc-tix-dock {")));
  assert.match(dock, /background: var\(--fc-solid\)/);
  assert.doesNotMatch(dock, /backdrop-filter/);
  assert.match(css, /\.fc-tix-dock \{\s*bottom: calc\(var\(--fc-bnav-h\)/);
});
