/** Newsletter double opt-in. All Resend calls are mocked; nothing is sent. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONFIRM_SUBJECT,
  CONFIRM_TTL_MS,
  MSG,
  confirmEmail,
  handleSubscribe,
  handleToken,
  makeLimiter,
  newsletterUnsubscribeHeaders,
  signToken,
  verifyToken,
  type Deps,
  type NewsletterConfig,
} from "./newsletter.ts";

const config: NewsletterConfig = {
  apiKey: "re_test_fake",
  audienceId: "aud_test",
  secret: "test-secret-0123456789abcdef",
  from: "Forecourt <hello@forecourt.me>",
  replyTo: "hello@forecourt.me",
  baseUrl: "https://www.forecourt.me",
};

type Call = { url: string; method: string; body: unknown };

function mockFetch(responder: (c: Call) => number = () => 200) {
  const calls: Call[] = [];
  const f = async (url: string, init: RequestInit) => {
    const c = { url, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : null };
    calls.push(c);
    return new Response("{}", { status: responder(c) });
  };
  return { calls, f };
}

function deps(f: Deps["fetch"], over: Partial<Deps> = {}): Deps {
  return { config, fetch: f, ipLimited: () => false, emailLimited: () => false, ...over };
}

test("tokens round trip, are purpose bound and tamper proof", () => {
  const t = signToken(config.secret!, "a@b.co.uk", "c");
  assert.deepEqual(verifyToken(config.secret!, t, "c"), { ok: true, email: "a@b.co.uk" });
  assert.equal(verifyToken(config.secret!, t, "u").ok, false);
  assert.equal(verifyToken("other-secret-0123456789", t, "c").ok, false);
  assert.equal(verifyToken(config.secret!, t.slice(0, -2) + "xx", "c").ok, false);
  assert.equal(verifyToken(config.secret!, "junk", "c").ok, false);
});

test("confirm tokens expire, unsubscribe tokens do not", () => {
  const now = 1_000_000;
  const c = signToken(config.secret!, "a@b.com", "c", now);
  assert.deepEqual(verifyToken(config.secret!, c, "c", now + CONFIRM_TTL_MS + 1), { ok: false, reason: "expired" });
  const u = signToken(config.secret!, "a@b.com", "u", now);
  assert.equal(verifyToken(config.secret!, u, "u", now + 10 * 365 * 86400_000).ok, true);
});

test("subscribe sends one confirmation and never touches the audience", async () => {
  const m = mockFetch();
  const r = await handleSubscribe({ email: " A@B.com ", consent: true }, "1.1.1.1", deps(m.f));
  assert.equal(r.status, 200);
  assert.equal(r.body.message, MSG.sent);
  assert.equal(m.calls.length, 1);
  assert.match(m.calls[0].url, /\/emails$/);
  const b = m.calls[0].body as Record<string, any>;
  assert.equal(b.subject, CONFIRM_SUBJECT);
  assert.ok(b.subject.startsWith("Forecourt: "));
  assert.deepEqual(b.to, ["a@b.com"]);
  assert.equal(b.from, "Forecourt <hello@forecourt.me>");
  assert.match(b.text, /\/api\/newsletter\/confirm\?t=/);
  assert.match(b.html, /href="https:\/\/www\.forecourt\.me\/api\/newsletter\/confirm\?t=/);
  assert.doesNotMatch(b.html, /\{\{CONFIRM_URL\}\}/);
  assert.equal(b.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(b.headers["List-Unsubscribe"], /^<https:\/\/www\.forecourt\.me\/api\/newsletter\/unsubscribe\?t=/);
});

test("consent, validation and honeypot", async () => {
  const m = mockFetch();
  assert.equal((await handleSubscribe({ email: "a@b.com" }, "ip", deps(m.f))).status, 400);
  assert.equal((await handleSubscribe({ email: "nope", consent: true }, "ip", deps(m.f))).status, 400);
  const hp = await handleSubscribe({ email: "a@b.com", consent: true, company: "bot" }, "ip", deps(m.f));
  assert.equal(hp.status, 200);
  assert.equal(m.calls.length, 0);
});

test("rate limits: per IP refuses, per address looks like success", async () => {
  const m = mockFetch();
  assert.equal((await handleSubscribe({ email: "a@b.com", consent: true }, "ip", deps(m.f, { ipLimited: () => true }))).status, 429);
  const r = await handleSubscribe({ email: "a@b.com", consent: true }, "ip", deps(m.f, { emailLimited: () => true }));
  assert.deepEqual(r, { status: 200, body: { ok: true, message: MSG.sent } });
  assert.equal(m.calls.length, 0);
  const lim = makeLimiter(2, 1000);
  assert.equal(lim("k", 0), false);
  assert.equal(lim("k", 1), false);
  assert.equal(lim("k", 2), true);
  assert.equal(lim("k", 2000), false);
});

test("missing env is a friendly 503, never a throw", async () => {
  const m = mockFetch();
  const r = await handleSubscribe({ email: "a@b.com", consent: true }, "ip", deps(m.f, { config: { ...config, audienceId: undefined } }));
  assert.equal(r.status, 503);
  assert.equal(r.body.message, MSG.notReady);
  assert.equal(await handleToken("x", "c", deps(m.f, { config: { ...config, secret: undefined } })), "unavailable");
});

test("same answer whether or not the address is already subscribed", async () => {
  // Subscribe never reads the audience, so the reply cannot differ.
  const a = await handleSubscribe({ email: "new@b.com", consent: true }, "ip", deps(mockFetch().f));
  const b = await handleSubscribe({ email: "old@b.com", consent: true }, "ip", deps(mockFetch().f));
  assert.deepEqual(a, b);
});

test("confirm patches to subscribed, creates when missing, is idempotent", async () => {
  const t = signToken(config.secret!, "a@b.com", "c");
  const existing = mockFetch();
  assert.equal(await handleToken(t, "c", deps(existing.f)), "ok");
  assert.equal(existing.calls[0].method, "PATCH");
  assert.deepEqual(existing.calls[0].body, { unsubscribed: false });
  assert.match(existing.calls[0].url, /\/audiences\/aud_test\/contacts\/a%40b\.com$/);
  const fresh = mockFetch((c) => (c.method === "PATCH" ? 404 : 200));
  assert.equal(await handleToken(t, "c", deps(fresh.f)), "ok");
  assert.equal(fresh.calls[1].method, "POST");
  assert.deepEqual(fresh.calls[1].body, { email: "a@b.com", unsubscribed: false });
  assert.equal(await handleToken(t, "c", deps(existing.f)), "ok");
});

test("unsubscribe sets unsubscribed:true and tolerates unknown contacts", async () => {
  const t = signToken(config.secret!, "a@b.com", "u");
  const m = mockFetch();
  assert.equal(await handleToken(t, "u", deps(m.f)), "ok");
  assert.deepEqual(m.calls[0].body, { unsubscribed: true });
  const gone = mockFetch(() => 404);
  assert.equal(await handleToken(t, "u", deps(gone.f)), "ok");
  assert.equal(gone.calls.length, 1, "never creates a contact on unsubscribe");
  assert.equal(await handleToken(signToken(config.secret!, "a@b.com", "c"), "u", deps(m.f)), "invalid");
  assert.equal(await handleToken(t, "u", deps(mockFetch(() => 500).f)), "error");
});

test("copy rules: no dashes, no middle dot, no banned word", () => {
  const e = confirmEmail(config, "a@b.com");
  const all = `${e.subject}\n${e.text}\n${e.html}\n${Object.values(MSG).join("\n")}`;
  assert.doesNotMatch(all, /[\u2013\u2014\u00b7]/);
  assert.doesNotMatch(all, /glass/i);
  assert.ok(newsletterUnsubscribeHeaders(config, "a@b.com")["List-Unsubscribe"].includes("mailto:hello@forecourt.me"));
});

test("fillPlaceholders swaps recipient fields and escapes html", async () => {
  const { fillPlaceholders } = await import("../../emails/fill.ts");
  const out = fillPlaceholders('<a href="[UNSUBSCRIBE_LINK]">Hello [FIRST_NAME], [MONTH]</a>', { unsubscribeUrl: "https://x/u?t=a&b", firstName: "<Jo>" }, "html");
  assert.equal(out, '<a href="https://x/u?t=a&amp;b">Hello &lt;Jo&gt;, [MONTH]</a>');
  assert.equal(fillPlaceholders("Hello [FIRST_NAME]", { unsubscribeUrl: "u" }, "text"), "Hello there");
});
