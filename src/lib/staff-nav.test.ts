import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { headerAccountLink, staffAccountRedirect } from "./staff-nav.ts";

test("staff get Office, everyone else keeps Account", () => {
  assert.deepEqual(headerAccountLink(true), { to: "/office", label: "Office" });
  assert.deepEqual(headerAccountLink(false), { to: "/account", label: "Account" });
  assert.deepEqual(headerAccountLink(undefined), { to: "/account", label: "Account" });
});

test("staff with no dealer account are redirected from /account", () => {
  assert.equal(staffAccountRedirect({ team: true, tenantCount: 0 }), true);
  assert.equal(staffAccountRedirect({ team: false, tenantCount: 0 }), false);
  assert.equal(staffAccountRedirect({ team: true, tenantCount: 1 }), false);
  assert.equal(staffAccountRedirect({ team: true, tenantCount: 0, plan: "site" }), false);
  assert.equal(staffAccountRedirect({ team: true, tenantCount: 0, checkout: true }), false);
});

test("header and account use the shared helpers with a replace redirect", () => {
  const header = readFileSync("src/components/site-header.tsx", "utf8");
  assert.match(header, /headerAccountLink\(/);
  const account = readFileSync("src/routes/account.tsx", "utf8");
  assert.match(account, /staffAccountRedirect\(/);
  assert.match(account, /replace: true/);
  assert.doesNotMatch(account, /on the team\./);
});
