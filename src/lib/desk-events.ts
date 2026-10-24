/**
 * Desk to Forecourt events: signature check and event parsing, no I/O.
 * Each desk signs "timestamp.body" with HMAC SHA256 using its own secret
 * (desk 0007 forecourt_send). Forecourt keeps the same secret per desk in
 * desk_links, looked up by the X-Forecourt-Desk key id.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const DESK_EVENT_WINDOW_SECONDS = 300;

export type DeskEvent =
  | { event_id: string; kind: "site_added" | "site_removed" | "site_restored"; site: { code: string; name: string; status?: string }; actor?: string; at?: string }
  | { event_id: string; kind: "staff_access_changed"; staff: { email: string; all_sites: boolean | null; sites: string[] }; actor?: string; at?: string };

export function signDeskBody(secret: string, timestamp: string, body: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: "missing" | "stale" | "bad_signature" };

export function verifyDeskSignature(input: { secret: string; timestamp: string | null; signature: string | null; body: string; nowSeconds?: number }): VerifyResult {
  const { secret, timestamp, signature, body } = input;
  if (!secret || !timestamp || !signature) return { ok: false, reason: "missing" };
  const ts = Number(timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > DESK_EVENT_WINDOW_SECONDS) return { ok: false, reason: "stale" };
  const want = Buffer.from(signDeskBody(secret, timestamp, body));
  const got = Buffer.from(signature);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}

const str = (v: unknown, max = 200) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

export function parseDeskEvent(raw: string): DeskEvent | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  const event_id = str(j?.event_id);
  const kind = j?.kind;
  if (!event_id) return null;
  const actor = str(j.actor) ?? undefined;
  const at = str(j.at) ?? undefined;
  if (kind === "site_added" || kind === "site_removed" || kind === "site_restored") {
    const s = j.site as Record<string, unknown> | undefined;
    const code = str(s?.code, 40);
    const name = str(s?.name);
    if (!code || !name) return null;
    const status = s?.status === "live" || s?.status === "setting_up" || s?.status === "archived" ? (s.status as string) : undefined;
    return { event_id, kind, site: status ? { code, name, status } : { code, name }, actor, at };
  }
  if (kind === "staff_access_changed") {
    const s = j.staff as Record<string, unknown> | undefined;
    const email = str(s?.email, 320);
    if (!email) return null;
    const sites = Array.isArray(s?.sites) ? (s!.sites as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 200) : [];
    const all = typeof s?.all_sites === "boolean" ? (s!.all_sites as boolean) : null;
    return { event_id, kind, staff: { email, all_sites: all, sites }, actor, at };
  }
  return null;
}

/** email_log dedupe key: one email per desk event, however often it is resent. */
export function deskEventKey(tenantId: number, keyId: string, eventId: string): string {
  return `desk:${tenantId}:${keyId}:${eventId}`;
}
