import { test } from "node:test";
import assert from "node:assert/strict";
import { accountSitesSummary, parseAccountSites } from "./sites.ts";

test("archived sites do not count", () => {
  const raw = JSON.stringify([{ name: "A", status: "live" }, { name: "B", status: "setting_up" }, { name: "C", status: "archived" }]);
  assert.equal(accountSitesSummary(raw), "2 sites, 1 archived");
});
test("plain names are live", () => {
  assert.equal(accountSitesSummary('["Main"]'), "1 site");
  assert.equal(parseAccountSites('["Main"]')[0].status, "live");
});
test("bad or empty input gives nothing", () => {
  assert.equal(accountSitesSummary("not json"), "");
  assert.equal(accountSitesSummary(null), "");
  assert.equal(accountSitesSummary("[]"), "");
});
