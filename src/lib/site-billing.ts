/**
 * Group build PR 3: per-site billing maths. Pure, no Stripe, no database.
 *
 * Group: one line, £249 x live sites.
 * Franchise: £899 flat (covers up to 5 live sites) plus "Extra site" £100 x max(0, live - 5).
 * Site: unchanged, never touched by site events.
 * Only sites that have gone live count. Setting up and archived sites never do.
 * Removing or archiving a site lowers the quantity with no proration, so it takes
 * effect from the next period. Adding a site never has a setup fee.
 */
import { FRANCHISE_EXTRA_SITE_PENCE, FRANCHISE_INCLUDED_SITES, PLANS, type PlanId } from "./catalog.ts";

export type SiteStatus = "setting_up" | "live" | "archived";
export type BillingSite = {
  code: string;
  name: string;
  status: SiteStatus;
  /** ISO time the site went live. */
  liveAt?: string | null;
  /** ISO time the site was archived. */
  archivedAt?: string | null;
};

export type LineKey = "group_site" | "franchise_base" | "franchise_extra";
export type BillingLine = { key: LineKey; label: string; unitPence: number; quantity: number };

export const GROUP_SITE_PENCE = PLANS.group.monthPence;
export const FRANCHISE_BASE_PENCE = PLANS.franchise.monthPence;

function iso(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/** tenants.sites JSON text, an array, or tenant_sites rows into BillingSite[]. Plain names count as live (today's single and legacy sites). */
export function parseBillingSites(raw: unknown): BillingSite[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const out: BillingSite[] = [];
  for (const s of list) {
    if (typeof s === "string" && s.trim()) {
      out.push({ code: s.trim(), name: s.trim(), status: "live" });
      continue;
    }
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : typeof o.code === "string" ? o.code : "";
    if (!name) continue;
    const st = o.status === "archived" || o.status === "setting_up" ? o.status : "live";
    out.push({
      code: typeof o.code === "string" ? o.code : name,
      name,
      status: st,
      liveAt: iso(o.liveAt ?? o.live_at),
      archivedAt: iso(o.archivedAt ?? o.archived_at),
    });
  }
  return out;
}

/** Sites that count toward the bill: live only. */
export function liveSiteCount(sites: BillingSite[]): number {
  return sites.filter((s) => s.status === "live").length;
}

/** Sites already paid for in the current period: the ones that were live when it started
 *  (including any archived since). A site with no liveAt is treated as live before the period. */
export function paidSlotsThisPeriod(sites: BillingSite[], periodStartIso: string | null | undefined): number {
  const start = periodStartIso ? Date.parse(periodStartIso) : NaN;
  if (Number.isNaN(start)) return liveSiteCount(sites);
  return sites.filter((s) => {
    if (s.status === "setting_up") return false;
    const wentLive = s.liveAt ? Date.parse(s.liveAt) : -Infinity;
    if (!(wentLive < start)) return false;
    if (s.status === "live") return true;
    return Boolean(s.archivedAt && Date.parse(s.archivedAt) >= start);
  }).length;
}

export function franchiseExtraSites(live: number): number {
  return Math.max(0, live - FRANCHISE_INCLUDED_SITES);
}

/** The recurring lines a plan should carry for a number of live sites. Site plan returns [] (never touched). */
export function linesFor(plan: PlanId, live: number): BillingLine[] {
  const n = Math.max(0, Math.floor(live));
  if (plan === "group") return [{ key: "group_site", label: "Per site", unitPence: GROUP_SITE_PENCE, quantity: n }];
  if (plan === "franchise") {
    const lines: BillingLine[] = [{ key: "franchise_base", label: `Franchise, up to ${FRANCHISE_INCLUDED_SITES} sites`, unitPence: FRANCHISE_BASE_PENCE, quantity: 1 }];
    const extra = franchiseExtraSites(n);
    if (extra > 0) lines.push({ key: "franchise_extra", label: "Extra site", unitPence: FRANCHISE_EXTRA_SITE_PENCE, quantity: extra });
    return lines;
  }
  return [];
}

export function monthlyPence(lines: BillingLine[]): number {
  return lines.reduce((t, l) => t + l.unitPence * l.quantity, 0);
}

/** Per-site breakdown rows for the account and Office: what each site adds to the month. */
export type SiteBillRow = { code: string; name: string; status: SiteStatus; note: string; pence: number };

export function siteBreakdown(plan: PlanId, sites: BillingSite[]): { rows: SiteBillRow[]; lines: BillingLine[]; total: number; live: number } {
  const live = liveSiteCount(sites);
  const lines = linesFor(plan, live);
  let liveIndex = 0;
  const rows = sites.map((s): SiteBillRow => {
    if (s.status === "setting_up") return { code: s.code, name: s.name, status: s.status, note: "Setting up, billing starts on its go live day", pence: 0 };
    if (s.status === "archived") return { code: s.code, name: s.name, status: s.status, note: "Archived, not billed from the next period", pence: 0 };
    liveIndex += 1;
    if (plan === "group") return { code: s.code, name: s.name, status: s.status, note: "Live", pence: GROUP_SITE_PENCE };
    if (plan === "franchise") {
      return liveIndex <= FRANCHISE_INCLUDED_SITES
        ? { code: s.code, name: s.name, status: s.status, note: "Live, included in the franchise price", pence: 0 }
        : { code: s.code, name: s.name, status: s.status, note: "Live, extra site", pence: FRANCHISE_EXTRA_SITE_PENCE };
    }
    return { code: s.code, name: s.name, status: s.status, note: "Live", pence: 0 };
  });
  return { rows, lines, total: monthlyPence(lines), live };
}

/** How a quantity change should prorate. Up: charge from today, unless the slot was already paid this period. Down: never prorate. */
export function prorationFor(fromQty: number, toQty: number, paidSlots: number): "create_prorations" | "none" {
  if (toQty <= fromQty) return "none";
  return toQty <= paidSlots ? "none" : "create_prorations";
}
