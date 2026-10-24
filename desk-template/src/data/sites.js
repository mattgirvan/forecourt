/**
 * Sites on one shared desk. Pure helpers (no Supabase, no tenant import) so
 * they can be tested in node. Supabase rules (0005, 0006) are the real gate;
 * this only shapes what the UI shows.
 */

export const SWITCH_ROLES = ["management", "admin", "principal"];
export const ALL = "all";

/** tenant.json sites: strings ("Main") or { code, name, status }. */
export function normaliseSites(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((s) =>
      typeof s === "string"
        ? { code: s, name: s, status: "live" }
        : s && (s.code || s.name)
          ? { code: String(s.code || s.name), name: String(s.name || s.code), status: s.status || "live", ...(s.short ? { short: String(s.short) } : {}) }
          : null,
    )
    .filter(Boolean);
}

export function canSwitchSites(role) {
  return SWITCH_ROLES.includes(role);
}

/** Codes a seat is linked to: seat.sites (several) or seat.site (legacy one). */
export function seatSiteCodes(seat) {
  if (Array.isArray(seat?.sites) && seat.sites.length) return seat.sites.map(String);
  return seat?.site ? [String(seat.site)] : [];
}

const same = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

/**
 * Work out what this person sees.
 * @param seat  { role, site?, sites?, allSites? }
 * @param sites every site on the desk (normalised)
 * @param server optional { sites, allSites, canSwitch, scopingOn } from my_site_list()/my_site_access()
 */
export function resolveSiteAccess(seat, sites, server = null) {
  const live = sites.filter((s) => s.status !== "archived");
  if (server && server.scopingOn) {
    return {
      scoped: true,
      allSites: Boolean(server.allSites),
      canSwitch: Boolean(server.canSwitch),
      sites: normaliseSites(server.sites).filter((s) => s.status !== "archived"),
    };
  }
  const allSites = seat?.role === "principal" || seat?.allSites === true;
  const mine = seatSiteCodes(seat);
  const visible = allSites || !mine.length ? live : live.filter((s) => mine.some((c) => same(c, s.code)));
  return {
    // Legacy single-site desk: nothing to scope, show everything as before.
    scoped: live.length > 1,
    allSites: allSites || (!mine.length && live.length <= 1),
    canSwitch: canSwitchSites(seat?.role),
    sites: visible,
  };
}

/** Rows (deals, stock) for the current pick. */
export function filterBySite(rows, access, picked = ALL) {
  if (!access?.scoped) return rows;
  const codes = picked && picked !== ALL ? [picked] : access.sites.map((s) => s.code);
  return rows.filter((r) => codes.some((c) => same(c, r.site)));
}

/** What the header control shows. */
export function siteControl(access, picked = ALL) {
  const sites = access?.sites || [];
  if (!access?.canSwitch) {
    if (sites.length > 1) return { kind: "label", text: `${sites.length} sites`, hint: "Your sites" };
    return { kind: "label", text: sites[0]?.name || "Main", hint: "Your site" };
  }
  const hit = sites.find((s) => same(s.code, picked));
  const allLabel = access.allSites ? "All sites" : "All my sites";
  const foot = access.allSites ? "All sites is for managers and admins." : "Showing the sites you look after.";
  return { kind: "switcher", text: hit ? hit.name : allLabel, allLabel, foot, count: sites.length };
}

export function listHint(access, picked = ALL) {
  if (!access?.canSwitch) {
    return (access?.sites?.length || 0) > 1 ? "You're seeing stock for your sites only." : "You're seeing stock for your site only.";
  }
  if (picked === ALL && !access.allSites) return "Showing the sites you look after.";
  return picked === ALL ? "Showing every site. Pick a site above to narrow it down." : "Showing one site. Pick All sites to see every site.";
}

/** Account header: archived sites don't count. "2 sites, 1 archived". */
export function accountSitesSummary(sites) {
  const all = normaliseSites(sites);
  const archived = all.filter((s) => s.status === "archived").length;
  const n = all.length - archived;
  const head = `${n} ${n === 1 ? "site" : "sites"}`;
  return archived ? `${head}, ${archived} archived` : head;
}

/** First site code on the desk, for rows with no site. */
export function firstSiteCode(list) {
  return normaliseSites(list)[0]?.code || "Main";
}

/** Site name for row tags: the full name minus the group brand (first word),
 *  "Hartley Motors Used" gives "Motors Used". Never a bare condition word. */
const CONDITION = ["new", "used"];
export function siteShortName(sites, code) {
  const hit = normaliseSites(sites).find((s) => same(s.code, code));
  if (!hit) return code || "";
  const full = String(hit.name || hit.code).trim();
  const pick = hit.short || (full.split(/\s+/).length > 1 ? full.split(/\s+/).slice(1).join(" ") : full);
  return CONDITION.includes(pick.toLowerCase()) ? full : pick;
}

/** Row site tag: hidden when one site is in view, short name otherwise. */
export function rowSiteTag(access, picked, code) {
  if (!access?.scoped) return code || "";
  if (!access.canSwitch && (access.sites?.length || 0) <= 1) return null;
  if (access.canSwitch && picked !== ALL) return null;
  return siteShortName(access.sites, code);
}
