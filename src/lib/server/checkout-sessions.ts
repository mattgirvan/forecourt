/**
 * One open Checkout per site. When a new checkout starts, any older Checkout
 * session for the same site that is still open is expired in Stripe, so two
 * tabs cannot both be paid. (If one slips through anyway, applyPaidOrder in
 * payments.ts keeps the first subscription and flags staff.)
 *
 * Pure (no framework or `@/` imports) so it can be unit tested with node --test.
 */

/**
 * Stripe Checkout sessions last 24 hours at most, so only pending orders from
 * the last day can still have an open session. Older abandoned orders stay
 * pending forever; looking them up would cost a Stripe call each, for nothing.
 */
export const OPEN_SESSION_WINDOW_HOURS = 25;
/** At most this many recent pending orders are checked per checkout. */
export const OPEN_SESSION_MAX = 10;

export function recentPendingCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - OPEN_SESSION_WINDOW_HOURS * 3600_000).toISOString();
}

export type OpenSessionDeps = {
  retrieve: (id: string) => Promise<{ id: string; status?: string | null }>;
  expire: (id: string) => Promise<unknown>;
  log: { warn: (...a: unknown[]) => void };
};

export type ExpireOutcome = { expired: string[]; skipped: string[]; failed: string[] };

/** Expire every still-open session in `sessionIds`. Never throws. */
export async function expireOpenSessions(deps: OpenSessionDeps, sessionIds: (string | null | undefined)[]): Promise<ExpireOutcome> {
  const out: ExpireOutcome = { expired: [], skipped: [], failed: [] };
  const seen = new Set<string>();
  for (const raw of sessionIds) {
    const id = (raw ?? "").trim();
    if (!id.startsWith("cs_") || seen.has(id)) continue;
    seen.add(id);
    try {
      const s = await deps.retrieve(id);
      if (s.status !== "open") {
        out.skipped.push(id);
        continue;
      }
      await deps.expire(id);
      out.expired.push(id);
    } catch (err) {
      deps.log.warn("[checkout] could not expire an older open session", id, err);
      out.failed.push(id);
    }
  }
  return out;
}
