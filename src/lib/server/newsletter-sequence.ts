/**
 * Newsletter launch sequence and the monthly Broadcast draft. Pure (no `@/`
 * imports) so the rules are unit tested with every Resend call mocked.
 *
 * Off unless NEWSLETTER_SEQUENCE_ENABLED is exactly "true". Off means the cron
 * and the broadcast draft make no Resend calls and no database writes at all.
 *
 * Launch sequence (one run a day from the cron):
 *  1. List the contacts in the newsletter Segment from Resend.
 *  2. Make sure each has a row in newsletter_subscribers. The confirm link
 *     writes that row at confirm time (confirmed_at = now). Anyone who
 *     confirmed before the table existed is backfilled once from the
 *     contact's Resend created_at, which for them is the confirm time
 *     because the contact is only created by the confirm link. An existing
 *     row is never changed, so a later re-confirm does not restart the clock.
 *  3. For each person pick the earliest step they have not had. It is sent
 *     only when it is due (days since confirm >= that step's day). So at most
 *     one email per person per run: anyone who joined before the flag went on
 *     catches up one step a day and never gets a burst.
 *  4. Re-read the contact from Resend and skip anyone unsubscribed.
 *  5. Claim the (email, step) row in newsletter_sequence_sends BEFORE the send.
 *     The unique (email, step) constraint means a second run, a retry or two
 *     overlapping runs can never send the same step twice. A failed send can
 *     be claimed again on a later run, and Resend also gets an idempotency key.
 */
import { createHmac } from "node:crypto";
import { LIST_EMAILS } from "../email/newsletter-list.generated.ts";
import { fillPlaceholders, unfilled } from "../../emails/fill.ts";
import { newsletterUnsubscribeHeaders, unsubscribeUrl, type NewsletterConfig } from "./newsletter.ts";

const RESEND_API = "https://api.resend.com";
export const DAY_MS = 24 * 60 * 60 * 1000;
/** Hard cap per run, well inside the function time limit. The rest go next run. */
export const MAX_SENDS_PER_RUN = 100;

export const SEQUENCE = [
  { step: 1, name: "launch-2a", day: 2 },
  { step: 2, name: "launch-2b", day: 5 },
  { step: 3, name: "launch-2c", day: 9 },
  { step: 4, name: "launch-2d", day: 14 },
] as const;
export type Step = (typeof SEQUENCE)[number];

/** Only exactly "true" turns it on. */
export function sequenceEnabled(raw: string | null | undefined): boolean {
  return raw === "true";
}

/** Whole days since confirm. Day 0 is the first 24 hours. */
export function daysSince(confirmedAtMs: number, now: number): number {
  return Math.floor((now - confirmedAtMs) / DAY_MS);
}

/** The earliest step not yet had, if it is due now. Otherwise null. */
export function nextStep(confirmedAtMs: number, had: ReadonlySet<number>, now: number): Step | null {
  const next = SEQUENCE.find((s) => !had.has(s.step));
  if (!next) return null;
  return daysSince(confirmedAtMs, now) >= next.day ? next : null;
}

/** Resend returns "2026-10-06 23:47:56.678+00". Also accepts ISO. */
export function parseResendTime(raw: unknown): number | null {
  if (typeof raw !== "string" || !raw) return null;
  let s = raw.trim().replace(" ", "T");
  if (/[+-]\d\d$/.test(s)) s += ":00";
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

function authed(c: NewsletterConfig, extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json", ...extra };
}

export type Contact = { email: string; created_at: string; unsubscribed: boolean };

/** Every contact in the Segment (paged, 100 at a time). Null on any error. */
export async function listSegmentContacts(c: NewsletterConfig, f: Fetch): Promise<Contact[] | null> {
  const out: Contact[] = [];
  let after: string | null = null;
  for (let page = 0; page < 100; page++) {
    const q = new URLSearchParams({ limit: "100", segment_id: c.segmentId! });
    if (after) q.set("after", after);
    const res = await f(`${RESEND_API}/contacts?${q}`, { method: "GET", headers: authed(c) });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Array<Record<string, unknown>>; has_more?: boolean };
    const data = body.data ?? [];
    for (const d of data) {
      if (typeof d.email === "string")
        out.push({ email: d.email.toLowerCase(), created_at: String(d.created_at ?? ""), unsubscribed: d.unsubscribed === true });
    }
    if (!body.has_more || !data.length) return out;
    after = String(data[data.length - 1].id ?? "");
    if (!after) return out;
  }
  return out;
}

/** Fresh unsubscribed flag. "unknown" on any error, which also means skip. */
export async function contactUnsubscribed(c: NewsletterConfig, email: string, f: Fetch): Promise<boolean | "unknown"> {
  try {
    const res = await f(`${RESEND_API}/contacts/${encodeURIComponent(email)}`, { method: "GET", headers: authed(c) });
    if (!res.ok) return res.status === 404 ? true : "unknown";
    const body = (await res.json()) as { unsubscribed?: unknown };
    return body.unsubscribed === true;
  } catch {
    return "unknown";
  }
}

function emailHash(c: NewsletterConfig, email: string) {
  return createHmac("sha256", c.secret!).update(`seq:${email}`).digest("base64url").slice(0, 24);
}

/** Same key every attempt for the same person and step. */
export function sequenceIdempotencyKey(c: NewsletterConfig, email: string, step: number) {
  return `nl-seq-${step}-${emailHash(c, email)}`;
}

/** Build one launch email. Throws if any slot is left unfilled. */
export function sequenceEmail(c: NewsletterConfig, email: string, step: Step) {
  const t = LIST_EMAILS[step.name];
  const fill = { unsubscribeUrl: unsubscribeUrl(c, email) };
  const html = fillPlaceholders(t.html, fill, "html");
  const text = fillPlaceholders(t.text, fill, "text");
  const left = [...unfilled(html), ...unfilled(text), ...unfilled(t.subject)];
  if (left.length) throw new Error(`${step.name}: unfilled ${left.join(", ")}`);
  return {
    from: c.from,
    to: [email],
    reply_to: c.replyTo,
    subject: t.subject,
    html,
    text,
    headers: newsletterUnsubscribeHeaders(c, email),
  };
}

export type Claim = "claimed" | "duplicate" | "unavailable";

export type SequenceStore = {
  /** Insert (email, confirmed_at) unless a row exists. Never overwrites. */
  ensureSubscribers(rows: { email: string; confirmed_at: string }[]): Promise<boolean>;
  /** confirmed_at by email for these addresses. Null when the table is missing. */
  confirmedAt(emails: string[]): Promise<Map<string, string> | null>;
  /** Steps already sent or in flight (status sent or sending) by email. */
  stepsHad(emails: string[]): Promise<Map<string, Set<number>> | null>;
  /** Insert the (email, step) row first, or take back a failed one. */
  claim(email: string, step: number): Promise<Claim>;
  finish(email: string, step: number, patch: { status: "sent" | "failed"; provider_id?: string; error?: string }): Promise<void>;
};

export type RunDeps = {
  enabled: boolean;
  config: NewsletterConfig;
  fetch: Fetch;
  store: SequenceStore;
  now?: () => number;
  /** Pause between sends so Resend's rate limit is never hit. */
  sleep?: (ms: number) => Promise<void>;
  maxSends?: number;
};

export type RunResult = {
  enabled: boolean;
  ok: boolean;
  reason?: string;
  contacts: number;
  sent: number;
  notDue: number;
  unsubscribed: number;
  duplicate: number;
  failed: number;
};

export async function runSequence(d: RunDeps): Promise<RunResult> {
  const r: RunResult = { enabled: d.enabled, ok: true, contacts: 0, sent: 0, notDue: 0, unsubscribed: 0, duplicate: 0, failed: 0 };
  if (!d.enabled) return { ...r, reason: "NEWSLETTER_SEQUENCE_ENABLED is not true, nothing sent" };
  const c = d.config;
  if (!c.apiKey || !c.segmentId || !c.secret || c.secret.length < 16) return { ...r, ok: false, reason: "newsletter not configured" };
  const now = d.now?.() ?? Date.now();
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));
  const max = d.maxSends ?? MAX_SENDS_PER_RUN;

  const contacts = await listSegmentContacts(c, d.fetch);
  if (!contacts) return { ...r, ok: false, reason: "could not list contacts" };
  r.contacts = contacts.length;
  const live = contacts.filter((x) => !x.unsubscribed);
  r.unsubscribed += contacts.length - live.length;
  if (!live.length) return r;

  // Backfill anyone who confirmed before the table existed, from created_at.
  const backfill = live
    .map((x) => ({ email: x.email, t: parseResendTime(x.created_at) }))
    .filter((x): x is { email: string; t: number } => x.t !== null)
    .map((x) => ({ email: x.email, confirmed_at: new Date(x.t).toISOString() }));
  if (!(await d.store.ensureSubscribers(backfill))) return { ...r, ok: false, reason: "newsletter_subscribers unavailable" };
  const emails = live.map((x) => x.email);
  const confirmed = await d.store.confirmedAt(emails);
  const had = await d.store.stepsHad(emails);
  // Fail safe: no log, no sends.
  if (!confirmed || !had) return { ...r, ok: false, reason: "send log unavailable" };

  for (const x of live) {
    const at = parseResendTime(confirmed.get(x.email));
    if (at === null) continue;
    const step = nextStep(at, had.get(x.email) ?? new Set(), now);
    if (!step) {
      r.notDue++;
      continue;
    }
    if (r.sent + r.failed >= max) break;
    const unsub = await contactUnsubscribed(c, x.email, d.fetch);
    if (unsub !== false) {
      if (unsub === true) r.unsubscribed++;
      else r.failed++;
      continue;
    }
    let msg;
    try {
      msg = sequenceEmail(c, x.email, step);
    } catch {
      r.failed++;
      continue;
    }
    const claim = await d.store.claim(x.email, step.step);
    if (claim === "duplicate") {
      r.duplicate++;
      continue;
    }
    if (claim === "unavailable") return { ...r, ok: false, reason: "send log unavailable" };
    try {
      const res = await d.fetch(`${RESEND_API}/emails`, {
        method: "POST",
        headers: authed(c, { "Idempotency-Key": sequenceIdempotencyKey(c, x.email, step.step) }),
        body: JSON.stringify(msg),
      });
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { id?: string };
        await d.store.finish(x.email, step.step, { status: "sent", provider_id: body.id ?? "" });
        r.sent++;
      } else {
        await d.store.finish(x.email, step.step, { status: "failed", error: `resend ${res.status}` });
        r.failed++;
      }
    } catch (e) {
      await d.store.finish(x.email, step.step, { status: "failed", error: String(e instanceof Error ? e.message : e).slice(0, 300) });
      r.failed++;
    }
    await sleep(600);
  }
  return r;
}

/* ---------------- Monthly Broadcast draft ---------------- */

export type DraftResult =
  | { ok: true; id: string; status: "draft" }
  | { ok: false; status: number; error: string; missing?: string[] };

/**
 * Create the monthly newsletter as a Resend Broadcast DRAFT for the Segment.
 * Never sends and never schedules: the body has no `send` and no
 * `scheduled_at`, and Resend's default for `send` is false. Matt reviews and
 * sends it from the Resend dashboard. Refuses if any slot is left unfilled.
 */
export async function createMonthlyDraft(
  d: { enabled: boolean; config: NewsletterConfig; fetch: Fetch },
  slots: Record<string, string>,
  name?: string,
): Promise<DraftResult> {
  if (!d.enabled) return { ok: false, status: 403, error: "NEWSLETTER_SEQUENCE_ENABLED is not true." };
  const c = d.config;
  if (!c.apiKey || !c.segmentId) return { ok: false, status: 503, error: "Newsletter is not configured." };
  const t = LIST_EMAILS.monthly;
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(slots ?? {})) {
    if (/^[A-Z0-9_]+$/.test(k) && k !== "UNSUBSCRIBE_URL" && typeof v === "string" && v.trim()) extra[k] = v.trim();
  }
  // Resend fills its own per-contact unsubscribe link in a Broadcast.
  const SENTINEL = "https://unsubscribe.invalid/forecourt-sentinel";
  const fill = { unsubscribeUrl: SENTINEL, extra };
  const subject = fillPlaceholders(t.subject, fill, "text");
  const html = fillPlaceholders(t.html, fill, "html");
  const text = fillPlaceholders(t.text, fill, "text");
  const missing = [...new Set([...unfilled(subject), ...unfilled(html), ...unfilled(text)])];
  if (missing.length) return { ok: false, status: 400, error: "Fill every slot before creating the draft.", missing };
  const unsub = "{{{RESEND_UNSUBSCRIBE_URL}}}";
  const body = {
    segment_id: c.segmentId,
    from: c.from,
    reply_to: c.replyTo,
    subject,
    html: html.split(SENTINEL).join(unsub),
    text: text.split(SENTINEL).join(unsub),
    name: name ?? subject,
  };
  const res = await d.fetch(`${RESEND_API}/broadcasts`, { method: "POST", headers: authed(c), body: JSON.stringify(body) });
  if (!res.ok) return { ok: false, status: 502, error: `Resend said ${res.status}.` };
  const out = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: out.id ?? "", status: "draft" };
}
