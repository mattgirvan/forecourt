/**
 * Journey email gate. Pure (no `@/` imports) so the rules are unit tested.
 *
 * The rules, in order:
 *  1. EMAIL_MODE: unset or anything except "team" / "live" means off. Off
 *     sends nothing.
 *  2. team: every email goes only to the EMAIL_TEAM_TO list, never to the
 *     customer. Use it to check real sends end to end.
 *  3. live: goes to the customer, except staff recipients, Stripe test-mode
 *     payments, non-production deploys and archived sites.
 *  4. A row is written to email_log BEFORE sending, keyed by a unique
 *     dedupe key. Already there means already sent: skip. Table missing or
 *     any other database error: skip (fail safe, never a duplicate).
 *  5. Resend gets the same key as its idempotency key.
 */

export type EmailMode = "off" | "team" | "live";

export function emailMode(raw: string | null | undefined): EmailMode {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "team" || v === "live" ? v : "off";
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function teamList(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(/[\s,;]+/)) {
    const e = part.trim().toLowerCase();
    if (e && EMAIL_RE.test(e) && !out.includes(e)) out.push(e);
  }
  return out;
}

export type ClaimResult = "claimed" | "duplicate" | "unavailable";

export type EmailLogRow = {
  dedupe_key: string;
  tenant_id: number | null;
  kind: string;
  step: number | null;
  mode: "team" | "live";
  recipient: string;
  subject: string;
};

export interface EmailLogStore {
  /** Insert the row before sending. Never throws. */
  claim(row: EmailLogRow): Promise<ClaimResult>;
  /** Record the outcome. Never throws. */
  finish(dedupeKey: string, patch: { status: "sent" | "failed"; provider_id?: string; error?: string }): Promise<void>;
}

export type OutgoingEmail = {
  from: string;
  to: string[];
  replyTo: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailSender = (msg: OutgoingEmail, idempotencyKey: string) => Promise<{ id?: string | null; error?: string | null }>;

export type GateConfig = {
  mode: EmailMode;
  teamTo: string[];
  /** VERCEL_ENV. Live sends only happen when this is "production"; unset blocks them too. */
  vercelEnv: string | null | undefined;
};

export type JourneyEmail = {
  dedupeKey: string;
  tenantId: number | null;
  kind: string;
  step: number | null;
  /** The customer address, before any team redirect. */
  recipient: string | null | undefined;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  /** Facts for the live-mode skips. */
  recipientIsStaff: boolean;
  /** Stripe livemode for payment emails; null when not from a payment. */
  stripeLivemode?: boolean | null;
  archived?: boolean;
};

export type DeliverResult =
  | { sent: true; mode: "team" | "live"; to: string[]; id: string | null }
  | {
      sent: false;
      reason:
        | "mode_off"
        | "team_list_empty"
        | "no_recipient"
        | "staff_recipient"
        | "test_payment"
        | "not_production"
        | "archived"
        | "no_sender"
        | "duplicate"
        | "log_unavailable"
        | "send_failed";
      detail?: string;
    };

export type DeliverDeps = {
  config: GateConfig;
  log: EmailLogStore;
  send: EmailSender | null;
  logger?: { warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
};

/** Decide, log, then send. Never throws. */
export async function deliverJourneyEmail(deps: DeliverDeps, email: JourneyEmail): Promise<DeliverResult> {
  const { config } = deps;
  const logger = deps.logger ?? { warn: () => {}, error: () => {} };
  if (config.mode === "off") return { sent: false, reason: "mode_off" };

  let to: string[];
  let subject = email.subject;
  let text = email.text;
  const customer = (email.recipient ?? "").trim().toLowerCase();
  if (config.mode === "team") {
    if (!config.teamTo.length) return { sent: false, reason: "team_list_empty" };
    to = config.teamTo;
    subject = `[Team copy] ${email.subject}`;
    text = `Team copy. In live mode this would go to: ${customer || "(no customer address)"}\n\n${email.text}`;
  } else {
    if (!customer || !EMAIL_RE.test(customer)) return { sent: false, reason: "no_recipient" };
    if (email.recipientIsStaff) return { sent: false, reason: "staff_recipient" };
    if (email.stripeLivemode === false) return { sent: false, reason: "test_payment" };
    if ((config.vercelEnv ?? "") !== "production") return { sent: false, reason: "not_production" };
    if (email.archived) return { sent: false, reason: "archived" };
    to = [customer];
  }
  if (!deps.send) return { sent: false, reason: "no_sender" };

  // The mode is part of the key, so a team test never blocks the real email later.
  const key = `${config.mode}:${email.dedupeKey}`;
  const claim = await deps.log.claim({
    dedupe_key: key,
    tenant_id: email.tenantId,
    kind: email.kind,
    step: email.step,
    mode: config.mode,
    recipient: to.join(", "),
    subject,
  });
  if (claim === "duplicate") return { sent: false, reason: "duplicate" };
  if (claim === "unavailable") {
    logger.warn("[email] email_log unavailable; skipping", key);
    return { sent: false, reason: "log_unavailable" };
  }

  try {
    const res = await deps.send({ from: email.from, to, replyTo: email.replyTo, subject, html: email.html, text }, key);
    if (res.error) {
      await deps.log.finish(key, { status: "failed", error: String(res.error).slice(0, 500) });
      logger.error("[email] send failed", key, res.error);
      return { sent: false, reason: "send_failed", detail: String(res.error) };
    }
    await deps.log.finish(key, { status: "sent", provider_id: res.id ?? "" });
    return { sent: true, mode: config.mode, to, id: res.id ?? null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await deps.log.finish(key, { status: "failed", error: msg.slice(0, 500) });
    logger.error("[email] send threw", key, msg);
    return { sent: false, reason: "send_failed", detail: msg };
  }
}

export type StaffAlertEmail = {
  dedupeKey: string;
  tenantId: number | null;
  from: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * An internal alert for the Forecourt team (never a customer). Sent to the
 * EMAIL_TEAM_TO list whenever EMAIL_MODE is team or live; off sends nothing.
 * Logged and deduped like journey emails. Never throws.
 */
export async function deliverStaffAlert(deps: DeliverDeps, email: StaffAlertEmail): Promise<DeliverResult> {
  const { config } = deps;
  const logger = deps.logger ?? { warn: () => {}, error: () => {} };
  if (config.mode === "off") return { sent: false, reason: "mode_off" };
  if (!config.teamTo.length) return { sent: false, reason: "team_list_empty" };
  if (!deps.send) return { sent: false, reason: "no_sender" };
  const key = `staff:${email.dedupeKey}`;
  const subject = `[Forecourt staff] ${email.subject}`;
  const claim = await deps.log.claim({
    dedupe_key: key,
    tenant_id: email.tenantId,
    kind: "staff_alert",
    step: null,
    mode: config.mode,
    recipient: config.teamTo.join(", "),
    subject,
  });
  if (claim === "duplicate") return { sent: false, reason: "duplicate" };
  if (claim === "unavailable") {
    logger.warn("[email] email_log unavailable; skipping", key);
    return { sent: false, reason: "log_unavailable" };
  }
  try {
    const res = await deps.send(
      { from: email.from, to: config.teamTo, replyTo: email.replyTo, subject, html: email.html, text: email.text },
      key,
    );
    if (res.error) {
      await deps.log.finish(key, { status: "failed", error: String(res.error).slice(0, 500) });
      return { sent: false, reason: "send_failed", detail: String(res.error) };
    }
    await deps.log.finish(key, { status: "sent", provider_id: res.id ?? "" });
    return { sent: true, mode: config.mode, to: config.teamTo, id: res.id ?? null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await deps.log.finish(key, { status: "failed", error: msg.slice(0, 500) });
    logger.error("[email] staff alert threw", key, msg);
    return { sent: false, reason: "send_failed", detail: msg };
  }
}

type DbError = { code?: string; message?: string } | null;
type InsertResult = { error: DbError };
// Minimal structural type so this file needs no supabase-js import.
export type EmailLogDb = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<InsertResult>;
    update: (patch: Record<string, unknown>) => { eq: (col: string, v: unknown) => PromiseLike<InsertResult> };
  };
};

/** email_log on Supabase (service role). 23505 = already sent; anything else = unavailable. */
export function supabaseEmailLog(sb: EmailLogDb | null): EmailLogStore {
  return {
    async claim(row) {
      if (!sb) return "unavailable";
      try {
        const { error } = await sb.from("email_log").insert({ ...row, status: "sending" });
        if (!error) return "claimed";
        if (error.code === "23505") return "duplicate";
        return "unavailable";
      } catch {
        return "unavailable";
      }
    },
    async finish(key, patch) {
      if (!sb) return;
      try {
        await sb
          .from("email_log")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("dedupe_key", key);
      } catch {
        /* best effort */
      }
    },
  };
}
