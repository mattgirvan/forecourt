import { test } from "node:test";
import assert from "node:assert/strict";
import { siteControl, rowSiteTag, siteShortName, resolveSiteAccess, ALL } from "../desk-template/src/data/sites.js";

const sites = [
  { code: "HMS", name: "Hartley Motors Showroom" },
  { code: "HMU", name: "Hartley Motors Used" },
  { code: "NBV", name: "Northbridge Vans", status: "setting_up" },
  { code: "OLD", name: "Hartley Old Yard", status: "archived" },
];
const full = resolveSiteAccess({ role: "management", allSites: true }, sites, null);
const limited = resolveSiteAccess({ role: "management", sites: ["HMU", "NBV"] }, sites, null);
const staff = resolveSiteAccess({ role: "sales", site: "HMS" }, sites, null);
const multi = resolveSiteAccess({ role: "progressor", sites: ["HMS", "HMU"] }, sites, null);

test("full managers keep All sites and the existing footer", () => {
  const c = siteControl(full, ALL);
  assert.equal(c.text, "All sites");
  assert.equal(c.allLabel, "All sites");
  assert.equal(c.foot, "All sites is for managers and admins.");
});
test("limited managers see All my sites and their own footer", () => {
  const c = siteControl(limited, ALL);
  assert.equal(c.text, "All my sites");
  assert.equal(c.foot, "Showing the sites you look after.");
  assert.equal(c.count, 2);
});
test("short names in All sites, hidden for one site", () => {
  assert.equal(siteShortName(sites, "HMS"), "Showroom");
  assert.equal(siteShortName(sites, "HMU"), "Used");
  assert.equal(siteShortName(sites, "NBV"), "Vans");
  assert.equal(siteShortName([{ code: "X", name: "Big Place", short: "Big" }], "X"), "Big");
  assert.equal(rowSiteTag(full, ALL, "HMU"), "Used");
  assert.equal(rowSiteTag(full, "HMU", "HMU"), null);
  assert.equal(rowSiteTag(staff, ALL, "HMS"), null);
  assert.equal(rowSiteTag(multi, ALL, "HMU"), "Used");
});
