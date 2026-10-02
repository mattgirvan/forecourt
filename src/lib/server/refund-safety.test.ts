/** Refund and duplicate safety (Atlas round 5 follow-ups). One block per item. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { dealerNameKey, similarPaidTenants } from "./dealer-match.ts";
import { OPEN_SESSION_MAX, OPEN_SESSION_WINDOW_HOURS, recentPendingCutoff } from "./checkout-sessions.ts";
import {
  FLAG_TITLES,
  applyPaidOrder,
  boardFlags,
  duplicateNote,
  paidOrderConflict,
  supabasePaymentStore,
  type OrderRow,
  type PaymentStore,
  type StaffFlag,
  type SupabaseLike,
  type TenantRow,
} from "./payments.ts";
import { findSetupPayment, refundConfirmText, sessionIsSitesOwn, type SessionLike } from "./refund-target.ts";
import { balanceOwed, sessionIsSitesOwn as resumeRule, sessionsThatCount } from "./resume-order.ts";

const gbp = (p: number) => `£${(p / 100).toLocaleString("en-GB")}`;
const quiet = { error: () => {}, warn: () => {} };

const sub = (id: string, over: Partial<SessionLike> = {}): SessionLike => ({
  id,
  mode: "subscription",
  payment_status: "paid",
  invoice: `in_${id}`,
  subscription: `sub_${id}`,
  amount_total: 450_000,
  metadata: { kind: "subscription", monthly_from: "go_live" },
  ...over,
});
const invoicePaid = async (invoice: string) => [{ status: "paid", amount_paid: 450_000, payment: { payment_intent: `pi_${invoice.slice(3)}` } }];

// 1. Office Refund ignores a duplicate's payment, and Resume uses the same rule.

test("1. Office Refund skips the duplicate (newest) payment and refunds the site's own setup", async () => {
  const sessions = [sub("dup", { subscription: "sub_2" }), sub("own", { subscription: "sub_1" })];
  const target = await findSetupPayment({
    sessions,
    subscriptionId: "sub_1",
    storedSubscriptionId: "sub_1",
    listInvoices: async () => [],
    listInvoicePayments: invoicePaid,
  });
  assert.equal(target?.sessionId, "own");
  assert.equal(target?.paymentIntent, "pi_own");
});

test("1. if only a duplicate is paid, Office Refund finds nothing rather than the duplicate", async () => {
  const target = await findSetupPayment({
    sessions: [sub("dup", { subscription: "sub_2" })],
    storedSubscriptionId: "sub_1",
    listInvoices: async () => [],
    listInvoicePayments: invoicePaid,
  });
  assert.equal(target, null);
});

test("1. a duplicate trial fee is never the one refunded: the site's first trial payment is", async () => {
  const trial = (id: string): SessionLike => ({ id, mode: "payment", payment_status: "paid", payment_intent: `pi_${id}`, amount_total: 150_000, metadata: { kind: "trial" } });
  const target = await findSetupPayment({ sessions: [trial("t2"), trial("t1")], listInvoices: async () => [], listInvoicePayments: invoicePaid });
  assert.equal(target?.sessionId, "t1");
});

test("1. the duplicate note says not to use Office Refund, and Resume shares the rule", () => {
  const note = duplicateNote({ orderId: 9, sessionId: "cs_2", incoming: "sub_2", others: [7], kept: "sub_1", trial: false });
  assert.match(note, /Don't use Office Refund for this/);
  assert.match(note, /Refund the duplicate setup and cancel sub_2 in Stripe\./);
  assert.equal(resumeRule, sessionIsSitesOwn);
  const sessions = [
    { id: "dup", mode: "subscription", payment_status: "paid", subscription: "sub_2", amount_total: 450_000, created: 2 },
    { id: "own", mode: "subscription", payment_status: "paid", subscription: "sub_1", amount_total: 450_000, created: 1 },
  ];
  const { counted } = sessionsThatCount(sessions, "sub_1");
  const b = balanceOwed({
    counted,
    facts: { own: { paidPence: 450_000, refundedPence: 0, refunds: [] }, dup: { paidPence: 450_000, refundedPence: 450_000, refunds: [] } },
  });
  assert.equal(b.owedPence, 0, "the duplicate's refund is not a balance on the real site");
});

// 2. Race: only one webhook may write the subscription.

function raceStore() {
  const tenant: TenantRow & { stripe_subscription_id: string | null } = { user_id: "u", status: "briefing", trial_ends_at: null, stripe_subscription_id: null };
  const updates: unknown[] = [];
  const flags: StaffFlag[] = [];
  const store: PaymentStore = {
    loadOrder: async () => null,
    loadTenant: async () => ({ ...tenant }),
    updateTenant: async (_id, patch) => {
      updates.push(patch);
    },
    markOrderPaid: async () => {},
    cancelBySubscription: async () => {},
    claimSubscription: async (_id, expected, incoming) => {
      // Compare-and-set, like `update ... where stripe_subscription_id is null`.
      if (tenant.stripe_subscription_id !== expected) return false;
      tenant.stripe_subscription_id = incoming;
      return true;
    },
    otherPaidOrderIds: async () => [],
    listTenantsForMatch: async () => [],
    flagForStaff: async (f) => void flags.push(f),
    seedPaid: async () => {},
  };
  return { store, tenant, updates, flags };
}

const order = (id: number): OrderRow => ({ id, user_id: "u", tenant_id: 3, plan: "site", amount_pence: 450_000, status: "pending", kind: "subscription" });
const paidSession = (id: number, subscription: string) => ({ id: `cs_${id}`, status: "complete", payment_status: "paid", amount_total: 450_000, currency: "gbp", subscription, metadata: { order_id: String(id) } });

test("2. two webhooks at once: the first subscription is kept, the second is flagged, the tenant is written once", async () => {
  const r = raceStore();
  const [a, b] = await Promise.all([
    applyPaidOrder(r.store, order(1), paidSession(1, "sub_1"), "stripe", quiet),
    applyPaidOrder(r.store, order(2), paidSession(2, "sub_2"), "stripe", quiet),
  ]);
  assert.equal(r.tenant.stripe_subscription_id, "sub_1");
  assert.equal(r.updates.length, 1);
  assert.deepEqual([a.applied, b.applied], ["tenant_updated", "order_only"]);
  assert.equal(r.flags.length, 1);
  assert.match(r.flags[0]!.body, /already has subscription sub_1\. The site was not changed\. It keeps subscription sub_1\. Refund the duplicate setup and cancel sub_2 in Stripe\./);
});

test("2. a different live subscription is a conflict even before the first order is marked paid", () => {
  assert.deepEqual(
    paidOrderConflict({ status: "subscribed", stripe_subscription_id: "sub_1" }, { kind: "subscription" }, "sub_2", []),
    { reason: "active_subscription" },
  );
  // A cancelled site may rebuy, and a retry of the same subscription is fine.
  assert.equal(paidOrderConflict({ status: "cancelled", stripe_subscription_id: "sub_1" }, { kind: "subscription" }, "sub_2", []), null);
  assert.equal(paidOrderConflict({ status: "subscribed", stripe_subscription_id: "sub_1" }, { kind: "subscription" }, "sub_1", []), null);
});

test("2. the Supabase store writes the subscription with a guarded update and checks the row count", async () => {
  const seen: string[] = [];
  let rows: unknown[] = [{ id: 3 }];
  const chain = {
    eq(col: string, v: unknown) {
      seen.push(`eq ${col}=${v}`);
      return chain;
    },
    is(col: string, v: unknown) {
      seen.push(`is ${col}=${v}`);
      return chain;
    },
    select() {
      return Promise.resolve({ data: rows, error: null });
    },
  };
  const sb = { from: () => ({ update: (patch: Record<string, unknown>) => (seen.push(`update ${JSON.stringify(patch)}`), chain) }) } as unknown as SupabaseLike;
  const store = supabasePaymentStore(sb, async () => {});
  assert.equal(await store.claimSubscription!(3, null, "sub_1"), true);
  assert.deepEqual(seen, ['update {"stripe_subscription_id":"sub_1"}', "eq id=3", "is stripe_subscription_id=null"]);
  rows = [];
  seen.length = 0;
  assert.equal(await store.claimSubscription!(3, "sub_old", "sub_2"), false);
  assert.ok(seen.includes("eq stripe_subscription_id=sub_old"));
});

// 3. Expiry only looks at recent pending orders.

test("3. only pending orders from the last 25 hours are checked for open sessions", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  assert.equal(recentPendingCutoff(now), "2026-10-01T11:00:00.000Z");
  assert.equal(OPEN_SESSION_WINDOW_HOURS, 25);
  assert.ok(OPEN_SESSION_MAX > 0 && OPEN_SESSION_MAX <= 10);
});

// 4. A converted trial that cancels and resubscribes gets plain setup wording.

test("4. resubscribing at £4,899 after a converted trial is the setup and the first month, no trial line", async () => {
  const sessions: SessionLike[] = [
    sub("resub", { subscription: "sub_3", amount_total: 489_900, metadata: { kind: "subscription", monthly_from: "checkout" } }),
    sub("conv", { subscription: "sub_2", amount_total: 339_900, metadata: { kind: "convert", monthly_from: "checkout" } }),
    { id: "trial", mode: "payment", payment_status: "paid", payment_intent: "pi_trial", amount_total: 150_000, metadata: { kind: "trial" } },
  ];
  const target = await findSetupPayment({
    sessions,
    storedSubscriptionId: "sub_3",
    listInvoices: async () => [],
    listInvoicePayments: async () => [{ status: "paid", amount_paid: 489_900, payment: { payment_intent: "pi_resub" } }],
  });
  assert.equal(target?.sessionId, "resub");
  assert.equal(target?.conversion, false);
  assert.equal(target?.label, "the setup and the first month");
  const text = refundConfirmText(target, gbp);
  assert.doesNotMatch(text, /trial/);
});

test("4. a real conversion still names the remaining setup and the separate trial payment", async () => {
  const target = await findSetupPayment({
    sessions: [
      sub("conv", { subscription: "sub_2", amount_total: 339_900, metadata: { kind: "convert", monthly_from: "checkout" } }),
      { id: "trial", mode: "payment", payment_status: "paid", payment_intent: "pi_trial", amount_total: 150_000, metadata: { kind: "trial" } },
    ],
    storedSubscriptionId: "sub_2",
    listInvoices: async () => [],
    listInvoicePayments: async () => [{ status: "paid", amount_paid: 339_900, payment: { payment_intent: "pi_conv" } }],
  });
  assert.equal(target?.conversion, true);
  assert.equal(target?.trialPence, 150_000);
});

// 5. Accents are normalised, not dropped.

test("5. Café matches Cafe; accents are kept as plain letters", () => {
  assert.equal(dealerNameKey("Café Motors Ltd"), "cafe motors");
  assert.equal(dealerNameKey("Café Motors"), dealerNameKey("Cafe Motors"));
  assert.equal(dealerNameKey("Škoda Centre Brno"), "skoda centre brno");
  assert.notEqual(dealerNameKey("Café"), "caf");
  const m = similarPaidTenants({ id: 1, name: "Cafe Motors" }, [{ id: 2, name: "Café Motors", status: "subscribed" }]);
  assert.equal(m.length, 1);
});

// 6. The trial duplicate note says trial fee, with no double space.

test("6. a duplicate trial says trial fee, and no note has a double space", () => {
  const trial = duplicateNote({ orderId: 4, sessionId: "cs_4", incoming: null, others: [2], kept: null, trial: true });
  assert.match(trial, /Refund the duplicate trial fee in Stripe\./);
  assert.doesNotMatch(trial, /duplicate setup/);
  const setup = duplicateNote({ orderId: 4, sessionId: "cs_4", incoming: "sub_2", others: [2, 3], kept: "sub_1", trial: false });
  for (const n of [trial, setup]) {
    assert.doesNotMatch(n, / {2}/);
    assert.doesNotMatch(n, /[\u2013\u2014]|glass/i);
  }
  assert.match(setup, /paid orders #2, #3\./);
});

// 7. One staff note per flag, even when the success page and webhook race.

function fakeNotesDb() {
  const keys = new Set<string>();
  const notes: unknown[] = [];
  const events: unknown[] = [];
  const sb = {
    from(table: string) {
      return {
        insert: async (row: Record<string, unknown>) => {
          if (table === "email_log") {
            const k = String(row.dedupe_key);
            if (keys.has(k)) return { data: null, error: { message: "duplicate key", code: "23505" } };
            keys.add(k);
            return { data: null, error: null };
          }
          (table === "notes" ? notes : events).push(row);
          return { data: null, error: null };
        },
      };
    },
  } as unknown as SupabaseLike;
  return { sb, notes, events, keys };
}

test("7. the same duplicate handled twice at once writes one note and one timeline event", async () => {
  const db = fakeNotesDb();
  const store = supabasePaymentStore(db.sb, async () => {});
  const flag: StaffFlag = { tenantId: 3, kind: "duplicate_payment", title: FLAG_TITLES.duplicate_payment, body: "x", dedupeKey: "duplicate-payment:order:9" };
  await Promise.all([store.flagForStaff(flag), store.flagForStaff(flag)]);
  assert.equal(db.notes.length, 1);
  assert.equal(db.events.length, 1);
  assert.ok(db.keys.has("note:duplicate-payment:order:9"));
});

// 8. Office list badges come from the flags on the file, so EMAIL_MODE does not matter.

test("8. duplicate and look-alike badges per site", () => {
  const f = boardFlags([
    { tenant_id: 1, title: FLAG_TITLES.duplicate_payment },
    { tenant_id: 1, title: FLAG_TITLES.similar_dealer },
    { tenant_id: 2, title: FLAG_TITLES.similar_dealer },
    { tenant_id: 3, title: "Pack updated" },
  ]);
  assert.deepEqual(f[1], { duplicate: true, lookalike: true });
  assert.deepEqual(f[2], { duplicate: false, lookalike: true });
  assert.equal(f[3], undefined);
});
