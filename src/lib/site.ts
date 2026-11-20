export const SITE = {
  name: "Forecourt",
  publicName: "Forecourt.me",
  domain: "forecourt.me",
  url: "https://www.forecourt.me",
  email: "hello@forecourt.me",
  /** Displayed on the marketing site. */
  phone: "01224 079589",
  /** E.164, used in tel: links and JSON-LD. */
  phoneE164: "+441224079589",
  /**
   * Forecourt WhatsApp Business. Marketing-site chat button only.
   * Href is the exact wa.me URL, including the prefilled message encoding.
   */
  whatsappHref: "https://wa.me/447356040212?text=Hi%2C%20I%27m%20interested%20in%20Forecourt",
} as const;

/**
 * Link-preview (Open Graph) card. A dated filename so iMessage, WhatsApp and
 * LinkedIn fetch it fresh instead of reusing a cached /og.jpg. Keep this in
 * step with "image" and "imageAlt" in src/lib/og/site.json, which is what the
 * platform head injector actually serves on the live site.
 */
export const OG_IMAGE = {
  url: `${SITE.url}/og-2026-10.jpg`,
  width: "1200",
  height: "630",
  alt: "Forecourt.me: the screen on the sales desk, beside your CRM",
} as const;

/** og:image + size + alt, and the matching twitter:image tags. */
export const OG_IMAGE_META = [
  { property: "og:image", content: OG_IMAGE.url },
  { property: "og:image:width", content: OG_IMAGE.width },
  { property: "og:image:height", content: OG_IMAGE.height },
  { property: "og:image:alt", content: OG_IMAGE.alt },
  { name: "twitter:image", content: OG_IMAGE.url },
  { name: "twitter:image:alt", content: OG_IMAGE.alt },
];
