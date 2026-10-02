/**
 * Spot a paid order that looks like a dealership we already have, so staff
 * can check it is not a duplicate. This only flags; it never blocks.
 *
 * Pure (no framework or `@/` imports) so it can be unit tested with node --test.
 */

const DROP_WORDS = new Set(["ltd", "limited", "plc", "llp"]);
const SAME_WORDS: Record<string, string> = { street: "st" };

/** "St. John's Motors Ltd" and "st johns motors" give the same key. */
export function dealerNameKey(name: string | null | undefined): string {
  const words = (name ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SAME_WORDS[w] ?? w)
    .filter((w) => !DROP_WORDS.has(w));
  return words.join(" ");
}

export function emailKey(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export type MatchTenant = {
  id: number;
  name?: string | null;
  email?: string | null;
  status?: string | null;
};

/** Statuses that mean a package was paid for and is still running. */
const PAID_STATUSES = new Set(["trial", "subscribed", "paid", "live"]);

export type DealerMatch = { tenantId: number; name: string; status: string; reasons: ("similar_name" | "same_email")[] };

/** Other paid tenants that share this site's name (after normalising) or email. */
export function similarPaidTenants(current: MatchTenant, others: MatchTenant[]): DealerMatch[] {
  const nameKey = dealerNameKey(current.name);
  const mail = emailKey(current.email);
  const out: DealerMatch[] = [];
  for (const o of others) {
    if (o.id === current.id) continue;
    if (!PAID_STATUSES.has(o.status ?? "")) continue;
    const reasons: DealerMatch["reasons"] = [];
    if (nameKey && dealerNameKey(o.name) === nameKey) reasons.push("similar_name");
    if (mail && emailKey(o.email) === mail) reasons.push("same_email");
    if (reasons.length) out.push({ tenantId: o.id, name: o.name ?? "", status: o.status ?? "", reasons });
  }
  return out;
}

export function dealerMatchNote(current: MatchTenant, matches: DealerMatch[]): string {
  const lines = matches.map((m) => {
    const why = m.reasons.map((r) => (r === "similar_name" ? "a similar name" : "the same email")).join(" and ");
    return `#${m.tenantId} ${m.name || "(no name)"} (${m.status}) has ${why}.`;
  });
  return `New paid order for ${current.name || "this site"} looks like an existing dealership. ${lines.join(" ")} Check it is not a duplicate before you build. Nothing was blocked.`;
}
