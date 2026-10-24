import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { headerAccountLink, officeProfileMenu, planFromParam, staffAccountRedirect } from "./staff-nav.ts";

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

test("any plan param on /account counts as a plan, so staff skip the redirect", () => {
  const isPlan = (v: unknown): v is "site" | "group" | "franchise" => v === "site" || v === "group" || v === "franchise";
  assert.equal(planFromParam(undefined, isPlan, "site"), undefined);
  assert.equal(planFromParam("group", isPlan, "site"), "group");
  assert.equal(planFromParam("foo", isPlan, "site"), "site");
  assert.equal(planFromParam("", isPlan, "site"), "site");
  for (const raw of ["site", "group", "franchise", "foo", ""]) {
    assert.equal(staffAccountRedirect({ team: true, tenantCount: 0, plan: planFromParam(raw, isPlan, "site") }), false);
  }
  assert.match(readFileSync("src/routes/account.tsx", "utf8"), /plan: planFromParam\(raw\.plan, isPlanId, "site"\)/);
});

test("staff do not get Your account in the profile menu, everyone else does", () => {
  assert.deepEqual(officeProfileMenu(true).map((m) => m.label), ["Sign in and security"]);
  assert.deepEqual(officeProfileMenu(false).map((m) => m.label), ["Sign in and security", "Your account"]);
  assert.deepEqual(officeProfileMenu(undefined).map((m) => m.label), ["Sign in and security", "Your account"]);
  const office = readFileSync("src/routes/office.tsx", "utf8");
  assert.match(office, /menu=\{officeProfileMenu\(me\.team\)\}/);
  assert.doesNotMatch(office, /label: "Your account"/);
  assert.match(readFileSync("src/components/app-shell.tsx", "utf8"), /label: "Sign out"/);
});
