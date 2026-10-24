/**
 * Newsletter double opt-in. Pure (no `@/` imports) so the rules are unit tested.
 *
 *  1. POST email + consent tick. Honeypot, validation and rate limits first.
 *  2. Send "Forecourt: confirm your subscription" with a signed, expiring
 *     confirm link (HMAC-SHA256, NEWSLETTER_TOKEN_SECRET). Nothing is stored yet.
 *  3. Only the confirm link adds the contact to the Resend Segment
 *     (RESEND_NEWSLETTER_SEGMENT_ID, falling back to RESEND_NEWSLETTER_AUDIENCE_ID)
 *     or sets it back to unsubscribed:false.
 *  4. Every response to step 1 is the same, so nobody can learn whether an
 *     address is already on the list.
 *  5. Unsubscribe tokens never expire and set unsubscribed:true. Confirm and
 *     unsubscribe are idempotent.
 *
 * Future newsletter sends MUST use newsletterUnsubscribeHeaders() and put
 * unsubscribeUrl() in the body. See the comment on newsletterUnsubscribeHeaders.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
// Designed template, rendered by scripts/render-emails.tsx (React Email).
import { CONFIRM_HTML } from "../email/newsletter-confirm.generated.ts";

export const CONFIRM_TTL_MS = 48 * 60 * 60 * 1000;
export const CONFIRM_SUBJECT = "Forecourt: confirm your subscription";
const RESEND_API = "https://api.resend.com";

export type NewsletterConfig = {
  apiKey?: string;
  /** Resend Segment ID (formerly Audience ID). */
  segmentId?: string;
  secret?: string;
  /** e.g. "Forecourt <hello@forecourt.me>" */
  from: string;
  replyTo: string;
  /** Public origin for links, e.g. https://www.forecourt.me */
  baseUrl: string;
};

export type Purpose = "c" | "u";

export function configured(c: NewsletterConfig) {
  return Boolean(c.apiKey && c.segmentId && c.secret && c.secret.length >= 16);
}

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[A-Za-z]{2,}$/;

export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length < 6 || e.length > 254 || !EMAIL_RE.test(e)) return null;
  return e;
}

function b64url(buf: Buffer | string) {
  return Buffer.from(buf).toString("base64url");
}

function mac(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function signToken(secret: string, email: string, p: Purpose, now = Date.now()): string {
  const payload: { e: string; p: Purpose; x?: number } = { e: email, p };
  if (p === "c") payload.x = now + CONFIRM_TTL_MS;
  const body = b64url(JSON.stringify(payload));
  return `${body}.${mac(secret, `${p}:${body}`)}`;
}

export type Verified = { ok: true; email: string } | { ok: false; reason: "invalid" | "expired" };

export function verifyToken(secret: string, token: unknown, p: Purpose, now = Date.now()): Verified {
  if (typeof token !== "string" || token.length > 1024) return { ok: false, reason: "invalid" };
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return { ok: false, reason: "invalid" };
  const want = Buffer.from(mac(secret, `${p}:${body}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: "invalid" };
  let payload: { e?: unknown; p?: unknown; x?: unknown };
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const email = normaliseEmail(payload.e);
  if (!email || payload.p !== p) return { ok: false, reason: "invalid" };
  if (p === "c" && (typeof payload.x !== "number" || payload.x < now)) return { ok: false, reason: "expired" };
  return { ok: true, email };
}

export function confirmUrl(c: NewsletterConfig, email: string, now = Date.now()) {
  return `${c.baseUrl}/api/newsletter/confirm?t=${encodeURIComponent(signToken(c.secret!, email, "c", now))}`;
}

export function unsubscribeUrl(c: NewsletterConfig, email: string) {
  return `${c.baseUrl}/api/newsletter/unsubscribe?t=${encodeURIComponent(signToken(c.secret!, email, "u"))}`;
}

/**
 * RFC 2369 + RFC 8058 one-click headers. Every newsletter send must pass
 * these as `headers` on the Resend email (one email per recipient, since the
 * token is per address) and also show unsubscribeUrl() as a visible link.
 * Gmail and Yahoo POST to the URL with List-Unsubscribe=One-Click; our POST
 * handler sets unsubscribed:true with no further click.
 */
export function newsletterUnsubscribeHeaders(c: NewsletterConfig, email: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(c, email)}>, <mailto:${c.replyTo}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function confirmEmail(c: NewsletterConfig, email: string, now = Date.now()) {
  const link = confirmUrl(c, email, now);
  const unsub = unsubscribeUrl(c, email);
  const text = [
    "Hello,",
    "",
    "Someone, hopefully you, asked to get occasional Forecourt updates at this address.",
    "Confirm here (the link works for 48 hours):",
    link,
    "",
    "If this was not you, ignore this email and nothing happens. We will not add you.",
    "",
    "Forecourt, hello@forecourt.me",
    `Privacy: ${c.baseUrl}/privacy`,
  ].join("\n");
  const html = CONFIRM_HTML.split("{{CONFIRM_URL}}").join(link.replace(/&/g, "&amp;"));
  return {
    from: c.from,
    to: [email],
    reply_to: c.replyTo,
    subject: CONFIRM_SUBJECT,
    text,
    html,
    headers: newsletterUnsubscribeHeaders(c, email),
    unsub,
  };
}

/* ---------------- Resend REST (fetch injected for tests) ---------------- */

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

function authed(c: NewsletterConfig, extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json", ...extra };
}

export async function sendConfirmation(c: NewsletterConfig, email: string, f: Fetch, now = Date.now()) {
  const { unsub: _unsub, ...msg } = confirmEmail(c, email, now);
  // Same key for the same address in the same 10 minute bucket: double clicks send once.
  const bucket = Math.floor(now / (10 * 60 * 1000));
  const res = await f(`${RESEND_API}/emails`, {
    method: "POST",
    headers: authed(c, { "Idempotency-Key": `nl-confirm-${mac(c.secret!, email).slice(0, 24)}-${bucket}` }),
    body: JSON.stringify(msg),
  });
  return res.ok;
}

/**
 * Add or update the contact. Safe to repeat.
 * Uses Resend's global Contacts plus Segments (the Audiences API is deprecated):
 *  confirm: PATCH /contacts/{email} unsubscribed:false, or create it when missing,
 *           then POST /contacts/{email}/segments/{segment_id}.
 *  unsubscribe: PATCH /contacts/{email} unsubscribed:true (global opt out).
 */
export async function setSubscribed(c: NewsletterConfig, email: string, unsubscribed: boolean, f: Fetch) {
  const contact = `${RESEND_API}/contacts/${encodeURIComponent(email)}`;
  const patch = await f(contact, {
    method: "PATCH",
    headers: authed(c),
    body: JSON.stringify({ unsubscribed }),
  });
  if (unsubscribed) {
    // Not a contact at all is already the outcome they want.
    return patch.ok || patch.status === 404;
  }
  if (!patch.ok) {
    if (patch.status !== 404) return false;
    const create = await f(`${RESEND_API}/contacts`, {
      method: "POST",
      headers: authed(c),
      body: JSON.stringify({ email, unsubscribed: false, segments: [{ id: c.segmentId }] }),
    });
    return create.ok;
  }
  const add = await f(`${contact}/segments/${encodeURIComponent(c.segmentId!)}`, {
    method: "POST",
    headers: authed(c),
  });
  // Already in the segment is fine.
  return add.ok || add.status === 409;
}

/* ---------------- Rate limit (in memory, per instance) ---------------- */

export function makeLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()) => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return true;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return false;
  };
}

/* ---------------- Handlers ---------------- */

export const MSG = {
  sent: "Check your inbox. If that address can join, a confirmation link is on its way.",
  invalid: "Enter a valid email address.",
  consent: "Tick the box to say you want the emails.",
  limited: "Too many tries. Give it a few minutes.",
  notReady: "Sign-up is not open just yet. Email hello@forecourt.me and we will add you by hand.",
  failed: "Could not send the confirmation just now. Try again in a bit.",
} as const;

export type Deps = {
  config: NewsletterConfig;
  fetch: Fetch;
  now?: () => number;
  ipLimited: (key: string) => boolean;
  emailLimited: (key: string) => boolean;
  /**
   * Record the confirm time for the launch sequence. Best effort: a failure
   * never fails the confirm. Must never overwrite an earlier confirm time.
   */
  onConfirmed?: (email: string, at: number) => Promise<void>;
};

export type Result = { status: number; body: { ok: boolean; message: string } };

export async function handleSubscribe(raw: unknown, ip: string, d: Deps): Promise<Result> {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // Honeypot: pretend success.
  if (typeof body.company === "string" && body.company.trim()) return { status: 200, body: { ok: true, message: MSG.sent } };
  const email = normaliseEmail(body.email);
  if (!email) return { status: 400, body: { ok: false, message: MSG.invalid } };
  if (body.consent !== true && body.consent !== "on" && body.consent !== "yes")
    return { status: 400, body: { ok: false, message: MSG.consent } };
  if (d.ipLimited(ip)) return { status: 429, body: { ok: false, message: MSG.limited } };
  if (!configured(d.config)) return { status: 503, body: { ok: false, message: MSG.notReady } };
  // Per address limit answers like success: no hint about the address.
  if (d.emailLimited(email)) return { status: 200, body: { ok: true, message: MSG.sent } };
  try {
    const ok = await sendConfirmation(d.config, email, d.fetch, d.now?.() ?? Date.now());
    if (!ok) return { status: 502, body: { ok: false, message: MSG.failed } };
  } catch {
    return { status: 502, body: { ok: false, message: MSG.failed } };
  }
  return { status: 200, body: { ok: true, message: MSG.sent } };
}

export type Outcome = "ok" | "expired" | "invalid" | "unavailable" | "error";

export async function handleToken(token: unknown, p: Purpose, d: Deps): Promise<Outcome> {
  if (!configured(d.config)) return "unavailable";
  const v = verifyToken(d.config.secret!, token, p, d.now?.() ?? Date.now());
  if (!v.ok) return v.reason;
  let ok: boolean;
  try {
    ok = await setSubscribed(d.config, v.email, p === "u", d.fetch);
  } catch {
    return "error";
  }
  if (ok && p === "c" && d.onConfirmed) {
    try {
      await d.onConfirmed(v.email, d.now?.() ?? Date.now());
    } catch {
      /* the cron backfills from the contact's created_at */
    }
  }
  return ok ? "ok" : "error";
}
