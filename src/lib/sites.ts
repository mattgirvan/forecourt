/** Account header summary of a tenant's sites, e.g. "2 sites, 1 archived".
 *  tenants.sites is JSON text holding names or { name, status } objects.
 *  Archived sites never count toward the number. */
export type SiteStatus = "setting_up" | "live" | "archived";
export type AccountSite = { name: string; status: SiteStatus };

export function parseAccountSites(raw: unknown): AccountSite[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const out: AccountSite[] = [];
  for (const s of list) {
    if (typeof s === "string" && s.trim()) out.push({ name: s.trim(), status: "live" });
    else if (s && typeof s === "object" && typeof (s as { name?: unknown }).name === "string") {
      const st = (s as { status?: unknown }).status;
      out.push({
        name: (s as { name: string }).name,
        status: st === "archived" || st === "setting_up" ? st : "live",
      });
    }
  }
  return out;
}

export function accountSitesSummary(raw: unknown): string {
  const sites = parseAccountSites(raw);
  const archived = sites.filter((s) => s.status === "archived").length;
  const n = sites.length - archived;
  if (!sites.length) return "";
  const head = `${n} site${n === 1 ? "" : "s"}`;
  return archived ? `${head}, ${archived} archived` : head;
}
