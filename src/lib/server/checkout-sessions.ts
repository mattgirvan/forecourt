/**
 * One open Checkout per site. When a new checkout starts, any older Checkout
 * session for the same site that is still open is expired in Stripe, so two
 * tabs cannot both be paid. (If one slips through anyway, applyPaidOrder in
 * payments.ts keeps the first subscription and flags staff.)
 *
 * Pure (no framework or `@/` imports) so it can be unit tested with node --test.
 */

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
