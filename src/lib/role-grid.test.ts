import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROLE_ABILITIES, canDo, initials, parseStaff, roleAccessNotReady, roleSlots, sanitizeAccess, toggleAccess } from "./role-grid.ts";
import { ROLES } from "./roles.ts";

const role = (id: string) => ROLES.find((r) => r.id === id)!;

test("roles filled count", () => {
  const seats = [{ id: "sales" }, { id: "sales" }, { id: "management" }, { id: "host" }];
  const r = roleSlots(seats, [
    { name: "Sophie Reid", role: "management" },
    { name: "Lewis Brown", role: "sales" },
    { name: "", email: "", role: "host" },
  ]);
  assert.equal(r.label, "2 of 4 roles filled");
  assert.equal(r.slots.filter((s) => !s.person).length, 2);
});

test("abilities come from ROLES", () => {
  const gp = ROLE_ABILITIES.find((a) => a.id === "gp")!;
  assert.equal(gp.has(role("management")), true);
  assert.equal(gp.has(role("sales")), false);
  assert.equal(ROLE_ABILITIES.find((a) => a.id === "deals")!.has(role("progressor")), false);
});

test("helpers", () => {
  assert.equal(initials("Tom Okafor"), "TO");
  assert.deepEqual(parseStaff("nope"), []);
});

test("Roles copy never says Seats, no dashes", () => {
  for (const f of ["src/components/account/roles-card.tsx", "src/components/office/staff-panel.tsx", "src/routes/login.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, />[^<{]*\bSeats?\b/, f);
    assert.doesNotMatch(src, /[—–·]/, f);
  }
  const roles = readFileSync("src/lib/roles.ts", "utf8");
  assert.match(roles, /label: "Progressor or driver"/);
});

test("invite card is owner only", () => {
  const src = readFileSync("src/components/office/staff-panel.tsx", "utf8");
  assert.match(src, /\{owner && \(\s*<form/);
});

test("overrides beat defaults, unknown keys dropped", () => {
  const sales = role("sales");
  assert.equal(canDo(sales, "gp", null), false);
  assert.equal(canDo(sales, "gp", { sales: { gp: true } }), true);
  assert.deepEqual(sanitizeAccess({ sales: { gp: true, hack: true, stock: "yes" }, nobody: { gp: true } }), { sales: { gp: true } });
  assert.equal(sanitizeAccess([1]), null);
});

test("toggle stores only changes from the default", () => {
  const sales = role("sales");
  const on = toggleAccess(null, sales, "gp", true);
  assert.deepEqual(on, { sales: { gp: true } });
  assert.equal(toggleAccess(on, sales, "gp", false), null);
});

test("missing column or function falls back to defaults", () => {
  assert.equal(roleAccessNotReady({ code: "42703", message: "column tenants.role_access does not exist" }), true);
  assert.equal(roleAccessNotReady({ code: "PGRST202", message: "Could not find the function public.set_role_access" }), true);
  assert.equal(roleAccessNotReady({ code: "42501", message: "Only the account owner" }), false);
});

test("switches save on change, owner only, Saved hint, no Save button", () => {
  const card = readFileSync("src/components/account/roles-card.tsx", "utf8");
  assert.match(card, /role="switch"/);
  assert.match(card, /disabled=\{!canEdit\}/);
  assert.match(card, /saveRoleAccess\(/);
  assert.match(card, /"Saved"/);
  assert.doesNotMatch(card, />\s*Save\s*</);
  const srv = readFileSync("src/lib/server/role-access.ts", "utf8");
  assert.match(srv, /roleAccessNotReady\(error\)\) return \{ ready: false, canEdit: false/);
  assert.match(srv, /canEdit: t\.user_id === who\.userId/);
});

test("SQL is single paste, idempotent, owner checked, one nullable column", () => {
  const sql = readFileSync("supabase/role-access.sql", "utf8");
  assert.match(sql, /add column if not exists role_access jsonb;/);
  assert.match(sql, /create or replace function public\.set_role_access/);
  assert.match(sql, /t\.user_id = auth\.uid\(\)/);
  assert.match(sql, /security definer/);
  assert.equal((sql.match(/alter table/g) ?? []).length, 1);
  assert.doesNotMatch(sql, /create table|drop table|alter policy|create policy/i);
});

test("styles.css braces balance (merge guard)", () => {
  const css = readFileSync("src/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal((css.match(/\{/g) ?? []).length, (css.match(/\}/g) ?? []).length);
});

test("phone grid: sticky permission column and right edge fade", () => {
  const css = readFileSync("src/styles.css", "utf8");
  assert.match(css, /\.fc-role-grid tbody th \{\s*position: sticky;\s*left: 0;/);
  assert.match(css, /\.fc-role-grid-frame\[data-more\]::after \{\s*opacity: 1;/);
});

test("homepage tabs: no See it working link, mobile tabs fit and are 44px", () => {
  const files = ["src/routes/index.tsx", "src/components/site-footer.tsx", "src/components/site-header.tsx", "src/components/home-crm-comparison.tsx", "src/routes/how.tsx", "src/components/for/phrase-page.tsx"];
  for (const f of files) assert.doesNotMatch(readFileSync(f, "utf8"), /See it working/);
  const header = readFileSync("src/components/site-header.tsx", "utf8");
  assert.match(header, /flex-auto px-2/);
  assert.doesNotMatch(header, /overflow-x-auto/);
  assert.match(header, /min-h-11/);
  const phrase = readFileSync("src/components/for/phrase-page.tsx", "utf8");
  assert.match(phrase, /href=\{BOOKING_URL\}/);
  assert.doesNotMatch(phrase, /SITE\.url\}\/`\}>/);
  for (const f of ["photo-status", "key-locator", "beside-crm"]) {
    const page = readFileSync(`src/routes/for/${f}.tsx`, "utf8");
    assert.match(page, /ctaLabel="Book a call"/);
    assert.doesNotMatch(page, /Visit forecourt\.me/);
  }
});
