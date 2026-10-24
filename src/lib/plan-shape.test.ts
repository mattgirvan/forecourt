import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLAN_SHAPE, SHAPE_GAPS, brandLabel, clampSiteCount, multiBrand, shapeGaps } from "./plan-shape.ts";

test("Site one brand one site, Franchise one brand many sites, Group many of both", () => {
  assert.deepEqual([PLAN_SHAPE.site.brands, PLAN_SHAPE.site.sites], ["one", "one"]);
  assert.deepEqual([PLAN_SHAPE.franchise.brands, PLAN_SHAPE.franchise.sites], ["one", "many"]);
  assert.deepEqual([PLAN_SHAPE.group.brands, PLAN_SHAPE.group.sites], ["many", "many"]);
  assert.equal(brandLabel("site"), "Brand");
  assert.equal(brandLabel("franchise"), "Brand");
  assert.equal(brandLabel("group"), "Brands");
  assert.equal(multiBrand("site"), false);
  assert.equal(multiBrand("group"), true);
});

test("site count is clamped to the plan", () => {
  assert.equal(clampSiteCount("site", 4), 1);
  assert.equal(clampSiteCount("site", 0), 1);
  assert.equal(clampSiteCount("franchise", 7), 7);
  assert.equal(clampSiteCount("group", 1), 2);
  assert.equal(clampSiteCount("group", null), 2);
});

test("shape gaps", () => {
  assert.deepEqual(shapeGaps("site", ["Main"], ["independent"]), []);
  assert.deepEqual(shapeGaps("site", ["North", "South"], ["vw"]), [SHAPE_GAPS.siteOneSite]);
  assert.deepEqual(shapeGaps("site", ["Main"], ["vw", "audi"]), [SHAPE_GAPS.siteOneBrand]);
  assert.deepEqual(shapeGaps("franchise", ["A", "B", "C"], ["vw"]), []);
  assert.deepEqual(shapeGaps("franchise", ["A"], ["vw", "audi"]), [SHAPE_GAPS.franchiseOneBrand]);
  assert.deepEqual(shapeGaps("group", ["A", "B"], ["vw"]), [SHAPE_GAPS.groupBrands]);
  assert.deepEqual(shapeGaps("group", ["A", "B"], ["vw", "audi"]), []);
});

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("Office pack picker reads the plan shape, not a fixed Franchise label", () => {
  const desk = src("src/components/build/order-desk.tsx");
  assert.match(desk, /brandLabel\(plan\)/);
  assert.match(desk, /pickBrand\(pack, b\.id, plan\)/);
  assert.doesNotMatch(desk, /<div className="text-sm">Franchise<\/div>/);
  assert.doesNotMatch(desk, /Add a seat/);
  assert.match(desk, /"Site name"/);
  assert.match(desk, /Separate sites with a comma\./);
  assert.doesNotMatch(desk, /Sites \(comma\)|Site \(one on Site\)/);
});

test("pack gaps, checkout and plan changes use the shape", () => {
  assert.match(src("src/lib/build.ts"), /shapeGaps\(plan, sites, brandsOf\(pack\)\)/);
  assert.match(src("src/lib/server/commerce.ts"), /clampSiteCount\(plan, /);
  assert.match(src("src/lib/server/plan-change-server.ts"), /site_count: clampSiteCount\(q\.to/);
  for (const f of ["src/lib/build.ts", "src/lib/roles.ts", "src/lib/server/build-api.ts"]) assert.doesNotMatch(src(f), /staff seat|role is the seat|existing seat/);
});

test("Office pack hint is live and specific", () => {
  const src = readFileSync(new URL("./build.ts", import.meta.url), "utf8");
  for (const s of ["Add a web address before we can build.", "Add at least one person to the desk before we can build.", "We'll unlock this once the build token is set."]) assert.ok(src.includes(s), s);
});

test("pack form shows one unlock hint: the live one, not the generic line (Atlas QA)", () => {
  const build = readFileSync("src/lib/build.ts", "utf8");
  const desk = readFileSync("src/components/build/order-desk.tsx", "utf8");
  assert.doesNotMatch(build + desk, /when the pack has everything needed to build your desk/);
  assert.match(desk, /packHint\(pack/);
});
