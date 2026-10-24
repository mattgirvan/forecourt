/** History timeline helpers, pure so they can be unit tested. */

/** Body and time joined with a comma, without a doubled full stop ("office., 24 Sep"). */
export function timelineMeta(body: string | null | undefined, when: string): string {
  const b = (body ?? "").trim().replace(/[.\s]+$/, "");
  return [b, when].filter(Boolean).join(", ");
}

/** Newest first. Stable for equal times; missing times go last. */
export function newestFirst<T extends { created_at?: string | null }>(events: readonly T[]): T[] {
  const t = (e: T) => (e.created_at ? Date.parse(e.created_at) || 0 : -Infinity);
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => t(b.e) - t(a.e) || a.i - b.i)
    .map((x) => x.e);
}
