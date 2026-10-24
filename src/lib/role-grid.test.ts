import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROLE_ABILITIES, initials, parseStaff, roleSlots } from "./role-grid.ts";
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

test("Roles copy never says Seats, no dashes, switches are 44px", () => {
  for (const f of ["src/components/account/roles-card.tsx", "src/components/office/staff-panel.tsx", "src/routes/login.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, />[^<{]*\bSeats?\b/, f);
    assert.doesNotMatch(src, /[—–·]/, f);
  }
  const css = readFileSync("src/styles.css", "utf8");
  assert.match(css, /\.fc-switch \{[^}]*min-width: 44px/);
});

test("invite card is owner only", () => {
  const src = readFileSync("src/components/office/staff-panel.tsx", "utf8");
  assert.match(src, /\{owner && \(\s*<form/);
});
