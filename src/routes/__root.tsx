import { ConfirmHost } from "@/components/ui/confirm-sheet";
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { AuthCatcher } from "@/components/auth-catcher";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { HOME_SEO } from "@/lib/seo";
import { OG_IMAGE_META, SITE } from "@/lib/site";
import appCss from "../styles.css?url";

const DEFAULT_TITLE = HOME_SEO.title;
const DEFAULT_DESCRIPTION = HOME_SEO.description;
const DEFAULT_OG_DESCRIPTION = HOME_SEO.ogDescription;

const BASE_LINKS = [
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
  { rel: "shortcut icon", href: "/favicon.ico" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/site.webmanifest" },
  { rel: "stylesheet", href: appCss },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" as const },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap",
  },
];

function NotFoundPage() {
  return (
    <SiteShell>
      <section className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6 sm:py-32">
        <p className="text-[13px] font-medium text-muted">404</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Page not found.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted">
          That link does not match a page on Forecourt. Head back to the home page or get in touch.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button className="rounded-full" asChild>
            <Link to="/">Back to Forecourt</Link>
          </Button>
          <Button variant="secondary" className="rounded-full" asChild>
            <Link to="/contact">Contact us</Link>
          </Button>
        </div>
      </section>
    </SiteShell>
  );
}

export const Route = createRootRoute({
  head: ({ match, matches }) => {
    const isNotFoundMatch = (m: unknown) => {
      const x = m as { globalNotFound?: boolean; status?: string; _notFound?: boolean };
      return Boolean(x.globalNotFound || x._notFound || x.status === "notFound");
    };
    const isNotFound = isNotFoundMatch(match) || matches.some(isNotFoundMatch);
    if (isNotFound) {
      return {
        meta: [
          { charSet: "utf-8" },
          { name: "viewport", content: "width=device-width, initial-scale=1" },
          { title: "Page not found | Forecourt" },
          { name: "description", content: "That page could not be found on Forecourt." },
          { name: "robots", content: "noindex, nofollow" },
          { name: "theme-color", content: "#0A0B0A" },
        ],
        links: BASE_LINKS,
      };
    }
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: DEFAULT_TITLE },
        { name: "description", content: DEFAULT_DESCRIPTION },
        { name: "theme-color", content: "#0A0B0A" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-title", content: SITE.name },
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
        { name: "mobile-web-app-capable", content: "yes" },
        { property: "og:title", content: DEFAULT_TITLE },
        { property: "og:url", content: `${SITE.url}/` },
        { property: "og:description", content: DEFAULT_OG_DESCRIPTION },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ...OG_IMAGE_META,
      ],
      links: BASE_LINKS,
    };
  },
  notFoundComponent: NotFoundPage,
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthCatcher />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <ConfirmHost />
        <Scripts />
      </body>
    </html>
  ),
});
