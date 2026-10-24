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

export type LineKey = "group_site" | "franchise_base" | "franchise_extra" | "site_base";
export type BillingLine = { key: LineKey; label: string; unitPence: number; quantity: number; live?: number };

export const GROUP_SITE_PENCE = PLANS.group.monthPence;
export const FRANCHISE_BASE_PENCE = PLANS.franchise.monthPence;
/** Group bills at least this many sites (Matt, 24 Oct 2026). */
export const GROUP_MIN_SITES = PLANS.group.minSites;

/** Group quantity for a live count: never below the minimum. */
export function groupQuantity(live: number): number {
  return Math.max(GROUP_MIN_SITES, Math.max(0, Math.floor(live)));
}

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
  if (plan === "group") return [{ key: "group_site", label: "Per site", unitPence: GROUP_SITE_PENCE, quantity: groupQuantity(n), live: n }];
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
export type SiteBillRow = { code: string; name: string; status: SiteStatus; note: string; pence: number; included?: boolean };

/** Amount column text: "Included", "Not billed" or the price. */
export function amountLabel(r: SiteBillRow): string {
  if (r.included) return "Included";
  if (r.status !== "live") return "Not billed";
  return `£${(r.pence / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
}

export function siteBreakdown(plan: PlanId, sites: BillingSite[]): { rows: SiteBillRow[]; lines: BillingLine[]; total: number; live: number } {
  const live = liveSiteCount(sites);
  const lines = linesFor(plan, live);
  let liveIndex = 0;
  const rows = sites.map((s): SiteBillRow => {
    if (s.status === "setting_up") return { code: s.code, name: s.name, status: s.status, note: "", pence: 0 };
    if (s.status === "archived") return { code: s.code, name: s.name, status: s.status, note: "Archived, not billed from the next period", pence: 0 };
    liveIndex += 1;
    if (plan === "group") return { code: s.code, name: s.name, status: s.status, note: "", pence: GROUP_SITE_PENCE };
    if (plan === "franchise") {
      return liveIndex <= FRANCHISE_INCLUDED_SITES
        ? { code: s.code, name: s.name, status: s.status, note: "", pence: 0, included: true }
        : { code: s.code, name: s.name, status: s.status, note: "Extra site", pence: FRANCHISE_EXTRA_SITE_PENCE };
    }
    return { code: s.code, name: s.name, status: s.status, note: "", pence: 0 };
  });
  return { rows, lines, total: monthlyPence(lines), live };
}

/** How a quantity change should prorate. Up: charge from today, unless the slot was already paid this period. Down: never prorate. */
export function prorationFor(fromQty: number, toQty: number, paidSlots: number): "create_prorations" | "none" {
  if (toQty <= fromQty) return "none";
  return toQty <= paidSlots ? "none" : "create_prorations";
}

function gbpWhole(pence: number) {
  return `£${(pence / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
}

/** Totals copy: "3 live sites at £249", "2 extra sites at £100", "Franchise, up to 5 sites". */
export function lineLabel(l: BillingLine): string {
  if (l.key === "group_site") {
    if (l.live != null && l.live < l.quantity) return `${l.quantity} site minimum at ${gbpWhole(l.unitPence)} (${l.live} live)`;
    return `${l.quantity} live ${l.quantity === 1 ? "site" : "sites"} at ${gbpWhole(l.unitPence)}`;
  }
  if (l.key === "franchise_extra") return `${l.quantity} extra ${l.quantity === 1 ? "site" : "sites"} at ${gbpWhole(l.unitPence)}`;
  return l.label;
}

/**
 * End of the current monthly period, from the day monthly billing started
 * (the go live "Monthly billing started" timeline entry). Stripe bills on the
 * same day each month, clamped to the month's last day. No Stripe call.
 */
export function periodEndFrom(anchorIso: string | null | undefined, now: Date = new Date()): string | null {
  if (!anchorIso) return null;
  const a = new Date(anchorIso);
  if (Number.isNaN(a.getTime())) return null;
  const at = (months: number) => {
    const y = a.getUTCFullYear();
    const m = a.getUTCMonth() + months;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(a.getUTCDate(), last), a.getUTCHours(), a.getUTCMinutes(), a.getUTCSeconds()));
  };
  for (let i = 1; i < 1200; i++) {
    const d = at(i);
    if (d.getTime() > now.getTime()) return d.toISOString();
  }
  return null;
}

export function ukDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).replace("Sept", "Sep");
}

/** What the month would cost if one site moved to a new state. */
export function totalIf(plan: PlanId, sites: BillingSite[], code: string, to: SiteStatus): number {
  return siteBreakdown(plan, sites.map((s) => (s.code === code ? { ...s, status: to } : s))).total;
}

const whole = (p: number) => `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function goLiveConfirmCopy(name: string, before: number, after: number): string {
  const up = after - before;
  if (up <= 0) return `Put ${name} live? The bill stays at ${whole(after)} a month.`;
  return `Put ${name} live? From today the bill goes up by ${whole(up)} to ${whole(after)} a month. The part month is added to the next invoice.`;
}

export function archiveConfirmCopy(name: string, before: number, after: number, periodEnd: string | null): string {
  const when = periodEnd ? `${ukDate(periodEnd)}, the end of this billing period` : "the end of this billing period";
  if (after >= before) return `Archive ${name}? The bill stays at ${whole(after)} a month. We don't refund part months.`;
  return `Archive ${name}? The bill goes down by one site from ${when}. We don't refund part months. New monthly total: ${whole(after)}.`;
}
