export const FEATURES = [
  { id: "overview", label: "Overview + GP", defaultOn: true },
  { id: "stock", label: "Stock", defaultOn: true },
  { id: "locator", label: "Locator", defaultOn: true },
  { id: "pipeline", label: "Pipeline", defaultOn: true },
  { id: "customer", label: "Customer view", defaultOn: true },
  { id: "mind", label: "Keep in mind", defaultOn: true },
  { id: "manufacturer", label: "Manufacturer ingest", defaultOn: false },
] as const;

export type FeatureId = (typeof FEATURES)[number]["id"];

export const INGEST = [
  { id: "excel", label: "Excel / CSV" },
  { id: "html", label: "HTML drop" },
  { id: "api", label: "Generic stock API" },
  { id: "manufacturer", label: "Manufacturer feed" },
] as const;

export type IngestId = (typeof INGEST)[number]["id"];

export const PROVISION = [
  { id: "brand", n: "01", title: "Your colours", body: "Logo, name, phone, website." },
  { id: "config", n: "02", title: "Your desk", body: "A copy of the portal, with your name on it." },
  { id: "data", n: "03", title: "Your stock", body: "A private list of cars. Not mixed with anyone else." },
  { id: "ingest", n: "04", title: "How cars come in", body: "A spreadsheet to start. Factory feed if you have one." },
  { id: "ship", n: "05", title: "Go live", body: "Your link. Staff sign in with a code." },
] as const;

export type PlanId = "pilot" | "site" | "group";

export const PLANS: Record<
  PlanId,
  {
    id: PlanId;
    name: string;
    setupPence: number;
    monthPence: number | null;
    perSite: boolean;
    stripeMode: "payment" | "invoice";
    sellNow: boolean;
    tag: string;
    body: string;
    why: string;
  }
> = {
  pilot: {
    id: "pilot",
    name: "60-day rooftop pilot",
    setupPence: 150_000,
    monthPence: null,
    perSite: false,
    stripeMode: "payment",
    sellNow: true,
    tag: "Start here",
    body: "One rooftop. Your colours. Comes off the setup if you stay.",
    why: "",
  },
  site: {
    id: "site",
    name: "One site",
    setupPence: 450_000,
    monthPence: 39_900,
    perSite: false,
    stripeMode: "invoice",
    sellNow: false,
    tag: "When you’re live",
    body: "Stock, deals, locator, customers. One dealership.",
    why: "",
  },
  group: {
    id: "group",
    name: "Group",
    setupPence: 850_000,
    monthPence: 24_900,
    perSite: true,
    stripeMode: "invoice",
    sellNow: false,
    tag: "A few rooftops",
    body: "Several sites. One picture of the pipeline.",
    why: "",
  },
};

export const FRANCHISE_PACK = {
  setupPence: 150_000,
  monthPence: 9_900,
  body: "Manufacturer ingest, locator mapping, option codes. Priced per franchise, only if they have credentials.",
};

export function gbpPence(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(
    pence / 100,
  );
}

export const defaultFeatures = (): Record<FeatureId, boolean> =>
  Object.fromEntries(FEATURES.map((f) => [f.id, f.defaultOn])) as Record<FeatureId, boolean>;
