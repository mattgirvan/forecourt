import assert from "node:assert/strict";
import test from "node:test";
import { PLANS } from "./catalog.ts";
import { HOME_SEO, homeJsonLd, pageHead } from "./seo.ts";
import { SITE } from "./site.ts";

test("HOME_SEO lengths stay within search snippet budgets", () => {
  assert.ok(HOME_SEO.title.length <= 60, `title too long: ${HOME_SEO.title.length}`);
  assert.ok(HOME_SEO.description.length <= 155, `description too long: ${HOME_SEO.description.length}`);
  assert.ok(HOME_SEO.ogDescription.length <= 155, `ogDescription too long: ${HOME_SEO.ogDescription.length}`);
});

test("homepage canonical and og:url include trailing slash matching sitemap", () => {
  const head = pageHead({
    title: HOME_SEO.title,
    description: HOME_SEO.description,
    path: "/",
    ogDescription: HOME_SEO.ogDescription,
  });
  assert.deepEqual(head.links, [{ rel: "canonical", href: `${SITE.url}/` }]);
  const ogUrl = head.meta.find((m) => "property" in m && m.property === "og:url");
  assert.equal(ogUrl && "content" in ogUrl ? ogUrl.content : "", `${SITE.url}/`);
});

test("homeJsonLd includes logo, UK areaServed, sameAs, and pricing offers without reviews", () => {
  const ld = homeJsonLd();
  const [org, app] = ld["@graph"];
  assert.equal(org["@type"], "Organization");
  assert.ok(org.logo);
  assert.equal(org.logo.url, `${SITE.url}/icon-512.png`);
  assert.equal(org.areaServed.name, "United Kingdom");
  assert.deepEqual(org.sameAs, [SITE.linkedinHref, SITE.instagramHref]);

  assert.equal(app["@type"], "SoftwareApplication");
  assert.equal(app.areaServed.name, "United Kingdom");
  assert.equal("aggregateRating" in app, false);
  assert.equal("review" in app, false);
  assert.ok(app.offers);
  assert.equal(app.offers.length, 4);
  assert.equal(app.offers[0].price, String((PLANS.site.trialPence ?? 0) / 100));
  assert.equal(app.offers[1].price, String(PLANS.site.monthPence / 100));
  assert.equal(app.offers[2].price, String(PLANS.franchise.monthPence / 100));
  assert.equal(app.offers[3].price, String(PLANS.group.monthPence / 100));
});
