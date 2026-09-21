import { SITE } from "./site";

export type PageSeo = {
  title: string;
  description: string;
  /** Path including leading slash, or "/" for homepage. */
  path?: string;
  /** Override og:description when it differs from meta description. */
  ogDescription?: string;
};

/** Unique title, description, OG, Twitter, and canonical for a marketing route. */
export function pageHead({ title, description, path = "/", ogDescription }: PageSeo) {
  const url = path === "/" ? SITE.url : `${SITE.url}${path}`;
  const ogDesc = ogDescription ?? description;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: ogDesc },
      { property: "og:url", content: url },
      { property: "og:type", content: "website" },
      { property: "og:image", content: `${SITE.url}/og.jpg` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: ogDesc },
      { name: "twitter:image", content: `${SITE.url}/og.jpg` },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

/** Locked homepage titles and descriptions (Pulse). */
export const HOME_SEO = {
  title: "Dealership floor OS beside your CRM | Forecourt",
  description:
    "Your CRM keeps the book. Forecourt keeps the floor moving: keys, photo status, where the car is, and customer live track. Beside your CRM, not instead of it.",
  ogDescription:
    "Beside your CRM, not instead of it. Keys, photo status, car location, and customer live track on the sales desk.",
} as const;

/** Homepage JSON-LD: Organization + SoftwareApplication. */
export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE.url}/#organization`,
        name: SITE.name,
        url: SITE.url,
        email: SITE.email,
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE.url}/#app`,
        name: SITE.name,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: SITE.url,
        description:
          "Forecourt sits beside your dealer CRM and keeps the floor moving: universal smart key locator, car photo status, where the car is, customer live order tracking, and staff to-dos for UK motor trade desks.",
        provider: { "@id": `${SITE.url}/#organization` },
      },
    ],
  };
}
