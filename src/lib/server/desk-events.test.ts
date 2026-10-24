import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDeskEvent, signDeskBody, verifyDeskSignature } from "../desk-events.ts";
import { handleDeskEvent, type DeskEventDeps } from "./desk-events-server.ts";
import { siteAddedEvent, type AccountEvent } from "../account-events.ts";
import { siteBreakdown, type BillingSite } from "../site-billing.ts";

const SECRET = "k".repeat(40);
const NOW = 1_800_000_000;
const sites = [
  { code: "A", name: "Ridgeway North", status: "live" as const },
  { code: "B", name: "Ridgeway South", status: "live" as const },
];

/** Fake of changeSiteState with notify off: same totals, Group minimum 2, Franchise 5 included. */
function fakeApply(plan: "group" | "franchise", list: BillingSite[], samePeriod = true, calls: string[] = []): DeskEventDeps["applySiteState"] {
  return async (_t, code, to, opts) => {
    calls.push(`${code}:${to}:${opts.restore}`);
    const site = list.find((x) => x.code === code);
    if (!site) return null;
    const before = siteBreakdown(plan, list).total;
    const from = site.status;
    site.status = to;
    const after = siteBreakdown(plan, list).total;
    return { billing: { from, to, beforePence: before, afterPence: after, plan, periodEnd: to === "archived" ? "2026-11-14T10:00:00Z" : null, samePeriod }, message: "Dry run. Stripe is not changed." };
  };
}

function deps(over: Partial<DeskEventDeps> = {}) {
  const sent: AccountEvent[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  const recorded: string[] = [];
  const d: DeskEventDeps = {
    applySiteState: fakeApply("group", sites.map((x) => ({ ...x }))),
    recordSite: async (_t, code) => recorded.push(code),
    findLink: async (k) => (k === "desk_rm" ? { tenantId: 7, keyId: "desk_rm", secret: SECRET, revoked: false } : null),
    loadAccount: async () => ({ plan: "group", sites }),
    send: async (_t, ev) => {
      if (seen.has(ev.dedupe)) return;
      seen.add(ev.dedupe);
      sent.push(ev);
    },
    note: async (_t, title, body) => notes.push(`${title} ${body}`),
    nowSeconds: NOW,
    ...over,
  };
  return { d, sent, notes, recorded };
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
  assert.equal(sent[0].dedupe, "site-added:7:e");
  assert.equal(sent[0].lines[1], "From its go live day this adds £249 a month, bringing your monthly total to £747. Until then it is not billed.");
  assert.match(notes[0], /^Desk: Ridgeway East added/);
});

test("site added to a Franchise inside the included five: no extra", async () => {
  const { d, sent } = deps({ loadAccount: async () => ({ plan: "franchise", sites }) });
  await handleDeskEvent(post(added), d);
  assert.equal(sent[0].lines[1], "It is included in your plan, so your monthly total stays at £899 when it goes live.");
});

test("archived in the desk: bill drops one site from the period end, through the Office billing path", async () => {
  const live3 = [...sites, { code: "C", name: "Ridgeway East", status: "live" as const }].map((x) => ({ ...x }));
  const calls: string[] = [];
  const { d, sent, notes } = deps({ applySiteState: fakeApply("group", live3, true, calls), loadAccount: async () => ({ plan: "group", sites: live3 }) });
  await handleDeskEvent(post({ event_id: "site_removed:C:5", kind: "site_removed", site: { code: "C", name: "Ridgeway East", status: "archived" }, actor: "boss@ridgeway.test" }), d);
  assert.deepEqual(calls, ["C:archived:false"]);
  assert.equal(sent[0].title, "Ridgeway East archived");
  assert.deepEqual(sent[0].lines, [
    "Ridgeway East was archived on your Forecourt desk by boss@ridgeway.test.",
    "Your bill goes down by one site from 14 Nov 2026. We don't refund part months. You can restore it in your desk within 30 days.",
  ]);
  assert.match(notes[0], /Billing: Dry run\. Stripe is not changed\./);
});

test("archived in the desk at the Group minimum or within Franchise's 5: bill stays, with the reason", async () => {
  const g = deps();
  await handleDeskEvent(post({ event_id: "r1", kind: "site_removed", site: { code: "B", name: "Ridgeway South" } }), g.d);
  assert.equal(g.sent[0].lines[1], "Your bill stays at £498 a month, because Group already bills a 2 site minimum. You can restore it in your desk within 30 days.");
  const fr = sites.map((x) => ({ ...x }));
  const f = deps({ applySiteState: fakeApply("franchise", fr), loadAccount: async () => ({ plan: "franchise", sites: fr }) });
  await handleDeskEvent(post({ event_id: "r2", kind: "site_removed", site: { code: "B", name: "Ridgeway South" } }), f.d);
  assert.equal(f.sent[0].lines[1], "Your bill stays at £899 a month, because Franchise includes up to 5 sites. You can restore it in your desk within 30 days.");
});

test("restored within the same period: archive cancelled, bill as before; after rollover: back on the bill from today", async () => {
  const list = () => [...sites, { code: "C", name: "Ridgeway East", status: "archived" as const }].map((x) => ({ ...x }));
  const same = deps({ applySiteState: fakeApply("group", list(), true) });
  await handleDeskEvent(post({ event_id: "x1", kind: "site_restored", site: { code: "C", name: "Ridgeway East", status: "live" }, actor: "boss@ridgeway.test" }), same.d);
  assert.deepEqual(same.sent[0].lines, ["Ridgeway East was restored on your Forecourt desk by boss@ridgeway.test.", "Its archive is cancelled and it stays on your bill as before."]);
  const later = deps({ applySiteState: fakeApply("group", list(), false) });
  await handleDeskEvent(post({ event_id: "x2", kind: "site_restored", site: { code: "C", name: "Ridgeway East", status: "live" } }), later.d);
  assert.equal(later.sent[0].lines[1], "It goes back on your bill from today, so your monthly total is £747. The part month is added to the next invoice.");
  const calls: string[] = [];
  const setup = deps({ applySiteState: fakeApply("group", list(), false, calls) });
  await handleDeskEvent(post({ event_id: "x3", kind: "site_restored", site: { code: "C", name: "Ridgeway East", status: "setting_up" } }), setup.d);
  assert.deepEqual(calls, ["C:setting_up:true"]);
  assert.equal(setup.sent[0].lines[1], "It is still setting up, so it is billed from its go live day.");
});

test("a site the account does not know: email without a billing claim, note says nothing changed", async () => {
  const { d, sent, notes } = deps();
  await handleDeskEvent(post({ event_id: "z", kind: "site_removed", site: { code: "Q", name: "Quarry Lane" } }), d);
  assert.deepEqual(sent[0].lines, ["Quarry Lane was archived on your Forecourt desk.", "You can restore it in your desk within 30 days."]);
  assert.match(notes[0], /site not on the account in Forecourt, nothing changed/);
});

test("staff access change", async () => {
  const { d, sent } = deps();
  await handleDeskEvent(post({ event_id: "staff_access_changed:sam@ridgeway.test:7", kind: "staff_access_changed", staff: { email: "sam@ridgeway.test", all_sites: false, sites: ["A", "B"] }, actor: "boss@ridgeway.test" }), d);
  assert.equal(sent[0].lines[0], "sam@ridgeway.test can now see: Ridgeway North, Ridgeway South.");
});

test("one site add emails once across #54 and #55: shared key, desk resends and re-adds included", async () => {
  const { d, sent, recorded } = deps();
  const office = siteAddedEvent({ tenantId: 7, siteCode: "E", siteName: "Ridgeway East", addsPence: 24_900, totalAfterPence: 74_700 });
  await d.send(7, office);
  await handleDeskEvent(post(added), d);
  await handleDeskEvent(post({ ...added, event_id: "site_added:E:992" }), d);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].dedupe, office.dedupe);
  assert.deepEqual(recorded, ["E", "E"], "recorded as setting up; the upsert ignores a site already known");
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
