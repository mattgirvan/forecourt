/**
 * What each plan holds (Matt, group build PR 9). Pure, no I/O.
 *   Site:      one brand, one site.
 *   Franchise: one brand, one or more sites.
 *   Group:     two or more brands, two or more sites.
 * Office, the desk pack, checkout and the account pages read these rules from here.
 */
import { PLANS, type PlanId } from "./catalog.ts";

export type PlanShape = { brands: "one" | "many"; sites: "one" | "many"; minSites: number; maxSites: number | null; minBrands: number; maxBrands: number | null };

export const PLAN_SHAPE: Record<PlanId, PlanShape> = {
  site: { brands: "one", sites: "one", minSites: 1, maxSites: 1, minBrands: 1, maxBrands: 1 },
  franchise: { brands: "one", sites: "many", minSites: PLANS.franchise.minSites, maxSites: null, minBrands: 1, maxBrands: 1 },
  group: { brands: "many", sites: "many", minSites: PLANS.group.minSites, maxSites: null, minBrands: 2, maxBrands: null },
};

/** Picker label: one brand on Site and Franchise, several on Group. */
export function brandLabel(plan: PlanId): string {
  return PLAN_SHAPE[plan].brands === "many" ? "Brands" : "Brand";
}
export function brandHint(plan: PlanId): string {
  if (plan === "group") return "Pick every brand in the group. The first one sets the desk colours.";
  if (plan === "franchise") return "One manufacturer brand for every site.";
  return "One brand for the one site.";
}
export function multiBrand(plan: PlanId): boolean {
  return PLAN_SHAPE[plan].brands === "many";
}

/** Site count a plan can be billed and set up for. */
export function clampSiteCount(plan: PlanId, n: number | null | undefined): number {
  const s = PLAN_SHAPE[plan];
  const v = Math.max(s.minSites, Math.floor(Number(n) || 1));
  return s.maxSites == null ? v : Math.min(s.maxSites, v);
}

export const SHAPE_GAPS = {
  siteOneSite: "A Site account has one site. Move to Franchise or Group for more.",
  oneBrand: "Pick one brand.",
  franchiseOneBrand: "A Franchise account has one brand. Move to Group for more.",
  siteOneBrand: "A Site account has one brand.",
  groupBrands: "Pick two or more brands for a group.",
} as const;

/** Gaps between what is set up and what the plan holds. Brands are brand ids, independent counts as a brand. */
export function shapeGaps(plan: PlanId, sites: string[], brands: string[]): string[] {
  const s = PLAN_SHAPE[plan];
  const nSites = sites.map((x) => x.trim()).filter(Boolean).length;
  const nBrands = new Set(brands.filter(Boolean)).size;
  const gaps: string[] = [];
  if (s.maxSites != null && nSites > s.maxSites) gaps.push(SHAPE_GAPS.siteOneSite);
  if (s.maxBrands != null && nBrands > s.maxBrands) gaps.push(plan === "site" ? SHAPE_GAPS.siteOneBrand : SHAPE_GAPS.franchiseOneBrand);
  if (nBrands < s.minBrands) gaps.push(plan === "group" ? SHAPE_GAPS.groupBrands : SHAPE_GAPS.oneBrand);
  return gaps;
}
