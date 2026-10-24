import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDeskEvent, signDeskBody, verifyDeskSignature, deskEventKey } from "../desk-events.ts";
import { handleDeskEvent, type DeskEventDeps } from "./desk-events-server.ts";
import type { AccountEvent } from "../account-events.ts";

const SECRET = "k".repeat(40);
const NOW = 1_800_000_000;
const sites = [
  { code: "A", name: "Ridgeway North", status: "live" as const },
  { code: "B", name: "Ridgeway South", status: "live" as const },
];

function deps(over: Partial<DeskEventDeps> = {}) {
  const sent: AccountEvent[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  const d: DeskEventDeps = {
    findLink: async (k) => (k === "desk_rm" ? { tenantId: 7, keyId: "desk_rm", secret: SECRET, revoked: false } : null),
    loadAccount: async () => ({ plan: "group", sites }),
    send: async (_t, ev) => {
      if (seen.has(ev.dedupe)) return;
      seen.add(ev.dedupe);
      sent.push(ev);
    },
    note: async (_t, title) => notes.push(title),
    nowSeconds: NOW,
    ...over,
  };
  return { d, sent, notes };
}
const post = (body: object, opts: { ts?: number; secret?: string; key?: string } = {}) => {
  const raw = JSON.stringify(body);
  const ts = String(opts.ts ?? NOW);
  return { keyId: opts.key ?? "desk_rm", timestamp: ts, signature: signDeskBody(opts.secret ?? SECRET, ts, raw), raw };
};
const added = { event_id: "site_added:E:991", kind: "site_added", site: { code: "E", name: "Ridgeway East" }, actor: "boss@ridgeway.test" };

test("signature: right secret passes, wrong secret, stale or missing fail", () => {
  const q = post(added);
  const p = { timestamp: q.timestamp, signature: q.signature, body: q.raw };
  assert.deepEqual(verifyDeskSignature({ secret: SECRET, ...p, nowSeconds: NOW }), { ok: true });
  assert.deepEqual(verifyDeskSignature({ secret: "x".repeat(40), ...p, nowSeconds: NOW }), { ok: false, reason: "bad_signature" });
  assert.deepEqual(verifyDeskSignature({ secret: SECRET, ...p, nowSeconds: NOW + 301 }), { ok: false, reason: "stale" });
  assert.deepEqual(verifyDeskSignature({ secret: SECRET, ...p, signature: null, nowSeconds: NOW }), { ok: false, reason: "missing" });
  assert.deepEqual(verifyDeskSignature({ secret: SECRET, ...p, body: p.body.replace("East", "West"), nowSeconds: NOW }), { ok: false, reason: "bad_signature" });
});

test("site added: emails admin and hello@ with the price preview, once per event", async () => {
  const { d, sent, notes } = deps();
  const r = await handleDeskEvent(post(added), d);
  assert.equal(r.status, 200);
  await handleDeskEvent(post(added), d); // desk resend
  assert.equal(sent.length, 1);
  assert.equal(sent[0].title, "Ridgeway East added");
  assert.equal(sent[0].dedupe, `site-added:${deskEventKey(7, "desk_rm", "site_added:E:991")}`);
  assert.equal(sent[0].lines[1], "From its go live day this adds £249 a month, bringing your monthly total to £747. Until then it is not billed.");
  assert.match(notes[0], /^Desk: Ridgeway East added/);
});

test("site added to a Franchise inside the included five: no extra", async () => {
  const { d, sent } = deps({ loadAccount: async () => ({ plan: "franchise", sites }) });
  await handleDeskEvent(post(added), d);
  assert.equal(sent[0].lines[1], "It is included in your plan, so your monthly total stays at £899 when it goes live.");
});

test("removed, restored and staff access change", async () => {
  const { d, sent } = deps();
  await handleDeskEvent(post({ event_id: "site_removed:B:5", kind: "site_removed", site: { code: "B", name: "Ridgeway South" } }), d);
  await handleDeskEvent(post({ event_id: "site_restored:B:6", kind: "site_restored", site: { code: "B", name: "Ridgeway South" }, actor: "boss@ridgeway.test" }), d);
  await handleDeskEvent(post({ event_id: "staff_access_changed:sam@ridgeway.test:7", kind: "staff_access_changed", staff: { email: "sam@ridgeway.test", all_sites: false, sites: ["A", "B"] }, actor: "boss@ridgeway.test" }), d);
  assert.deepEqual(sent.map((e) => e.kind), ["site_removed", "site_restored", "staff_access_changed"]);
  assert.match(sent[0].lines[1], /end of this billing period\. We don't refund part months\. You can restore it within 30 days\./);
  assert.equal(sent[1].lines[0], "Ridgeway South was restored on your Forecourt desk by boss@ridgeway.test.");
  assert.equal(sent[2].lines[0], "sam@ridgeway.test can now see: Ridgeway North, Ridgeway South.");
});

test("refuses unknown desks, revoked links, bad signatures and bad events", async () => {
  const { d, sent } = deps();
  assert.equal((await handleDeskEvent(post(added, { key: "nope" }), d)).status, 401);
  assert.equal((await handleDeskEvent(post(added, { secret: "z".repeat(40) }), d)).status, 401);
  assert.equal((await handleDeskEvent(post(added, { ts: NOW - 3600 }), d)).status, 401);
  assert.equal((await handleDeskEvent(post({ kind: "site_added" }), d)).status, 400);
  const revoked = deps({ findLink: async () => ({ tenantId: 7, keyId: "desk_rm", secret: SECRET, revoked: true }) });
  assert.equal((await handleDeskEvent(post(added), revoked.d)).status, 401);
  assert.equal(sent.length, 0);
  assert.equal(parseDeskEvent("not json"), null);
});

test("no dashes and no banned words in the desk email copy", async () => {
  const { d, sent } = deps();
  await handleDeskEvent(post(added), d);
  await handleDeskEvent(post({ event_id: "r", kind: "site_removed", site: { code: "B", name: "Ridgeway South" } }), d);
  for (const e of sent) assert.doesNotMatch([e.title, ...e.lines].join(" "), /[\u2013\u2014]|glass/i);
});
