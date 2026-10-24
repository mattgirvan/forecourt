/** Account event confirmations go to the admin AND hello@, each deduped once. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { deliverAccountEvent, deliverOfficeCopy, OFFICE_INBOX, type EmailLogStore, type JourneyEmail, type OutgoingEmail } from "./email-engine.ts";
import { managerAddedEvent, managerRemovedEvent, monthlyStartedEvent, planChangedEvent, siteArchivedEvent, siteLiveEvent } from "../account-events.ts";
import { readFileSync } from "node:fs";

function memoryLog() {
  const rows = new Map<string, Record<string, unknown>>();
  const store: EmailLogStore = {
    async claim(row) {
      if (rows.has(row.dedupe_key)) return "duplicate";
      rows.set(row.dedupe_key, { ...row });
      return "claimed";
    },
    async finish(key, patch) {
      rows.set(key, { ...rows.get(key), ...patch });
    },
  };
  return { rows, store };
}
function sender() {
  const sent: { msg: OutgoingEmail; key: string }[] = [];
  return { sent, send: async (msg: OutgoingEmail, key: string) => (sent.push({ msg, key }), { id: `re_${sent.length}` }) };
}
const mail: JourneyEmail = {
  dedupeKey: "site-live:7:RN:setting_up:live:never",
  tenantId: 7,
  kind: "site_live",
  step: null,
  recipient: "admin@ridgeway.example",
  from: "Matt at Forecourt <hello@forecourt.me>",
  replyTo: "hello@forecourt.me",
  subject: "Ridgeway Motors: Ridgeway North is live",
  html: "<p>x</p>",
  text: "x",
  recipientIsStaff: false,
};

test("live mode: one email to the admin, one to hello@, a second call sends nothing", async () => {
  const log = memoryLog();
  const s = sender();
  const deps = { config: { mode: "live" as const, teamTo: ["t@forecourt.me"], vercelEnv: "production" }, log: log.store, send: s.send };
  const r = await deliverAccountEvent(deps, mail);
  assert.ok(r.customer.sent && r.office.sent);
  assert.deepEqual(s.sent.map((x) => x.msg.to), [["admin@ridgeway.example"], [OFFICE_INBOX]]);
  assert.equal(OFFICE_INBOX, "hello@forecourt.me");
  assert.match(s.sent[1].msg.text, /^Sent to the account admin: admin@ridgeway\.example/);
  const again = await deliverAccountEvent(deps, mail);
  assert.deepEqual([again.customer, again.office], [{ sent: false, reason: "duplicate" }, { sent: false, reason: "duplicate" }]);
  assert.equal(s.sent.length, 2);
  assert.deepEqual([...log.rows.keys()], ["live:account-event:site-live:7:RN:setting_up:live:never", "office:live:account-event:site-live:7:RN:setting_up:live:never"]);
});

test("team mode: both copies go to the team list only; off sends nothing; office copy is production only", async () => {
  const s = sender();
  const r = await deliverAccountEvent({ config: { mode: "team", teamTo: ["t@forecourt.me"], vercelEnv: "preview" }, log: memoryLog().store, send: s.send }, mail);
  assert.ok(r.customer.sent && r.office.sent);
  assert.deepEqual(s.sent.map((x) => x.msg.to), [["t@forecourt.me"], ["t@forecourt.me"]]);
  const off = await deliverAccountEvent({ config: { mode: "off", teamTo: [], vercelEnv: "production" }, log: memoryLog().store, send: s.send }, mail);
  assert.deepEqual(off.office, { sent: false, reason: "mode_off" });
  const pre = await deliverOfficeCopy({ config: { mode: "live", teamTo: [], vercelEnv: "preview" }, log: memoryLog().store, send: s.send }, { ...mail, kind: "x" });
  assert.deepEqual(pre, { sent: false, reason: "not_production" });
});

test("a staff admin address still gets the office copy", async () => {
  const s = sender();
  const r = await deliverAccountEvent({ config: { mode: "live", teamTo: [], vercelEnv: "production" }, log: memoryLog().store, send: s.send }, { ...mail, recipientIsStaff: true });
  assert.deepEqual(r.customer, { sent: false, reason: "staff_recipient" });
  assert.ok(r.office.sent);
});

test("event words and keys: stable, no dashes", () => {
  const all = [
    siteLiveEvent({ tenantId: 7, eventKey: "k1", siteName: "Ridgeway North", billing: "Billing: x" }),
    siteArchivedEvent({ tenantId: 7, siteCode: "B", siteName: "Ridgeway South", billing: "Your monthly bill does not change.", at: "2026-10-24T09:00:00Z" }),
    planChangedEvent({ tenantId: 7, changeKey: "paid:9", from: "site", to: "group", newMonthlyPence: 74_700, when: "pro-rated on your next bill" }),
    monthlyStartedEvent({ tenantId: 7, subscriptionId: "sub_1" }),
    managerAddedEvent({ tenantId: 7, memberId: 3, email: "m@x.example", by: "o@x.example" }),
    managerRemovedEvent({ tenantId: 7, memberId: 3, email: "m@x.example", by: "o@x.example" }),
  ];
  assert.deepEqual(all.map((e) => e.dedupe), ["site-live:k1", "site-archived:7:b:2026-10-24", "plan-changed:paid:9", "monthly-started:tenant:7:sub:sub_1", "access-added:7:3", "access-removed:7:3"]);
  assert.equal(all[2].lines[1], "New monthly: £747, pro-rated on your next bill.");
  for (const e of all) assert.doesNotMatch(e.title + e.lines.join(" "), /[\u2013\u2014]/);
});

const src = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");
test("every event is wired to sendAccountEventEmail, and existing customer emails copy hello@", () => {
  assert.match(src("src/lib/server/site-billing-server.ts"), /siteArchivedEvent\(\{[\s\S]*sendAccountEventEmail/);
  assert.match(src("src/lib/server/billing-go-live.ts"), /sendAccountEventEmail\(\{ tenantId, \.\.\.monthlyStartedEvent/);
  // PR 3: a paid setup difference no longer switches the plan, so only the direct path sends planChanged.
  assert.equal(src("src/lib/server/plan-change-server.ts").match(/planChangedEvent\(/g)?.length, 1);
  const m = src("src/lib/server/members.ts");
  assert.match(m, /managerAddedEvent\(/);
  assert.match(m, /managerRemovedEvent\(/);
  const j = src("src/lib/server/journey-email.ts");
  assert.match(j, /officeCopy\(t\.id, "payment_failed"/);
  assert.match(j, /officeCopy\(t\.id, "monthly_restart"/);
});

test("Atlas wording: archived, billing started and site added", async () => {
  const { siteAddedEvent } = await import("../account-events.ts");
  const a = siteArchivedEvent({ tenantId: 7, siteCode: "B", siteName: "Ridgeway South", billing: "", periodEnd: "2026-11-14T10:00:00Z" });
  assert.deepEqual(a.lines, ["Ridgeway South has been archived. Your bill goes down by one site from 14 Nov 2026. We don't refund part months. You can restore it in your desk within 30 days."]);
  assert.equal(
    monthlyStartedEvent({ tenantId: 7, subscriptionId: "s", totalPence: 74_700, startedAt: "2026-10-24T09:00:00Z" }).lines[0],
    "Your monthly plan of £747 a month started on 24 Oct 2026. The monthly fee starts at go live or 180 days after payment, whichever comes first.",
  );
  const s = siteAddedEvent({ tenantId: 7, siteCode: "E", siteName: "Ridgeway East", addsPence: 24_900, totalAfterPence: 74_700 });
  assert.equal(s.dedupe, "site-added:7:e");
  assert.equal(s.lines[1], "From its go live day this adds £249 a month, bringing your monthly total to £747. Until then it is not billed.");
});

test("one event, one email: added and archived share one dedupe key per site whichever path sends", async () => {
  const { siteAddedEvent, siteAddedKey, siteArchivedKey } = await import("../account-events.ts");
  const at = "2026-10-24T09:00:00Z";
  const office = siteArchivedEvent({ tenantId: 7, siteCode: "B", siteName: "Ridgeway South", billing: "", at });
  assert.equal(office.dedupe, siteArchivedKey(7, " b ", "2026-10-24T22:30:00Z"), "same London day, any case or spacing");
  assert.notEqual(office.dedupe, siteArchivedKey(7, "B", "2026-10-25T09:00:00Z"), "a later archive is a new event");
  const added = siteAddedEvent({ tenantId: 7, siteCode: "E", siteName: "Ridgeway East", addsPence: 24_900, totalAfterPence: 74_700 });
  assert.equal(added.dedupe, siteAddedKey(7, "e"));
  // email_log dedupe: a key already sent is skipped, so the second path never emails.
  const log = new Set<string>();
  let emails = 0;
  for (const k of [office.dedupe, siteArchivedKey(7, "B", at), added.dedupe, siteAddedKey(7, "E")]) {
    if (log.has(k)) continue;
    log.add(k);
    emails++;
  }
  assert.equal(emails, 2);
});

test("Office Sites client stays browser safe: site-billing-server loads the email engine lazily, never at the top", () => {
  const s = src("src/lib/server/site-billing-server.ts");
  assert.doesNotMatch(s, /^import[^;]*journey-email/m);
  assert.match(s, /await import\("@\/lib\/server\/journey-email"\)/);
});
