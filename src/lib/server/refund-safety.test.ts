/** Refund and duplicate safety (Atlas rounds 5 and 6). One block per item. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { dealerNameKey, similarPaidTenants } from "./dealer-match.ts";
import { OPEN_SESSION_MAX, OPEN_SESSION_WINDOW_HOURS, recentPendingCutoff } from "./checkout-sessions.ts";
import {
  FLAG_HANDLED_TITLE,
  FLAG_TITLES,
  STAFF_NOTE_RECIPIENT,
  applyPaidOrder,
  boardFlags,
  claimStaffNote,
  duplicateNote,
  handledNote,
  handledTag,
  sentEmailRows,
  trialRaceWinner,
  paidOrderConflict,
  supabasePaymentStore,
  type OrderRow,
  type PaymentStore,
  type StaffFlag,
  type SupabaseLike,
  type TenantRow,
} from "./payments.ts";
import {
  ALL_REFUNDED_TEXT,
  DUPLICATE_FLAG_TITLE,
  duplicateHandledProblem,
  findRefundTarget,
  flaggedDuplicateSubscriptions,
  subscriptionGone,
  findSetupPayment,
  refundConfirmText,
  type SessionLike,
} from "./refund-target.ts";
import { balanceOwed, sessionsThatCount } from "./resume-order.ts";

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

const noInvoices = { listInvoices: async () => [], listInvoicePayments: invoicePaid };
const trialS = (id: string, created: number, over: Partial<SessionLike> = {}): SessionLike => ({
  id,
  mode: "payment",
  payment_status: "paid",
  payment_intent: `pi_${id}`,
  amount_total: 150_000,
  created,
  metadata: { kind: "trial" },
  ...over,
});

test("1. Office Refund skips the flagged duplicate (newest) payment and refunds the site's own setup", async () => {
  const sessions = [sub("dup", { subscription: "sub_2", created: 2 }), sub("own", { subscription: "sub_1", created: 1 })];
  const target = await findSetupPayment({ sessions, subscriptionId: "sub_1", duplicateSessionIds: ["dup"], ...noInvoices });
  assert.equal(target?.sessionId, "own");
  assert.equal(target?.paymentIntent, "pi_own");
});

test("1. if only a duplicate is paid, Office Refund finds nothing rather than the duplicate", async () => {
  const target = await findSetupPayment({ sessions: [sub("dup", { subscription: "sub_2" })], duplicateSessionIds: ["dup"], ...noInvoices });
  assert.equal(target, null);
});

test("1. a second trial fee in the same package is never the one refunded", async () => {
  const target = await findSetupPayment({ sessions: [trialS("t2", 2), trialS("t1", 1)], ...noInvoices });
  assert.equal(target?.sessionId, "t1");
});

test("1. after Resume sets up a new subscription, Office Refund still finds the site's own setup", async () => {
  // The stored subscription is now the Resume one; nothing compares against it.
  const target = await findSetupPayment({ sessions: [sub("own", { subscription: "sub_1", created: 1 })], subscriptionId: "sub_resume", endedAt: [5], ...noInvoices });
  assert.equal(target?.sessionId, "own");
});

test("1. the duplicate note says not to use Office Refund, and Resume shares the rule", () => {
  const note = duplicateNote({ orderId: 9, sessionId: "cs_test_2", incoming: "sub_2", others: [7], kept: "sub_1", trial: false });
  assert.match(note, /Don't use Office Refund for this/);
  assert.match(note, /Refund the duplicate setup and cancel sub_2 in Stripe\./);
  assert.equal(FLAG_TITLES.duplicate_payment, DUPLICATE_FLAG_TITLE);
  const sessions = [
    { id: "dup", mode: "subscription", payment_status: "paid", subscription: "sub_2", amount_total: 450_000, created: 2 },
    { id: "own", mode: "subscription", payment_status: "paid", subscription: "sub_1", amount_total: 450_000, created: 1 },
  ];
  const { counted } = sessionsThatCount(sessions, { duplicateSessionIds: ["dup"] });
  const b = balanceOwed({
    counted,
    facts: { own: { paidPence: 450_000, refundedPence: 0, refunds: [] }, dup: { paidPence: 450_000, refundedPence: 450_000, refunds: [] } },
  });
  assert.equal(b.owedPence, 0, "the duplicate's refund is not a balance on the real site");
});

// Round 6 MUST-FIX: the current trial, never an old or already refunded one.

test("R6. a refunded trial that bought again: Office Refund targets the current trial, not the old refunded one", async () => {
  const sessions = [trialS("t_new", 3_000), trialS("t_old", 1_000)];
  const refunded: Record<string, number> = { pi_t_old: 150_000, pi_t_new: 0 };
  const target = await findSetupPayment({ sessions, endedAt: [2_000], refundedPence: async (pi) => refunded[pi] ?? 0, ...noInvoices });
  assert.equal(target?.sessionId, "t_new");
  assert.equal(target?.paymentIntent, "pi_t_new");
  // Even with no end mark on record, the already refunded old trial is never picked.
  const noMark = await findRefundTarget({ sessions, refundedPence: async (pi) => refunded[pi] ?? 0, ...noInvoices });
  assert.notEqual(noMark.target?.sessionId, "t_old");
});

test("R6. a payment already refunded in full is skipped; if that is all there is, staff are told so", async () => {
  const r = await findRefundTarget({ sessions: [trialS("t1", 1)], refundedPence: async () => 150_000, ...noInvoices });
  assert.equal(r.target, null);
  assert.equal(r.allRefunded, true);
  assert.match(ALL_REFUNDED_TEXT, /already been refunded in Stripe/);
  assert.doesNotMatch(ALL_REFUNDED_TEXT, /[\u2013\u2014]|glass/i);
  // A partly refunded payment can still be refunded.
  const part = await findSetupPayment({ sessions: [trialS("t1", 1)], refundedPence: async () => 50_000, ...noInvoices });
  assert.equal(part?.sessionId, "t1");
});

test("R6. after Resume and a paid balance link, Office Refund targets the balance, not the refunded setup", async () => {
  const sessions: SessionLike[] = [
    { id: "bal", mode: "payment", payment_status: "paid", payment_intent: "pi_bal", amount_total: 450_000, created: 9, metadata: { kind: "balance" } },
    sub("own", { subscription: "sub_1", created: 1 }),
  ];
  const refunded: Record<string, number> = { pi_own: 450_000, pi_bal: 0 };
  const target = await findSetupPayment({ sessions, subscriptionId: "sub_resume", endedAt: [5], refundedPence: async (pi) => refunded[pi] ?? 0, ...noInvoices });
  assert.equal(target?.sessionId, "bal");
  assert.equal(target?.covers, "balance");
  assert.match(refundConfirmText(target, gbp), /Refund £4,500, the balance they paid by payment link/);
});

test("R6. a converted trial refunds the conversion (newest own payment) and names the trial", async () => {
  const target = await findSetupPayment({
    sessions: [sub("conv", { subscription: "sub_2", amount_total: 300_000, created: 2, metadata: { kind: "convert", monthly_from: "go_live" } }), trialS("trial", 1)],
    listInvoices: async () => [],
    listInvoicePayments: async () => [{ status: "paid", amount_paid: 300_000, payment: { payment_intent: "pi_conv" } }],
  });
  assert.equal(target?.sessionId, "conv");
  assert.equal(target?.conversion, true);
  assert.equal(target?.trialPence, 150_000);
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

// Round 6 nit: two trials paid at the same moment.

function trialRaceStore() {
  const tenant: TenantRow = { user_id: "u", status: "briefing", trial_ends_at: null };
  const paid = new Set<number>();
  const updates: unknown[] = [];
  const flags: StaffFlag[] = [];
  const store: PaymentStore = {
    loadOrder: async () => null,
    loadTenant: async () => ({ ...tenant }),
    updateTenant: async (_id, patch) => void updates.push(patch),
    markOrderPaid: async (id) => void paid.add(id),
    cancelBySubscription: async () => {},
    claimStatus: async (_id, expected, next) => {
      if ((tenant.status ?? null) !== expected) return false;
      tenant.status = next;
      return true;
    },
    otherPaidOrderIds: async (_t, except) => [...paid].filter((id) => id !== except),
    listTenantsForMatch: async () => [],
    flagForStaff: async (f) => void flags.push(f),
    seedPaid: async () => {},
  };
  return { store, tenant, updates, flags, paid };
}
const trialOrder = (id: number): OrderRow => ({ id, user_id: "u", tenant_id: 3, plan: "pilot", amount_pence: 150_000, status: "pending", kind: "trial" });
const trialSession = (id: number) => ({ id: `cs_test_${id}`, status: "complete", payment_status: "paid", amount_total: 150_000, currency: "gbp", subscription: null, metadata: { order_id: String(id) } });

test("R6. two trials paid at the same moment: one sets the site, the other is flagged as a duplicate", async () => {
  const r = trialRaceStore();
  const [a, b] = await Promise.all([
    applyPaidOrder(r.store, trialOrder(1), trialSession(1), "stripe", quiet),
    applyPaidOrder(r.store, trialOrder(2), trialSession(2), "stripe", quiet),
  ]);
  assert.deepEqual([a.applied, b.applied].sort(), ["order_only", "tenant_updated"]);
  assert.equal(r.updates.length, 1);
  assert.equal(r.flags.length, 1);
  assert.equal(r.flags[0]!.title, DUPLICATE_FLAG_TITLE);
  assert.match(r.flags[0]!.body, /Refund the duplicate trial fee in Stripe\./);
});

test("R6. the success page and the webhook for the same trial at once: no false duplicate flag", async () => {
  const r = trialRaceStore();
  const [a, b] = await Promise.all([
    applyPaidOrder(r.store, trialOrder(1), trialSession(1), "checkout", quiet),
    applyPaidOrder(r.store, trialOrder(1), trialSession(1), "stripe", quiet),
  ]);
  assert.deepEqual([a.applied, b.applied].sort(), ["already_paid", "tenant_updated"]);
  assert.equal(r.flags.length, 0);
});

test("R6. trialRaceWinner gives up as a duplicate (so staff check it) if it cannot tell", async () => {
  const none = { otherPaidOrderIds: async () => [] as number[] };
  assert.equal(await trialRaceWinner(none, 3, 1, { tries: 2, waitMs: 1 }), "other_order");
  assert.equal(await trialRaceWinner({ otherPaidOrderIds: async () => [1] }, 3, 1), "same_order");
  assert.equal(await trialRaceWinner({ otherPaidOrderIds: async () => [2] }, 3, 1), "other_order");
});

test("R6. the Supabase store claims a trial with a guarded status update", async () => {
  const seen: string[] = [];
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
      return Promise.resolve({ data: [{ id: 3 }], error: null });
    },
  };
  const sb = { from: () => ({ update: (patch: Record<string, unknown>) => (seen.push(`update ${JSON.stringify(patch)}`), chain) }) } as unknown as SupabaseLike;
  const store = supabasePaymentStore(sb, async () => {});
  assert.equal(await store.claimStatus!(3, "briefing", "trial"), true);
  assert.deepEqual(seen, ['update {"status":"trial"}', "eq id=3", "eq status=briefing"]);
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
    sub("resub", { subscription: "sub_3", amount_total: 489_900, created: 5, metadata: { kind: "subscription", monthly_from: "checkout" } }),
    sub("conv", { subscription: "sub_2", amount_total: 339_900, created: 2, metadata: { kind: "convert", monthly_from: "checkout" } }),
    { id: "trial", mode: "payment", payment_status: "paid", payment_intent: "pi_trial", amount_total: 150_000, created: 1, metadata: { kind: "trial" } },
  ];
  const target = await findSetupPayment({
    sessions,
    endedAt: [3],
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
      sub("conv", { subscription: "sub_2", amount_total: 339_900, created: 2, metadata: { kind: "convert", monthly_from: "checkout" } }),
      { id: "trial", mode: "payment", payment_status: "paid", payment_intent: "pi_trial", amount_total: 150_000, created: 1, metadata: { kind: "trial" } },
    ],
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

test("R6. a staff note claim never looks like a sent email", async () => {
  const rows: Record<string, unknown>[] = [];
  const sb = { from: () => ({ insert: async (row: Record<string, unknown>) => (rows.push(row), { data: null, error: null }) }) } as unknown as SupabaseLike;
  await claimStaffNote(sb, { tenantId: 3, kind: "duplicate_payment", title: FLAG_TITLES.duplicate_payment, body: "x", dedupeKey: "k" });
  assert.equal(rows[0]!.recipient, STAFF_NOTE_RECIPIENT);
  assert.equal(rows[0]!.kind, "staff_note");
  assert.match(String(rows[0]!.subject), /^Staff note: /);
  const listed = sentEmailRows([{ kind: "progress" }, { kind: "staff_note" }, { kind: "balance_link" }]);
  assert.deepEqual(listed.map((r) => r.kind), ["progress", "balance_link"]);
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

test("R6. a badge clears once the flag is marked handled, and comes back for a newer flag", () => {
  const at = (m: number) => `2026-10-02T00:${String(m).padStart(2, "0")}:00Z`;
  const events = [
    { tenant_id: 1, title: FLAG_TITLES.duplicate_payment, created_at: at(1) },
    { tenant_id: 1, title: FLAG_TITLES.similar_dealer, created_at: at(2) },
    { tenant_id: 1, title: FLAG_HANDLED_TITLE, body: handledNote({ kind: "duplicate_payment", by: "a@b.c", how: "refunded" }), created_at: at(3) },
  ];
  assert.deepEqual(boardFlags(events)[1], { duplicate: false, lookalike: true });
  // Order in the list does not matter, only the times.
  assert.deepEqual(boardFlags([...events].reverse())[1], { duplicate: false, lookalike: true });
  const again = [...events, { tenant_id: 1, title: FLAG_TITLES.duplicate_payment, created_at: at(4) }];
  assert.deepEqual(boardFlags(again)[1], { duplicate: true, lookalike: true });
  const both = [...events, { tenant_id: 1, title: FLAG_HANDLED_TITLE, body: `x ${handledTag("similar_dealer")}`, created_at: at(5) }];
  assert.deepEqual(boardFlags(both)[1], { duplicate: false, lookalike: false });
});

test("R6. the handled note is plain English and carries its tag", () => {
  const n = handledNote({ kind: "duplicate_payment", by: "matt@forecourt.me", how: "refunded", stripe: "Stripe shows £4,500 of £4,500 refunded on cs_test_1." });
  assert.equal(n, "Duplicate payment marked handled by matt@forecourt.me: the duplicate was refunded in Stripe. Stripe shows £4,500 of £4,500 refunded on cs_test_1. [handled:duplicate_payment]");
  const c = handledNote({ kind: "similar_dealer", by: "a@b.c", how: "checked" });
  for (const t of [n, c]) assert.doesNotMatch(t, /[\u2013\u2014]|glass/i);
});

// ------------------------------------------------------------------ round 7: "Refunded in Stripe" also needs the duplicate subscription cancelled

test("round 7 must-fix 2: the duplicate subscription is read from the flag, never the one the site keeps", () => {
  const body = duplicateNote({ orderId: 9, sessionId: "cs_live_dup9", incoming: "sub_Dup9", others: [], kept: "sub_Keep1", trial: false });
  assert.match(body, /\(Stripe session cs_live_dup9, subscription sub_Dup9\)/);
  const flags = [{ title: DUPLICATE_FLAG_TITLE, body }];
  assert.deepEqual([...flaggedDuplicateSubscriptions(flags)], ["sub_Dup9"]);
  assert.deepEqual([...flaggedDuplicateSubscriptions(flags, "sub_Dup9")], [], "the file's own subscription is never treated as the duplicate");
  // A trial fee duplicate has no subscription of its own.
  const trial = duplicateNote({ orderId: 3, sessionId: "cs_live_t3", incoming: null, others: [1], kept: null, trial: true });
  assert.deepEqual([...flaggedDuplicateSubscriptions([{ title: DUPLICATE_FLAG_TITLE, body: trial }])], []);
  // Other flags are ignored.
  assert.deepEqual([...flaggedDuplicateSubscriptions([{ title: "Note", body }])], []);
});

test("round 7 must-fix 2: refunded is not enough; the duplicate subscription must be canceled or incomplete_expired", () => {
  const refunded = [{ sessionId: "cs_live_dup9", paidPence: 450_000, refundedPence: 450_000, paid: "£4,500", refunded: "£4,500" }];
  for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]) {
    const why = duplicateHandledProblem({ payments: refunded, subscriptions: [{ id: "sub_Dup9", status }] });
    assert.equal(
      why,
      `The duplicate payment is refunded, but Stripe shows the duplicate subscription sub_Dup9 is still ${status}, so it could bill again. Cancel it in Stripe first, or mark it checked. Nothing was changed.`,
    );
    assert.ok(!/[\u2013\u2014]/.test(why!));
  }
  for (const status of ["canceled", "incomplete_expired"]) {
    assert.equal(duplicateHandledProblem({ payments: refunded, subscriptions: [{ id: "sub_Dup9", status }] }), null);
    assert.equal(subscriptionGone(status), true);
  }
  // A part refund is still refused first, with the amounts.
  const part = [{ sessionId: "cs_live_dup9", paidPence: 450_000, refundedPence: 100_000, paid: "£4,500", refunded: "£1,000" }];
  assert.match(duplicateHandledProblem({ payments: part, subscriptions: [{ id: "sub_Dup9", status: "canceled" }] })!, /Stripe shows £1,000 of £4,500 refunded on cs_live_dup9\. Refund the duplicate in Stripe first/);
  // No duplicate subscription (a trial fee): the refund alone is enough.
  assert.equal(duplicateHandledProblem({ payments: refunded, subscriptions: [] }), null);
});
