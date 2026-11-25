import { PLANS, gbpPence } from "./catalog.ts";
import { OG_IMAGE_META, SITE } from "./site.ts";

export type PageSeo = {
  title: string;
  description: string;
  /** Path including leading slash, or "/" for homepage. */
  path?: string;
  /** Override og:description when it differs from meta description. */
  ogDescription?: string;
  /** Keep the page out of search results (sign-in and account screens). */
  noindex?: boolean;
};

/** Unique title, description, OG, Twitter, and canonical for a marketing route. */
export function pageHead({ title, description, path = "/", ogDescription, noindex }: PageSeo) {
  const url = path === "/" ? `${SITE.url}/` : `${SITE.url}${path}`;
  const ogDesc = ogDescription ?? description;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: ogDesc },
      { property: "og:url", content: url },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: ogDesc },
      ...OG_IMAGE_META,
      ...(noindex ? [{ name: "robots", content: "noindex, nofollow" }] : []),
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

/** Locked homepage titles and descriptions (Pulse). */
export const HOME_SEO = {
  title: "Car dealer desk beside your CRM | Forecourt",
  description:
    "Car dealer floor desk for UK motor trade, beside your CRM: key locator, photo status, car location, and customer live track.",
  ogDescription:
    "Car dealer floor desk beside your CRM for UK motor trade: key locator, photo status, car location, and customer live track.",
} as const;

/** Homepage JSON-LD: Organization + SoftwareApplication with public /pricing offers. */
export function homeJsonLd() {
  const pricingUrl = `${SITE.url}/pricing`;
  const uk = { "@type": "Country", name: "United Kingdom" };
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE.url}/#organization`,
        name: SITE.name,
        url: `${SITE.url}/`,
        logo: {
          "@type": "ImageObject",
          url: `${SITE.url}/icon-512.png`,
          width: 512,
          height: 512,
        },
        email: SITE.email,
        telephone: SITE.phoneE164,
        areaServed: uk,
        sameAs: [SITE.linkedinHref, SITE.instagramHref],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE.url}/#app`,
        name: SITE.name,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: `${SITE.url}/`,
        areaServed: uk,
        description:
          "Forecourt sits beside your car dealer CRM and keeps the UK motor trade floor moving: smart key locator, car photo status, vehicle location, customer live order tracking, and staff to-dos.",
        provider: { "@id": `${SITE.url}/#organization` },
        offers: [
          {
            "@type": "Offer",
            name: `${PLANS.site.name} 60-day trial`,
            price: String((PLANS.site.trialPence ?? 0) / 100),
            priceCurrency: "GBP",
            url: pricingUrl,
            availability: "https://schema.org/InStock",
            eligibleRegion: uk,
            description: `60-day trial for one dealership (${gbpPence(PLANS.site.trialPence ?? 0)}, credited against ${gbpPence(PLANS.site.setupPence)} setup; then ${gbpPence(PLANS.site.monthPence)} a month, including VAT).`,
          },
          {
            "@type": "Offer",
            name: `${PLANS.site.name} monthly`,
            price: String(PLANS.site.monthPence / 100),
            priceCurrency: "GBP",
            url: pricingUrl,
            availability: "https://schema.org/InStock",
            eligibleRegion: uk,
            description: `${gbpPence(PLANS.site.setupPence)} setup, then ${gbpPence(PLANS.site.monthPence)} a month from go live, month to month, including VAT.`,
          },
          {
            "@type": "Offer",
            name: `${PLANS.franchise.name} monthly`,
            price: String(PLANS.franchise.monthPence / 100),
            priceCurrency: "GBP",
            url: pricingUrl,
            availability: "https://schema.org/InStock",
            eligibleRegion: uk,
            description: `${gbpPence(PLANS.franchise.setupPence)} setup, then ${gbpPence(PLANS.franchise.monthPence)} a month for up to 5 sites on a 12-month contract, including VAT.`,
          },
          {
            "@type": "Offer",
            name: `${PLANS.group.name} per site monthly`,
            price: String(PLANS.group.monthPence / 100),
            priceCurrency: "GBP",
            url: pricingUrl,
            availability: "https://schema.org/InStock",
            eligibleRegion: uk,
            description: `${gbpPence(PLANS.group.setupPence)} setup, then ${gbpPence(PLANS.group.monthPence)} per site a month on a 12-month contract, including VAT.`,
          },
        ],
      },
    ],
  };
}
