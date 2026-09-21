export const FEATURES = [
  { id: "overview", label: "Overview + GP", defaultOn: true },
  { id: "stock", label: "Stock", defaultOn: true },
  { id: "locator", label: "Locator", defaultOn: true },
  { id: "pipeline", label: "Dealer view", defaultOn: true },
  { id: "customer", label: "Customer view", defaultOn: true },
  { id: "mind", label: "Keep in mind", defaultOn: true },
  { id: "forms", label: "Buy-in, quotes, car check", defaultOn: true },
  { id: "manufacturer", label: "Manufacturer ingest", defaultOn: false },
] as const;

export type FeatureId = (typeof FEATURES)[number]["id"];

export const INGEST = [
  {
    id: "excel",
    label: "Excel / CSV",
    blurb: "Start here. You drop a list. We load it. Fine for 60 days, and for sites that are happy on a spreadsheet.",
  },
  {
    id: "html",
    label: "HTML drop",
    blurb: "If your current site already publishes stock as a page, we can read that. Same desk, less typing.",
  },
  {
    id: "api",
    label: "Generic stock API",
    blurb: "A feed from the system you already run. Cars move there, they move here.",
  },
  {
    id: "manufacturer",
    label: "Live stock feed",
    blurb:
      "Wired to the manufacturer list. When a car moves — factory, compound, your yard — the customer’s profile updates on its own. They see it. They stop ringing.",
  },
] as const;

export type IngestId = (typeof INGEST)[number]["id"];

export const PROVISION = [
  { id: "brand", n: "01", title: "Your colours", body: "Logo, name, phone, website." },
  { id: "config", n: "02", title: "Your desk", body: "Same portal, your name. On the order you switch what you need." },
  { id: "data", n: "03", title: "Your stock", body: "A private list of cars. Not mixed with anyone else." },
  { id: "ingest", n: "04", title: "How cars come in", body: "Spreadsheet to start. Live feed if you have one — that feed also updates the customer." },
  { id: "ship", n: "05", title: "Go live", body: "Your link. Staff sign in with a code." },
] as const;

export type PlanId = "site" | "franchise" | "group";
export type BillingKind = "trial" | "subscription";

export type Plan = {
  id: PlanId;
  name: string;
  tag: string;
  setupPence: number;
  monthPence: number;
  trialPence: number | null;
  perSite: boolean;
  trial: boolean;
  contractMonths: number | null;
  minSites: number;
  sellNow: boolean;
  body: string;
  why: string;
  includes: string[];
};

export const PLANS: Record<PlanId, Plan> = {
  site: {
    id: "site",
    name: "Site",
    tag: "One dealership",
    setupPence: 450_000,
    monthPence: 39_900,
    trialPence: 150_000,
    perSite: false,
    trial: true,
    contractMonths: null,
    minSites: 1,
    sellNow: true,
    body: "One dealership. Stock, deals, locator, customers. The desk as it already runs on the floor.",
    why: "The 60-day trial lives here and only here. A site takes half a day to stand up. If it does not earn its keep, we have not built a group.",
    includes: [
      "One site, one desk",
      "Sales, management, host, and progressor on the trial",
      "Host, progressor, admin, accounts when you subscribe",
      "Spreadsheet ingest to start",
    ],
  },
  franchise: {
    id: "franchise",
    name: "Franchise",
    tag: "One manufacturer brand",
    setupPence: 650_000,
    monthPence: 49_900,
    trialPence: null,
    perSite: false,
    trial: false,
    contractMonths: 12,
    minSites: 1,
    sellNow: true,
    body: "A franchise dealer. Manufacturer feed, option codes, extra seats. Twelve-month contract.",
    why: "Manufacturer ingest is a real build. Twelve months, billed monthly.",
    includes: [
      "One manufacturer brand",
      "Every site seat: host, progressor, admin, accounts",
      "Manufacturer ingest and locator mapping",
      "Billed monthly on a 12-month contract",
    ],
  },
  group: {
    id: "group",
    name: "Group",
    tag: "Every site, every brand",
    setupPence: 850_000,
    monthPence: 24_900,
    trialPence: null,
    perSite: true,
    trial: false,
    contractMonths: 12,
    minSites: 2,
    sellNow: true,
    body: "A motor group. Every site, every franchise, one picture of the pipeline.",
    why: "A group is a project. The contract starts when we do.",
    includes: [
      "Every site on the contract",
      "Principal roll-up across the group",
      "Seats scoped to site and franchise",
      "£249 per site / month, 12-month contract",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["site", "franchise", "group"];

export function isPlanId(v: unknown): v is PlanId {
  return v === "site" || v === "franchise" || v === "group";
}

export function isBillingKind(v: unknown): v is BillingKind {
  return v === "trial" || v === "subscription";
}

/** Old rows used plan = "pilot". That is now a Site on the 60-day trial. */
export function normalizePlan(v: string | null | undefined): PlanId {
  if (v === "pilot") return "site";
  if (isPlanId(v)) return v;
  return "site";
}

export function normalizeBilling(plan: PlanId, v: string | null | undefined): BillingKind {
  if (v === "trial" && plan === "site") return "trial";
  if (v === "subscription") return "subscription";
  if (v === "pilot" || plan === "site") return "trial";
  return "subscription";
}

export function gbpPence(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(
    pence / 100,
  );
}

export function monthTotalPence(plan: PlanId, siteCount = 1) {
  const p = PLANS[plan];
  const n = Math.max(p.minSites, siteCount);
  return p.perSite ? p.monthPence * n : p.monthPence;
}

export function setupDuePence(plan: PlanId, billing: BillingKind, convertFromTrial = false) {
  const p = PLANS[plan];
  if (billing === "trial") return p.trialPence ?? 0;
  if (convertFromTrial && p.trialPence) return Math.max(0, p.setupPence - p.trialPence);
  return p.setupPence;
}

export function firstChargePence(plan: PlanId, billing: BillingKind, siteCount = 1, convertFromTrial = false) {
  const setup = setupDuePence(plan, billing, convertFromTrial);
  if (billing === "trial") return setup;
  return setup + monthTotalPence(plan, siteCount);
}

export function defaultFeaturesFor(plan: PlanId, billing: BillingKind): Record<FeatureId, boolean> {
  const base = Object.fromEntries(FEATURES.map((f) => [f.id, f.defaultOn])) as Record<FeatureId, boolean>;
  if (plan === "franchise" || plan === "group") base.manufacturer = true;
  if (plan === "site" && billing === "trial") base.manufacturer = false;
  return base;
}

export const defaultFeatures = (): Record<FeatureId, boolean> => defaultFeaturesFor("site", "trial");
