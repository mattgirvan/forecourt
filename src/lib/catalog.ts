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
  { id: "brand", n: "01", title: "Brand pack", body: "Logo, hex, trading name, phone, legal, domain — written into tenant.json." },
  { id: "config", n: "02", title: "Clone the desk template", body: "GitHub template forecourt-desk. Never a copy of Aberdeen App.jsx. Never a copy of the sales demo." },
  { id: "data", n: "03", title: "Data plane", body: "New Supabase project. Own rows, own staff. Paste 0001_core.sql. Never share Aberdeen." },
  { id: "ingest", n: "04", title: "Ingest adapter", body: "Excel now (upsert-by-VIN). Manufacturer only if they have credentials, in their project." },
  { id: "ship", n: "05", title: "Ship", body: "Vercel + custom domain + magic-link staff login. Half a day once the template exists." },
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
    tag: "Pay this now",
    body: "One rooftop. Their brand. Locator + GP as the success number. 100% credited against setup if they convert.",
    why: "A free pilot gets ignored. Fifteen hundred pounds is a day of a principal’s attention, not a software licence.",
  },
  site: {
    id: "site",
    name: "Site",
    setupPence: 450_000,
    monthPence: 39_900,
    perSite: false,
    stripeMode: "invoice",
    sellNow: false,
    tag: "After go-live",
    body: "One rooftop. Brand pack. Stock + deals + customer view. Excel / HTML ingest. Monthly starts when the desk is live — not at checkout.",
    why: "£399/mo is still cheap against a DMS. £349 looked like a side project. The setup is the real fee because standing it up is the work.",
  },
  group: {
    id: "group",
    name: "Group",
    setupPence: 850_000,
    monthPence: 24_900,
    perSite: true,
    stripeMode: "invoice",
    sellNow: false,
    tag: "The actual business",
    body: "2–8 sites. Shared pipeline, per-site stock, group Overview. One contract. Franchise pack extra.",
    why: "Independents of 2–8 rooftops are the wedge. Price per site drops; you do not discount the first one to win the fifth.",
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
