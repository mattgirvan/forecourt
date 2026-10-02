/** A desk that is already paid for cannot be bought again. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALREADY_PAID_MESSAGE, PLAN_CHECK_FAILED_MESSAGE, checkoutRefusal, sameDealership } from "./checkout-guard.ts";

const sub = (status: string, extra: Record<string, unknown> = {}) => ({ status, ...extra });

test("a new or unpaid site may check out", () => {
  assert.equal(checkoutRefusal({ tenant: null, billing: "subscription", storedSubscription: null }), null);
  assert.equal(
    checkoutRefusal({ tenant: { id: 1, name: "Northbridge", status: "briefing" }, billing: "subscription", storedSubscription: null }),
    null,
  );
  assert.equal(checkoutRefusal({ tenant: { id: 1, status: null }, billing: "trial", storedSubscription: null }), null);
});

test("a paid, subscribed or live site is refused with a friendly message", () => {
  for (const status of ["subscribed", "paid", "live", "trial"]) {
    assert.equal(
      checkoutRefusal({ tenant: { id: 1, status, billing: "subscription" }, billing: "subscription", storedSubscription: null }),
      ALREADY_PAID_MESSAGE,
      status,
    );
  }
  assert.match(ALREADY_PAID_MESSAGE, /already paid for/);
  assert.match(ALREADY_PAID_MESSAGE, /hello@forecourt\.me/);
});

test("a trial may buy a second trial: no. A trial converting: yes", () => {
  const trial = { id: 1, plan: "site", billing: "trial", status: "trial", stage: "build" };
  assert.equal(checkoutRefusal({ tenant: trial, billing: "trial", storedSubscription: null }), ALREADY_PAID_MESSAGE);
  assert.equal(checkoutRefusal({ tenant: trial, billing: "subscription", storedSubscription: null }), ALREADY_PAID_MESSAGE);
  assert.equal(
    checkoutRefusal({ tenant: trial, billing: "subscription", convertFromTrial: true, storedSubscription: null }),
    null,
  );
  const liveTrial = { ...trial, status: "live", stage: "live" };
  assert.equal(
    checkoutRefusal({ tenant: liveTrial, billing: "subscription", convertFromTrial: true, storedSubscription: null }),
    null,
  );
  // Already converted: billing is now subscription, so the credit path is closed.
  const converted = { ...trial, billing: "subscription", status: "subscribed" };
  assert.equal(
    checkoutRefusal({ tenant: converted, billing: "subscription", convertFromTrial: true, storedSubscription: null }),
    ALREADY_PAID_MESSAGE,
  );
});

test("cancelled or refunded sites may buy again only once the old subscription is over", () => {
  for (const status of ["cancelled", "refunded"]) {
    const t = { id: 1, status, stripe_subscription_id: "sub_old" };
    assert.equal(checkoutRefusal({ tenant: t, billing: "subscription", storedSubscription: sub("canceled") }), null);
    assert.equal(checkoutRefusal({ tenant: t, billing: "subscription", storedSubscription: "missing" }), null);
    assert.equal(
      checkoutRefusal({ tenant: t, billing: "subscription", storedSubscription: sub("trialing", { cancel_at_period_end: true }) }),
      ALREADY_PAID_MESSAGE,
    );
    assert.equal(checkoutRefusal({ tenant: t, billing: "subscription", storedSubscription: sub("active") }), ALREADY_PAID_MESSAGE);
    assert.equal(checkoutRefusal({ tenant: t, billing: "subscription", storedSubscription: "unknown" }), PLAN_CHECK_FAILED_MESSAGE);
  }
  // Cancelled with no subscription on file (a cancelled 60-day trial).
  assert.equal(checkoutRefusal({ tenant: { id: 1, status: "cancelled" }, billing: "subscription", storedSubscription: null }), null);
});

test("the same dealership name already paid for by this user is refused", () => {
  const fresh = { id: 2, name: "Northbridge Motors", status: "briefing" };
  const others = [
    { id: 1, name: "northbridge  motors", status: "subscribed" },
    { id: 3, name: "Harbour Park", status: "live" },
  ];
  assert.equal(
    checkoutRefusal({ tenant: fresh, billing: "subscription", storedSubscription: null, otherTenants: others }),
    ALREADY_PAID_MESSAGE,
  );
  // A different dealership, or the same name only in a cancelled file, is fine.
  assert.equal(
    checkoutRefusal({ tenant: { ...fresh, name: "Kelvin Cars" }, billing: "subscription", storedSubscription: null, otherTenants: others }),
    null,
  );
  assert.equal(
    checkoutRefusal({
      tenant: fresh,
      billing: "subscription",
      storedSubscription: null,
      otherTenants: [{ id: 1, name: "Northbridge Motors", status: "cancelled" }],
    }),
    null,
  );
  // The tenant itself in the list is not counted twice.
  assert.equal(
    checkoutRefusal({ tenant: fresh, billing: "subscription", storedSubscription: null, otherTenants: [fresh] }),
    null,
  );
  assert.equal(sameDealership("Northbridge Motors Ltd.", "northbridge motors ltd"), true);
  assert.equal(sameDealership("", ""), false);
});
