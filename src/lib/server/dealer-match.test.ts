/** Name and email normalising for the look-alike dealership flag. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { dealerNameKey, emailKey, similarPaidTenants } from "./dealer-match.ts";

test("names normalise case, punctuation, Ltd/Limited, St/St./Street, & and whitespace", () => {
  const same = [
    ["Northbridge Motors Ltd", "northbridge motors"],
    ["Northbridge Motors Limited", "NORTHBRIDGE   MOTORS ltd."],
    ["St. John's Garage", "St Johns Garage"],
    ["Station Street Cars", "Station St. Cars"],
    ["Smith & Sons", "smith and sons"],
    ["northbridge-motors", "Northbridge Motors"],
  ];
  for (const [a, b] of same) assert.equal(dealerNameKey(a), dealerNameKey(b), `${a} vs ${b}`);
  assert.notEqual(dealerNameKey("Northbridge Motors"), dealerNameKey("Northbridge Cars"));
  assert.equal(dealerNameKey("Ltd"), "");
  assert.equal(emailKey("  Sales@Example.COM "), "sales@example.com");
});

test("only paid, running tenants count, and an empty name never matches", () => {
  const others = [
    { id: 1, name: "", status: "live" },
    { id: 2, name: "Kelvin Cars", status: "refunded" },
    { id: 3, name: "Kelvin Cars", status: "trial" },
  ];
  assert.deepEqual(similarPaidTenants({ id: 9, name: "" }, others), []);
  assert.deepEqual(similarPaidTenants({ id: 9, name: "kelvin cars ltd" }, others).map((m) => m.tenantId), [3]);
  assert.deepEqual(similarPaidTenants({ id: 3, name: "Kelvin Cars" }, others), []);
});
