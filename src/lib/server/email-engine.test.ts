/** Journey email gate: EMAIL_MODE, team redirect, live skips, dedupe and fail safe. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deliverJourneyEmail,
  emailMode,
  supabaseEmailLog,
  teamList,
  type EmailLogStore,
  type JourneyEmail,
  type OutgoingEmail,
} from "./email-engine.ts";
import { handleStripeWebhook, type PaymentStore } from "./payments.ts";

function memoryLog(opts: { broken?: boolean } = {}) {
  const rows = new Map<string, Record<string, unknown>>();
  const store: EmailLogStore = {
    async claim(row) {
      if (opts.broken) return "unavailable";
      if (rows.has(row.dedupe_key)) return "duplicate";
      rows.set(row.dedupe_key, { ...row, status: "sending" });
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
  return {
    sent,
    send: async (msg: OutgoingEmail, key: string) => {
      sent.push({ msg, key });
      return { id: `re_${sent.length}` };
    },
  };
}

const mail: JourneyEmail = {
  dedupeKey: "thank-you:order:42",
  tenantId: 7,
  kind: "thank_you",
  step: 1,
  recipient: "Sam@NorthbridgeMotors.example",
  from: "Matt at Forecourt <hello@forecourt.me>",
  replyTo: "hello@forecourt.me",
  subject: "Thanks, Sam. Next step: book your kickoff call",
  html: "<p>hi</p>",
  text: "hi",
  recipientIsStaff: false,
  stripeLivemode: true,
};
const live = { mode: "live" as const, teamTo: [], vercelEnv: "production" };

test("EMAIL_MODE: unset or unknown means off", () => {
  assert.equal(emailMode(undefined), "off");
  assert.equal(emailMode(""), "off");
  assert.equal(emailMode("on"), "off");
  assert.equal(emailMode("true"), "off");
  assert.equal(emailMode(" Team "), "team");
  assert.equal(emailMode("LIVE"), "live");
  assert.deepEqual(teamList("a@x.co, b@y.co;bad  A@X.co"), ["a@x.co", "b@y.co"]);
});

test("off sends nothing and writes nothing", async () => {
  const log = memoryLog();
  const s = sender();
  const r = await deliverJourneyEmail({ config: { mode: "off", teamTo: ["t@x.co"], vercelEnv: "production" }, log: log.store, send: s.send }, mail);
  assert.deepEqual(r, { sent: false, reason: "mode_off" });
  assert.equal(s.sent.length, 0);
  assert.equal(log.rows.size, 0);
});

test("team mode only ever sends to the team list", async () => {
  const log = memoryLog();
  const s = sender();
  const r = await deliverJourneyEmail(
    { config: { mode: "team", teamTo: ["matt@forecourt.me"], vercelEnv: "preview" }, log: log.store, send: s.send },
    { ...mail, recipientIsStaff: true, stripeLivemode: false },
  );
  assert.equal(r.sent, true);
  assert.deepEqual(s.sent[0]!.msg.to, ["matt@forecourt.me"]);
  assert.match(s.sent[0]!.msg.subject, /^\[Team copy\] /);
  assert.equal(s.sent[0]!.key, "team:thank-you:order:42");
  const empty = await deliverJourneyEmail({ config: { mode: "team", teamTo: [], vercelEnv: "production" }, log: log.store, send: s.send }, mail);
  assert.deepEqual(empty, { sent: false, reason: "team_list_empty" });
});

test("live mode skips staff, test payments, non-production, archived and missing addresses", async () => {
  const cases: [Partial<JourneyEmail>, Partial<typeof live>, string][] = [
    [{ recipientIsStaff: true }, {}, "staff_recipient"],
    [{ stripeLivemode: false }, {}, "test_payment"],
    [{}, { vercelEnv: "preview" }, "not_production"],
    [{}, { vercelEnv: undefined }, "not_production"],
    [{ archived: true }, {}, "archived"],
    [{ recipient: "" }, {}, "no_recipient"],
    [{ recipient: "not-an-email" }, {}, "no_recipient"],
  ];
  for (const [m, c, reason] of cases) {
    const s = sender();
    const r = await deliverJourneyEmail({ config: { ...live, ...c }, log: memoryLog().store, send: s.send }, { ...mail, ...m });
    assert.equal(r.sent ? "sent" : r.reason, reason);
    assert.equal(s.sent.length, 0);
  }
});

test("live mode sends once to the customer; a retry is a duplicate", async () => {
  const log = memoryLog();
  const s = sender();
  const first = await deliverJourneyEmail({ config: live, log: log.store, send: s.send }, mail);
  const again = await deliverJourneyEmail({ config: live, log: log.store, send: s.send }, mail);
  assert.equal(first.sent, true);
  assert.deepEqual(s.sent[0]!.msg.to, ["sam@northbridgemotors.example"]);
  assert.equal(s.sent[0]!.key, "live:thank-you:order:42");
  assert.equal(s.sent[0]!.msg.text, "hi");
  assert.deepEqual(again, { sent: false, reason: "duplicate" });
  assert.equal(s.sent.length, 1);
  assert.equal(log.rows.get("live:thank-you:order:42")!.status, "sent");
});

test("no email_log table: skip, never send", async () => {
  const s = sender();
  const r = await deliverJourneyEmail({ config: live, log: memoryLog({ broken: true }).store, send: s.send }, mail);
  assert.deepEqual(r, { sent: false, reason: "log_unavailable" });
  assert.equal(s.sent.length, 0);
});

test("supabaseEmailLog maps a missing table to unavailable and 23505 to duplicate", async () => {
  const fake = (error: { code?: string; message?: string } | null, throws = false) => ({
    from: () => ({
      insert: async () => {
        if (throws) throw new Error("network");
        return { error };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  });
  const row = { dedupe_key: "k", tenant_id: 1, kind: "x", step: 1, mode: "live" as const, recipient: "a@b.co", subject: "s" };
  assert.equal(await supabaseEmailLog(fake(null)).claim(row), "claimed");
  assert.equal(await supabaseEmailLog(fake({ code: "23505" })).claim(row), "duplicate");
  assert.equal(await supabaseEmailLog(fake({ code: "42P01", message: 'relation "email_log" does not exist' })).claim(row), "unavailable");
  assert.equal(await supabaseEmailLog(fake({ code: "PGRST205" })).claim(row), "unavailable");
  assert.equal(await supabaseEmailLog(fake(null, true)).claim(row), "unavailable");
  assert.equal(await supabaseEmailLog(null).claim(row), "unavailable");
});

test("a failed send is recorded and not retried", async () => {
  const log = memoryLog();
  let calls = 0;
  const send = async () => {
    calls++;
    return { error: "rate limited" };
  };
  const r = await deliverJourneyEmail({ config: live, log: log.store, send }, mail);
  assert.equal(r.sent, false);
  assert.equal(log.rows.get("live:thank-you:order:42")!.status, "failed");
  const again = await deliverJourneyEmail({ config: live, log: log.store, send }, mail);
  assert.deepEqual(again, { sent: false, reason: "duplicate" });
  assert.equal(calls, 1);
});

test("webhook: the thank-you hook failing never turns a paid webhook into an error", async () => {
  const order = { id: 42, user_id: "u1", tenant_id: 7, plan: "site", amount_pence: 450000, status: "pending", kind: "subscription" };
  const store: PaymentStore = {
    loadOrder: async () => order,
    loadTenant: async () => ({ user_id: "u1", status: null, trial_ends_at: null }),
    updateTenant: async () => {},
    markOrderPaid: async () => {},
    cancelBySubscription: async () => {},
    seedPaid: async () => {},
  };
  const session = {
    id: "cs_1",
    status: "complete",
    payment_status: "paid",
    amount_total: 450000,
    currency: "gbp",
    mode: "subscription",
    metadata: { order_id: "42", monthly_from: "go_live" },
  };
  let hookSaw: unknown[] = [];
  const res = await handleStripeWebhook(
    {
      stripeSecret: "sk_test",
      webhookSecret: "whsec",
      store,
      constructEvent: () => ({ type: "checkout.session.async_payment_succeeded", livemode: false, data: { object: session } }),
      log: { error: () => {}, warn: () => {} },
      onPaid: async (o, s, e) => {
        hookSaw = [o.id, s.metadata?.monthly_from, e.livemode];
        throw new Error("resend down");
      },
    },
    "{}",
    "sig",
  );
  assert.deepEqual(res, { status: 200, body: "ok" });
  assert.deepEqual(hookSaw, [42, "go_live", false]);
});
