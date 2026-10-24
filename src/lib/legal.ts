import { SITE } from "./site";

/** Who a dealer is contracting with. Update if you incorporate. */
export const LEGAL = {
  trader: "Matthew Girvan",
  tradingAs: "Forecourt",
  who: "Matthew Girvan, trading as Forecourt",
  jurisdiction: "Scotland",
  country: "United Kingdom",
  email: SITE.email,
  url: SITE.url,
  vat:
    "Prices are in pounds sterling. All prices include VAT.",
} as const;

export const LEGAL_LINKS = [
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/dpa", label: "Data" },
  { to: "/trust", label: "Trust" },
] as const;
