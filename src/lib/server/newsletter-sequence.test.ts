/** Launch sequence and monthly draft. Every Resend call is mocked; nothing is sent. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DAY_MS,
  SEQUENCE,
  createMonthlyDraft,
  daysSince,
  nextStep,
  parseResendTime,
  runSequence,
  sequenceEnabled,
  sequenceIdempotencyKey,
  inSendWindow,
  monthlyEligible,
  type SequenceStore,
} from "./newsletter-sequence.ts";
import { supabaseSequenceStore, recordConfirmed } from "./newsletter-sequence-store.ts";
import { handleToken, signToken, type NewsletterConfig } from "./newsletter.ts";

const config: NewsletterConfig = {
  apiKey: "re_test_fake",
  segmentId: "seg_test",
  secret: "test-secret-0123456789abcdef",
  from: "Forecourt <hello@forecourt.me>",
  replyTo: "hello@forecourt.me",
  baseUrl: "https://www.forecourt.me",
  monthlySegmentId: "seg_monthly",
};

const T0 = Date.parse("2026-10-23T12:00:00Z");
const resendTime = (ms: number) => new Date(ms).toISOString().replace("T", " ").replace("Z", "+00");

type Call = { url: string; method: string; headers: Record<string, string>; body: any };
type Person = { email: string; created: number; unsubscribed?: boolean; unsubscribeOnGet?: boolean };

function mockResend(people: Person[], opts: { failSend?: boolean; monthly?: Set<string> } = {}) {
  const calls: Call[] = [];
  const monthly = opts.monthly ?? new Set<string>();
  const f = async (url: string, init: RequestInit) => {
    const c: Call = {
      url,
      method: String(init.method),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(c);
    const u = new URL(url);
    if (c.method === "GET" && u.pathname === "/contacts" && u.searchParams.get("segment_id") === "seg_monthly") {
      return Response.json({ object: "list", has_more: false, data: [...monthly].map((e, i) => ({ id: `m${i}`, email: e, created_at: "", unsubscribed: false })) });
    }
    const seg = u.pathname.match(/^\/contacts\/([^/]+)\/segments\/([^/]+)$/);
    if (c.method === "POST" && seg) {
      if (seg[2] === "seg_monthly") monthly.add(decodeURIComponent(seg[1]));
      return Response.json({ id: seg[2] });
    }
    if (c.method === "GET" && u.pathname === "/contacts") {
      return Response.json({
        object: "list",
        has_more: false,
        data: people.map((p, i) => ({ id: `id${i}`, email: p.email, created_at: resendTime(p.created), unsubscribed: !!p.unsubscribed })),
      });
    }
    if (c.method === "GET" && u.pathname.startsWith("/contacts/")) {
      const p = people.find((x) => x.email === decodeURIComponent(u.pathname.split("/")[2]));
      if (!p) return new Response("{}", { status: 404 });
      return Response.json({ email: p.email, unsubscribed: !!p.unsubscribed || !!p.unsubscribeOnGet });
    }
    if (c.method === "POST" && u.pathname === "/emails") {
      if (opts.failSend) return new Response("{}", { status: 500 });
      return Response.json({ id: `em_${calls.length}` });
    }
    if (c.method === "POST" && u.pathname === "/broadcasts") return Response.json({ object: "broadcast", id: "bc_1" });
    return new Response("{}", { status: 400 });
  };
  const sends = () => calls.filter((c) => c.method === "POST" && c.url.endsWith("/emails"));
  return { calls, f, sends, monthly };
}

/** In-memory store with the same unique (email, step) rule as the SQL. */
function memStore() {
  const subs = new Map<string, string>();
  const rows = new Map<string, { status: string }>();
  const store: SequenceStore = {
    async ensureSubscribers(r) {
      for (const x of r) if (!subs.has(x.email)) subs.set(x.email, x.confirmed_at);
      return true;
    },
    async confirmedAt(emails) {
      return new Map(emails.filter((e) => subs.has(e)).map((e) => [e, subs.get(e)!]));
    },
    async stepsHad(emails) {
      const m = new Map<string, Set<number>>();
      for (const [k, v] of rows) {
        const [e, s] = k.split("|");
        if (emails.includes(e) && v.status !== "failed") m.set(e, (m.get(e) ?? new Set()).add(Number(s)));
      }
      return m;
    },
    async claim(email, step) {
      const k = `${email}|${step}`;
      const r = rows.get(k);
      if (!r) {
        rows.set(k, { status: "sending" });
        return "claimed";
      }
      if (r.status === "failed") {
        r.status = "sending";
        return "claimed";
      }
      return "duplicate";
    },
    async finish(email, step, patch) {
      rows.get(`${email}|${step}`)!.status = patch.status;
    },
  };
  return { store, subs, rows };
}

const noSleep = async () => {};
const run = (f: any, store: SequenceStore, now: number, enabled = true) =>
  runSequence({ enabled, config, fetch: f, store, now: () => now, sleep: noSleep });

test("flag: only exactly 'true' enables it", () => {
  assert.equal(sequenceEnabled("true"), true);
  for (const v of [undefined, null, "", "TRUE", "True", "1", "yes", " true", "true "]) assert.equal(sequenceEnabled(v as any), false);
});

test("flag off: no Resend calls, no store writes, nothing sent", async () => {
  const m = mockResend([{ email: "a@x.co", created: T0 - 30 * DAY_MS }]);
  const s = memStore();
  const r = await run(m.f, s.store, T0, false);
  assert.equal(r.enabled, false);
  assert.equal(r.sent, 0);
  assert.equal(m.calls.length, 0);
  assert.equal(s.subs.size, 0);
});

test("day math: steps due on days 2, 5, 9 and 14", () => {
  assert.deepEqual(SEQUENCE.map((s) => [s.name, s.day]), [["launch-2a", 2], ["launch-2b", 5], ["launch-2c", 9], ["launch-2d", 14]]);
  assert.equal(daysSince(T0, T0 + 2 * DAY_MS - 1), 1);
  assert.equal(daysSince(T0, T0 + 2 * DAY_MS), 2);
  const none = new Set<number>();
  assert.equal(nextStep(T0, none, T0 + 2 * DAY_MS - 1), null);
  assert.equal(nextStep(T0, none, T0 + 2 * DAY_MS)?.name, "launch-2a");
  assert.equal(nextStep(T0, new Set([1]), T0 + 5 * DAY_MS - 1), null);
  assert.equal(nextStep(T0, new Set([1]), T0 + 5 * DAY_MS)?.name, "launch-2b");
  assert.equal(nextStep(T0, new Set([1, 2]), T0 + 9 * DAY_MS)?.name, "launch-2c");
  assert.equal(nextStep(T0, new Set([1, 2, 3]), T0 + 13 * DAY_MS), null);
  assert.equal(nextStep(T0, new Set([1, 2, 3]), T0 + 14 * DAY_MS)?.name, "launch-2d");
  assert.equal(nextStep(T0, new Set([1, 2, 3, 4]), T0 + 99 * DAY_MS), null);
});

test("parses Resend created_at", () => {
  assert.equal(parseResendTime("2026-10-06 23:47:56.678+00"), Date.parse("2026-10-06T23:47:56.678Z"));
  assert.equal(parseResendTime("2026-10-06T23:47:56.678Z"), Date.parse("2026-10-06T23:47:56.678Z"));
  assert.equal(parseResendTime("nonsense"), null);
  assert.equal(parseResendTime(undefined), null);
});

test("full sequence over 15 daily runs: each step once, on its day", async () => {
  const m = mockResend([{ email: "a@x.co", created: T0 }]);
  const s = memStore();
  const sentOn: Record<number, string> = {};
  for (let day = 0; day <= 15; day++) {
    const before = m.sends().length;
    await run(m.f, s.store, T0 + day * DAY_MS + 60_000);
    const after = m.sends();
    if (after.length > before) sentOn[day] = after[after.length - 1].body.subject;
  }
  assert.deepEqual(Object.keys(sentOn).map(Number), [2, 5, 9, 14]);
  assert.equal(m.sends().length, 4);
  const first = m.sends()[0];
  assert.deepEqual(first.body.to, ["a@x.co"]);
  assert.match(first.body.html, /\/api\/newsletter\/unsubscribe\?t=/);
  assert.doesNotMatch(first.body.html + first.body.text, /\{\{/);
  assert.equal(first.body.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("idempotent: running twice the same day sends once, same Resend key every attempt", async () => {
  const m = mockResend([{ email: "a@x.co", created: T0 }]);
  const s = memStore();
  const now = T0 + 3 * DAY_MS;
  const r1 = await run(m.f, s.store, now);
  const r2 = await run(m.f, s.store, now);
  assert.equal(r1.sent, 1);
  assert.equal(r2.sent, 0);
  assert.equal(m.sends().length, 1);
  assert.equal(m.sends()[0].headers["Idempotency-Key"], sequenceIdempotencyKey(config, "a@x.co", 1));
  assert.equal(sequenceIdempotencyKey(config, "a@x.co", 1), sequenceIdempotencyKey(config, "a@x.co", 1));
  assert.notEqual(sequenceIdempotencyKey(config, "a@x.co", 1), sequenceIdempotencyKey(config, "a@x.co", 2));
});

test("idempotent: a row already claimed by another run is never sent again", async () => {
  const m = mockResend([{ email: "a@x.co", created: T0 }]);
  const s = memStore();
  // Another run claimed step 1 but stepsHad was read before that claim landed.
  const racing: SequenceStore = { ...s.store, stepsHad: async () => new Map() };
  s.rows.set("a@x.co|1", { status: "sending" });
  const r = await run(m.f, racing, T0 + 3 * DAY_MS);
  assert.equal(r.duplicate, 1);
  assert.equal(m.sends().length, 0);
});

test("a failed send is retried next run with the same idempotency key", async () => {
  const people = [{ email: "a@x.co", created: T0 }];
  const s = memStore();
  const bad = mockResend(people, { failSend: true });
  const r1 = await run(bad.f, s.store, T0 + 3 * DAY_MS);
  assert.equal(r1.failed, 1);
  assert.equal(s.rows.get("a@x.co|1")!.status, "failed");
  const good = mockResend(people);
  const r2 = await run(good.f, s.store, T0 + 4 * DAY_MS);
  assert.equal(r2.sent, 1);
  assert.equal(good.sends()[0].headers["Idempotency-Key"], bad.sends()[0].headers["Idempotency-Key"]);
});

test("skips contacts unsubscribed in the list and on the fresh re-check", async () => {
  const m = mockResend([
    { email: "gone@x.co", created: T0, unsubscribed: true },
    { email: "justleft@x.co", created: T0, unsubscribeOnGet: true },
    { email: "stays@x.co", created: T0 },
  ]);
  const s = memStore();
  const r = await run(m.f, s.store, T0 + 3 * DAY_MS);
  assert.equal(r.sent, 1);
  assert.equal(r.unsubscribed, 2);
  assert.deepEqual(m.sends().map((c) => c.body.to[0]), ["stays@x.co"]);
  // The re-check happened right before the send.
  assert.ok(m.calls.some((c) => c.method === "GET" && c.url.endsWith("/contacts/justleft%40x.co")));
  assert.equal(s.rows.has("justleft@x.co|1"), false);
});

test("catch-up: confirmed before the flag went on gets one email per run, in order, never a burst", async () => {
  const m = mockResend([{ email: "old@x.co", created: T0 - 20 * DAY_MS }]);
  const s = memStore();
  const subjects: string[] = [];
  for (let i = 0; i < 6; i++) {
    const before = m.sends().length;
    const r = await run(m.f, s.store, T0 + i * DAY_MS);
    assert.ok(m.sends().length - before <= 1);
    assert.ok(r.sent <= 1);
    if (r.sent) subjects.push(m.sends()[m.sends().length - 1].body.subject);
  }
  assert.equal(subjects.length, 4);
  assert.match(subjects[0], /car park/);
});

test("confirm time: recorded row wins over Resend created_at, and backfill never overwrites", async () => {
  const m = mockResend([{ email: "a@x.co", created: T0 - 30 * DAY_MS }]);
  const s = memStore();
  s.subs.set("a@x.co", new Date(T0).toISOString());
  const r = await run(m.f, s.store, T0 + DAY_MS);
  assert.equal(r.sent, 0);
  assert.equal(r.notDue, 1);
  assert.equal(s.subs.get("a@x.co"), new Date(T0).toISOString());
});

test("store missing: nothing sent", async () => {
  const m = mockResend([{ email: "a@x.co", created: T0 - 30 * DAY_MS }]);
  const r = await run(m.f, supabaseSequenceStore(null), T0);
  assert.equal(r.ok, false);
  assert.equal(m.sends().length, 0);
});

test("supabase store claim: insert first, 23505 means duplicate unless the row failed", async () => {
  const table = new Map<string, string>();
  const db = {
    from: () => {
      const q: any = { filters: {} as Record<string, unknown> };
      q.insert = async (row: any) => {
        const k = `${row.email}|${row.step}`;
        if (table.has(k)) return { error: { code: "23505" } };
        table.set(k, row.status);
        return { error: null };
      };
      q.update = (patch: any) => {
        q.patch = patch;
        return q;
      };
      q.eq = (col: string, v: unknown) => {
        q.filters[col] = v;
        return q;
      };
      q.select = async () => {
        const k = `${q.filters.email}|${q.filters.step}`;
        if (table.get(k) === q.filters.status) {
          table.set(k, q.patch.status);
          return { data: [{ email: q.filters.email }], error: null };
        }
        return { data: [], error: null };
      };
      return q;
    },
  };
  const st = supabaseSequenceStore(db);
  assert.equal(await st.claim("a@x.co", 1), "claimed");
  assert.equal(await st.claim("a@x.co", 1), "duplicate");
  table.set("a@x.co|1", "failed");
  assert.equal(await st.claim("a@x.co", 1), "claimed");
  assert.equal(await st.claim("a@x.co", 1), "duplicate");
});

test("confirm link records the confirm time with an insert-only upsert", async () => {
  const seen: any[] = [];
  const db = { from: (t: string) => ({ upsert: async (row: any, o: any) => (seen.push({ t, row, o }), { error: null }) }) };
  await recordConfirmed(db, "a@x.co", T0);
  assert.deepEqual(seen[0], {
    t: "newsletter_subscribers",
    row: { email: "a@x.co", confirmed_at: new Date(T0).toISOString(), source: "confirm" },
    o: { onConflict: "email", ignoreDuplicates: true },
  });
  // Wired into handleToken: called on confirm, not on unsubscribe, and a failure never fails the confirm.
  const calls: string[] = [];
  const deps = {
    config,
    fetch: async () => new Response("{}", { status: 200 }),
    now: () => T0,
    ipLimited: () => false,
    emailLimited: () => false,
    onConfirmed: async (e: string) => {
      calls.push(e);
      throw new Error("db down");
    },
  };
  assert.equal(await handleToken(signToken(config.secret!, "a@x.co", "c", T0), "c", deps), "ok");
  assert.equal(await handleToken(signToken(config.secret!, "a@x.co", "u", T0), "u", deps), "ok");
  assert.deepEqual(calls, ["a@x.co"]);
});

const SLOTS: Record<string, string> = {
  MONTH: "November",
  PREVIEW_TEXT: "What changed on the floor this month.",
  INTRO_PARAGRAPH: "Intro.",
  PRODUCT_UPDATE: "Update.",
  DESK_TIP: "Tip.",
  CUSTOMER_STORY_OR_OBSERVATION: "Story.",
  LINK_1_TITLE: "One",
  LINK_1_URL: "https://example.com/1",
  LINK_2_TITLE: "Two",
  LINK_2_URL: "https://example.com/2",
  LINK_3_TITLE: "Three",
  LINK_3_URL: "https://example.com/3",
  ONE_LINE_WHY: "Worth it.",
  CTA_SECTION_HEADING: "See it",
  CTA_LEAD_IN: "Have a look.",
  CTA_LABEL: "Open the showcase",
  CTA_URL: "https://www.forecourt.me/#showcase",
  SIGN_OFF_NAME: "Matt",
};

test("monthly: refuses while any slot is unfilled, and calls nothing", async () => {
  const m = mockResend([]);
  const { DESK_TIP: _drop, ...partial } = SLOTS;
  const r = await createMonthlyDraft({ enabled: true, config, fetch: m.f }, partial);
  assert.equal(r.ok, false);
  assert.deepEqual((r as any).missing, ["DESK_TIP"]);
  assert.equal(m.calls.length, 0);
  const blank = await createMonthlyDraft({ enabled: true, config, fetch: m.f }, { ...SLOTS, MONTH: "  " });
  assert.equal(blank.ok, false);
  assert.equal(m.calls.length, 0);
});

test("monthly: flag off refuses and calls nothing", async () => {
  const m = mockResend([]);
  const r = await createMonthlyDraft({ enabled: false, config, fetch: m.f }, SLOTS);
  assert.equal(r.ok, false);
  assert.equal(m.calls.length, 0);
});

test("monthly: creates a Broadcast DRAFT only, never sent or scheduled", async () => {
  const m = mockResend([]);
  const r = await createMonthlyDraft({ enabled: true, config, fetch: m.f }, SLOTS);
  assert.deepEqual(r, { ok: true, id: "bc_1", status: "draft" });
  assert.notEqual(m.calls[0].body.segment_id, "seg_test");
  assert.equal(m.calls.length, 1);
  const c = m.calls[0];
  assert.equal(c.method, "POST");
  assert.equal(c.url, "https://api.resend.com/broadcasts");
  assert.ok(!("send" in c.body));
  assert.ok(!("scheduled_at" in c.body));
  assert.ok(!m.calls.some((x) => /\/broadcasts\/[^/]+\/send/.test(x.url)));
  assert.equal(c.body.segment_id, "seg_monthly");
  assert.equal(c.body.subject, "Forecourt: November on the floor");
  assert.match(c.body.html, /\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/);
  assert.match(c.body.text, /\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/);
  assert.doesNotMatch(c.body.html.replaceAll("{{{RESEND_UNSUBSCRIBE_URL}}}", ""), /\{\{/);
  assert.doesNotMatch(c.body.html, /unsubscribe\.invalid/);
});

/* ---------------- Rule 1: unsubscribe stops the rest at once ---------------- */

test("rule 1: unsubscribing via the link stops every remaining launch email from the next send", async () => {
  const people: Person[] = [{ email: "a@x.co", created: T0 }];
  const m = mockResend(people);
  const s = memStore();
  const r1 = await run(m.f, s.store, T0 + 2 * DAY_MS);
  assert.equal(r1.sent, 1); // launch-2a
  // They click unsubscribe; handleToken PATCHes the contact unsubscribed:true in (mocked) Resend.
  const tok = signToken(config.secret!, "a@x.co", "u", T0 + 3 * DAY_MS);
  const res = await handleToken(tok, "u", {
    config,
    fetch: async (url: string, init: RequestInit) => {
      if (String(init.method) === "PATCH") people[0].unsubscribeOnGet = true;
      return Response.json({});
    },
    now: () => T0 + 3 * DAY_MS,
    ipLimited: () => false,
    emailLimited: () => false,
  } as any);
  assert.equal(res, "ok");
  // The list still shows them as subscribed (stale), but the pre-send re-check catches it.
  for (const day of [5, 9, 14, 20]) await run(m.f, s.store, T0 + day * DAY_MS);
  assert.equal(m.sends().length, 1);
  assert.equal(m.monthly.size, 0);
});

test("rule 1: the re-check runs before every single send, and an unknown answer also skips", async () => {
  const m = mockResend([{ email: "a@x.co", created: T0 }]);
  const s = memStore();
  const flaky = async (url: string, init: RequestInit) =>
    String(init.method) === "GET" && /\/contacts\/[^/?]+$/.test(new URL(url).pathname) ? new Response("{}", { status: 500 }) : m.f(url, init);
  const r = await run(flaky, s.store, T0 + 3 * DAY_MS);
  assert.equal(r.sent, 0);
  assert.equal(r.failed, 1);
  assert.equal(s.rows.size, 0);
});

/* ---------------- Rule 2: no monthly note during the launch fortnight ---------------- */

test("rule 2: eligibility needs launch-2d sent AND 15+ days since confirm", () => {
  const all = new Set([1, 2, 3, 4]);
  assert.equal(monthlyEligible(T0, all, T0 + 14 * DAY_MS), false);
  assert.equal(monthlyEligible(T0, all, T0 + 15 * DAY_MS), true);
  assert.equal(monthlyEligible(T0, new Set([1, 2, 3]), T0 + 60 * DAY_MS), false);
  assert.equal(monthlyEligible(T0, new Set(), T0 + 400 * DAY_MS), false);
});

test("rule 2: added to the monthly segment only after the fortnight, once, never while mid-sequence", async () => {
  const m = mockResend([{ email: "a@x.co", created: T0 }]);
  const s = memStore();
  for (let day = 0; day <= 14; day++) {
    await run(m.f, s.store, T0 + day * DAY_MS);
    assert.equal(m.monthly.has("a@x.co"), false, `day ${day}`);
  }
  const r = await run(m.f, s.store, T0 + 15 * DAY_MS);
  assert.equal(r.monthlyAdded, 1);
  assert.ok(m.monthly.has("a@x.co"));
  const r2 = await run(m.f, s.store, T0 + 16 * DAY_MS);
  assert.equal(r2.monthlyAdded, 0);
  const adds = m.calls.filter((c) => c.method === "POST" && c.url.includes("/segments/seg_monthly"));
  assert.equal(adds.length, 1);
});

test("rule 2: backfill of old contacts waits for their catch-up launch-2d", async () => {
  const m = mockResend([{ email: "old@x.co", created: T0 - 90 * DAY_MS }]);
  const s = memStore();
  for (let i = 0; i < 4; i++) {
    await run(m.f, s.store, T0 + i * DAY_MS);
    assert.equal(m.monthly.has("old@x.co"), i === 3, `run ${i}`); // 2d goes on the 4th run, add follows in the same run
  }
});

test("rule 2: unsubscribed contacts are never added; no monthly env means nobody added", async () => {
  const m = mockResend([{ email: "gone@x.co", created: T0 - 90 * DAY_MS, unsubscribed: true }]);
  const s = memStore();
  for (let i = 0; i < 5; i++) await run(m.f, s.store, T0 + i * DAY_MS);
  assert.equal(m.monthly.size, 0);
  const m2 = mockResend([{ email: "a@x.co", created: T0 - 90 * DAY_MS }]);
  const s2 = memStore();
  let last: any;
  for (let i = 0; i < 4; i++)
    last = await runSequence({ enabled: true, config: { ...config, monthlySegmentId: undefined }, fetch: m2.f as any, store: s2.store, now: () => T0 + i * DAY_MS, sleep: noSleep });
  assert.equal(last.monthlyAdded, 0);
  assert.match(last.monthlyNote, /MONTHLY_SEGMENT_ID/);
  assert.ok(!m2.calls.some((c) => c.url.includes("/segments/")));
});

test("rule 2: monthly draft refuses, calling nothing, when the monthly segment is not set", async () => {
  const m = mockResend([]);
  const r = await createMonthlyDraft({ enabled: true, config: { ...config, monthlySegmentId: undefined }, fetch: m.f }, SLOTS);
  assert.equal(r.ok, false);
  assert.match((r as any).error, /MONTHLY_SEGMENT_ID/);
  assert.equal(m.calls.length, 0);
});

/* ---------------- Rule 3: UK working hours only ---------------- */

test("rule 3: send window is 09:00-17:00 Europe/London in BST and GMT", () => {
  // BST (UTC+1)
  assert.equal(inSendWindow(Date.parse("2026-07-01T07:59:00Z")), false); // 08:59
  assert.equal(inSendWindow(Date.parse("2026-07-01T08:00:00Z")), true); // 09:00
  assert.equal(inSendWindow(Date.parse("2026-07-01T15:59:00Z")), true); // 16:59
  assert.equal(inSendWindow(Date.parse("2026-07-01T16:00:00Z")), false); // 17:00
  // GMT
  assert.equal(inSendWindow(Date.parse("2026-12-01T08:59:00Z")), false);
  assert.equal(inSendWindow(Date.parse("2026-12-01T09:00:00Z")), true); // the cron time
  assert.equal(inSendWindow(Date.parse("2026-12-01T16:59:00Z")), true);
  assert.equal(inSendWindow(Date.parse("2026-12-01T17:00:00Z")), false);
  assert.equal(inSendWindow(Date.parse("2026-07-01T09:00:00Z")), true); // cron in BST = 10:00
});

test("rule 3: a run outside hours makes no Resend calls and no writes", async () => {
  const m = mockResend([{ email: "a@x.co", created: T0 - 3 * DAY_MS }]);
  const s = memStore();
  const late = Date.parse("2026-10-23T21:30:00Z"); // 22:30 BST
  const r = await run(m.f, s.store, late);
  assert.equal(r.ok, true);
  assert.equal(r.sent, 0);
  assert.match(r.reason ?? "", /outside 09:00-17:00/);
  assert.equal(m.calls.length, 0);
  assert.equal(s.subs.size, 0);
  const early = await run(m.f, s.store, Date.parse("2026-12-01T06:00:00Z"));
  assert.equal(early.sent, 0);
  assert.equal(m.calls.length, 0);
});
