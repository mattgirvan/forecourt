/** Resume order: what counts, the balance, the stage, idempotency, and email holds lifted. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { progressEmailHold, startMonthlyAtGoLive, tenantEnded } from "./billing-start.ts";
import { balancePaidFlag, handleStripeWebhook, type PaymentStore, type StaffFlag } from "./payments.ts";
import { balanceLinkEmail } from "../email/templates.ts";
import {
  balanceOwed,
  executeResume,
  gbp,
  orderStatusAfterResume,
  resumeDecision,
  resumeNote,
  resumeStage,
  resumeStatus,
  resumeSteps,
  sessionIsSitesOwn,
  sessionsThatCount,
  subscriptionPlan,
  type Balance,
  type ResumeDeps,
  type ResumeInput,
  type ResumeSession,
} from "./resume-order.ts";

const STAGES = ["briefing", "paid", "pack", "build", "preview", "testing", "live"] as const;
const DASHES = /[\u2013\u2014]/;

const setup = (over: Partial<ResumeSession> = {}): ResumeSession => ({
  id: "cs_setup",
  mode: "subscription",
  payment_status: "paid",
  amount_total: 450_000,
  subscription: "sub_1",
  created: 100,
  kind: "subscription",
  ...over,
});

// ------------------------------------------------------------------ what counts

test("a duplicate subscription checkout is left out when the site has its own stored subscription", () => {
  const dup = setup({ id: "cs_dup", subscription: "sub_2", created: 200 });
  const { counted, skipped } = sessionsThatCount([dup, setup()], "sub_1");
  assert.deepEqual(counted.map((s) => s.id), ["cs_setup"]);
  assert.equal(skipped[0]!.id, "cs_dup");
  assert.match(skipped[0]!.reason, /not this site's own/);
  assert.equal(sessionIsSitesOwn(dup, "sub_1"), false);
  assert.equal(sessionIsSitesOwn(setup(), "sub_1"), true);
  assert.equal(sessionIsSitesOwn({ mode: "payment", subscription: null }, "sub_1"), true);
});

test("with no stored subscription only the oldest paid subscription checkout counts", () => {
  const later = setup({ id: "cs_later", subscription: "sub_2", created: 300 });
  const { counted, skipped } = sessionsThatCount([later, setup()], null);
  assert.deepEqual(counted.map((s) => s.id), ["cs_setup"]);
  assert.equal(skipped[0]!.id, "cs_later");
});

test("a site pays the trial fee once; a second trial payment is a duplicate", () => {
  const t1 = setup({ id: "cs_t1", mode: "payment", subscription: null, amount_total: 150_000, kind: "trial", created: 1 });
  const t2 = { ...t1, id: "cs_t2", created: 2 };
  const { counted, skipped } = sessionsThatCount([t2, t1], null);
  assert.deepEqual(counted.map((s) => s.id), ["cs_t1"]);
  assert.match(skipped[0]!.reason, /second trial fee/);
});

test("unpaid and expired checkouts never count; balance links always do", () => {
  const expired = setup({ id: "cs_exp", payment_status: "unpaid", mode: "payment", kind: null });
  const bal = setup({ id: "cs_bal", mode: "payment", subscription: null, kind: "balance", amount_total: 450_000, created: 500 });
  const { counted, skipped } = sessionsThatCount([expired, setup(), bal], "sub_1");
  assert.deepEqual(counted.map((s) => s.id).sort(), ["cs_bal", "cs_setup"]);
  assert.deepEqual(skipped, [{ id: "cs_exp", reason: "not paid" }]);
});

// ------------------------------------------------------------------ balance maths

const facts = (paid: number, refunded = 0) => ({ paidPence: paid, refundedPence: refunded, refunds: [] });

test("a real full refund of the £4,500 setup leaves £4,500 owed", () => {
  const b = balanceOwed({ counted: [setup()], facts: { cs_setup: facts(450_000, 450_000) } });
  assert.deepEqual(
    { due: b.duePence, paid: b.paidPence, refunded: b.refundedPence, owed: b.owedPence, neverPaid: b.neverPaid },
    { due: 450_000, paid: 450_000, refunded: 450_000, owed: 450_000, neverPaid: false },
  );
});

test("a status-only refund (nothing went back in Stripe) owes nothing", () => {
  const b = balanceOwed({ counted: [setup()], facts: { cs_setup: facts(450_000, 0) } });
  assert.equal(b.owedPence, 0);
  assert.equal(b.netPaidPence, 450_000);
});

test("a partial refund owes exactly what went back", () => {
  const b = balanceOwed({ counted: [setup()], facts: { cs_setup: facts(450_000, 100_050) } });
  assert.equal(b.owedPence, 100_050);
  assert.equal(gbp(b.owedPence), "£1,000.50");
});

test("a live-trial conversion is due £1,500 plus £3,399", () => {
  const trial = setup({ id: "cs_trial", mode: "payment", subscription: null, amount_total: 150_000, kind: "trial", created: 1 });
  const conv = setup({ id: "cs_conv", amount_total: 339_900, kind: "convert", created: 2 });
  const b = balanceOwed({
    counted: [trial, conv],
    facts: { cs_trial: facts(150_000), cs_conv: facts(339_900, 339_900) },
  });
  assert.equal(b.duePence, 489_900);
  assert.equal(b.owedPence, 339_900);
});

test("a paid balance link pays the balance down to zero", () => {
  const bal = setup({ id: "cs_bal", mode: "payment", subscription: null, kind: "balance", amount_total: 450_000, created: 9 });
  const b = balanceOwed({ counted: [setup(), bal], facts: { cs_setup: facts(450_000, 450_000), cs_bal: facts(450_000) } });
  assert.equal(b.duePence, 450_000);
  assert.equal(b.owedPence, 0);
});

test("never paid: due is the order amount and all of it is owed", () => {
  const b = balanceOwed({ counted: [], facts: {}, orderAmountPence: 150_000 });
  assert.equal(b.neverPaid, true);
  assert.equal(b.owedPence, 150_000);
});

test("a duplicate's refund never shows up as a balance on the real site", () => {
  const dup = setup({ id: "cs_dup", subscription: "sub_2", created: 200 });
  const { counted } = sessionsThatCount([dup, setup()], "sub_1");
  const b = balanceOwed({ counted, facts: { cs_setup: facts(450_000), cs_dup: facts(450_000, 450_000) } });
  assert.equal(b.refundedPence, 0);
  assert.equal(b.owedPence, 0);
});

test("a refund above the payment is capped, never a negative balance", () => {
  const b = balanceOwed({ counted: [setup()], facts: { cs_setup: facts(450_000, 999_999) } });
  assert.equal(b.refundedPence, 450_000);
  assert.equal(b.owedPence, 450_000);
});

// ------------------------------------------------------------------ stage

const ev = (stage: string, at: string, kind = "stage", title = "") => ({ kind, stage, title, created_at: at });

test("stage: staff moves after the refund win (Matt's test file: refunded at paid, later sent to build)", () => {
  const pick = resumeStage({
    currentStage: "build",
    endedAt: "2026-09-16T18:09:36Z",
    events: [
      ev("paid", "2026-09-16T18:07:10Z"),
      ev("build", "2026-09-21T14:33:20Z"),
      ev("preview", "2026-10-02T00:45:46Z"),
      ev("build", "2026-10-02T00:45:50Z"),
    ],
    validStages: STAGES,
    anyPaid: false,
  });
  assert.equal(pick.stage, "build");
  assert.equal(pick.source, "moved_after");
});

test("stage: the stage recorded when it was ended", () => {
  const pick = resumeStage({
    currentStage: "briefing",
    endedAt: null,
    events: [ev("preview", "2026-09-01T10:00:00Z"), ev("preview", "2026-09-02T10:00:00Z", "billing", "Package refunded")],
    validStages: STAGES,
    anyPaid: true,
  });
  assert.deepEqual([pick.stage, pick.source], ["preview", "recorded"]);
});

test("stage: derived from history before the end when nothing was recorded", () => {
  const pick = resumeStage({
    currentStage: "weird",
    endedAt: "2026-09-10T00:00:00Z",
    events: [ev("pack", "2026-09-01T00:00:00Z"), ev("build", "2026-09-05T00:00:00Z")],
    validStages: STAGES,
    anyPaid: true,
  });
  assert.deepEqual([pick.stage, pick.source], ["build", "history"]);
});

test("stage: falls back to the current stage, then paid or briefing", () => {
  assert.equal(resumeStage({ currentStage: "testing", endedAt: null, events: [], validStages: STAGES, anyPaid: true }).source, "current");
  assert.equal(resumeStage({ currentStage: null, endedAt: null, events: [], validStages: STAGES, anyPaid: true }).stage, "paid");
  assert.equal(resumeStage({ currentStage: null, endedAt: null, events: [], validStages: STAGES, anyPaid: false }).stage, "briefing");
});

test("status after resume matches what a paid checkout sets", () => {
  assert.equal(resumeStatus({ billing: "trial", stage: "build" }), "trial");
  assert.equal(resumeStatus({ billing: "subscription", stage: "preview" }), "subscribed");
  assert.equal(resumeStatus({ billing: "subscription", stage: "live" }), "live");
  assert.equal(resumeStatus({ billing: "trial", stage: "build", signedOffAt: "2026-09-01" }), "live");
  for (const s of ["trial", "subscribed", "live"]) assert.equal(tenantEnded(s), false);
});

test("order rows go back to paid only if Stripe shows them paid", () => {
  assert.equal(orderStatusAfterResume("refunded", true), "paid");
  assert.equal(orderStatusAfterResume("cancelled", false), "pending");
  assert.equal(orderStatusAfterResume("pending", false), null);
  assert.equal(orderStatusAfterResume("paid", true), null);
});

// ------------------------------------------------------------------ subscription

const base = { billing: "subscription", hadSubscription: true, stage: "build", customerId: "cus_1", monthlyLabel: "£399", productId: "prod_1" };

test("subscription set to cancel: offer to undo it", () => {
  const p = subscriptionPlan({ ...base, subscription: { id: "sub_1", status: "trialing", cancel_at_period_end: true } });
  assert.equal(p.kind, "set_to_cancel");
  assert.match(p.text, /undo the cancel/i);
});

test("fully cancelled: explain plainly, a new one waits for go live, or nothing", () => {
  const p = subscriptionPlan({ ...base, subscription: { id: "sub_1", status: "canceled" } });
  assert.equal(p.kind, "ended");
  assert.ok(p.kind === "ended" && p.canCreate);
  assert.match(p.text, /cannot be restarted/);
  assert.match(p.text, /waits for go live/);
  assert.match(p.text, /nothing is billed until you choose/i);
});

test("a new subscription is blocked when it could never start or has nothing to copy", () => {
  const live = subscriptionPlan({ ...base, stage: "live", subscription: { id: "sub_1", status: "canceled" } });
  assert.ok(live.kind === "ended" && !live.canCreate);
  const noProduct = subscriptionPlan({ ...base, productId: null, subscription: null });
  assert.ok(noProduct.kind === "ended" && !noProduct.canCreate);
  const noCustomer = subscriptionPlan({ ...base, customerId: null, subscription: { id: "sub_1", status: "canceled" } });
  assert.ok(noCustomer.kind === "ended" && !noCustomer.canCreate);
});

test("a 60-day trial has no monthly, and a running plan is left alone", () => {
  assert.equal(subscriptionPlan({ ...base, billing: "trial", hadSubscription: false, subscription: null }).kind, "none_needed");
  assert.equal(subscriptionPlan({ ...base, subscription: { id: "sub_1", status: "trialing" } }).kind, "running");
  assert.equal(subscriptionPlan({ ...base, subscription: null, lookupFailed: true }).kind, "unknown");
});

// ------------------------------------------------------------------ resume, idempotent

const owed = (n: number): Balance => ({ duePence: 450_000, paidPence: 450_000, refundedPence: n, netPaidPence: 450_000 - n, owedPence: n, creditPence: 0, neverPaid: false });

function harness(start: string) {
  let status = start;
  const calls: string[] = [];
  const deps: ResumeDeps = {
    undoCancel: async (id, params, key) => void calls.push(`undo ${id} ${JSON.stringify(params)} ${key}`),
    createSubscription: async (key) => {
      calls.push(`create ${key}`);
      return { id: "sub_new", line: "New subscription." };
    },
    claim: async (patch) => {
      if (status !== "refunded" && status !== "cancelled") return false;
      status = String(patch.status);
      calls.push(`claim ${JSON.stringify(patch)}`);
      return true;
    },
    setOrderStatus: async (id, s) => void calls.push(`order ${id} ${s}`),
    timeline: async (body) => void calls.push(`timeline ${body}`),
    note: async (body) => void calls.push(`note ${body}`),
    log: () => {},
  };
  return { deps, calls, status: () => status };
}

const input = (over: Partial<ResumeInput> = {}): ResumeInput => ({
  tenantId: 7,
  status: "refunded",
  expectStatus: "refunded",
  owner: true,
  actor: "hello@forecourt.me",
  now: new Date("2026-10-02T01:00:00Z"),
  endedAt: "2026-09-16T18:09:36Z",
  plan: { kind: "none_needed", text: "" },
  subscription: null,
  choice: { undoCancel: false, newSubscription: false },
  newStatus: "subscribed",
  newStatusLabel: "Subscription",
  stage: "build",
  stageLabel: "Build",
  balance: owed(450_000),
  orders: [
    { id: 1, status: "refunded", sessionPaid: true },
    { id: 2, status: "pending", sessionPaid: false },
  ],
  ...over,
});

test("resume clears the flag, restores the stage and orders, writes a timeline event and a note", async () => {
  const h = harness("refunded");
  const r = await executeResume(h.deps, input());
  assert.equal(r.noop, false);
  assert.equal(h.status(), "subscribed");
  assert.ok(h.calls.includes(`claim {"status":"subscribed","cancelled_at":null,"stage":"build"}`));
  assert.ok(h.calls.includes("order 1 paid"));
  assert.ok(!h.calls.some((c) => c.startsWith("order 2")));
  const note = h.calls.find((c) => c.startsWith("note "))!;
  assert.match(note, /Resumed by hello@forecourt\.me on 2 Oct 2026, 02:00/);
  assert.match(note, /Paid £4,500, refunded £4,500, due £4,500, owed now £4,500\./);
  assert.ok(h.calls.some((c) => c.startsWith("timeline ")));
  assert.match(r.message, /£4,500 is still owed/);
});

test("a double click or retry is a no-op the second time, and nothing is written twice", async () => {
  const h = harness("refunded");
  const [a, b] = await Promise.all([executeResume(h.deps, input()), executeResume(h.deps, input())]);
  assert.deepEqual([a.noop, b.noop].sort(), [false, true]);
  assert.equal(h.calls.filter((c) => c.startsWith("note ")).length, 1);
  assert.equal(h.calls.filter((c) => c.startsWith("timeline ")).length, 1);
  const again = await executeResume(h.deps, input({ status: "subscribed" }));
  assert.equal(again.noop, true);
  assert.match(again.message, /already active/);
});

test("an already active order is a no-op without touching Stripe", async () => {
  for (const s of ["trial", "subscribed", "live", "paid", null]) {
    const h = harness(String(s));
    const r = await executeResume(h.deps, input({ status: s, choice: { undoCancel: true, newSubscription: true } }));
    assert.equal(r.noop, true);
    assert.deepEqual(h.calls, []);
    assert.equal(resumeDecision(s), "noop");
  }
  assert.equal(resumeDecision("refunded"), "resume");
  assert.equal(resumeDecision("cancelled"), "resume");
});

test("a stale panel (status changed since it opened) changes nothing", async () => {
  const h = harness("cancelled");
  await assert.rejects(executeResume(h.deps, input({ status: "cancelled", expectStatus: "refunded" })), /changed since you opened/);
  assert.deepEqual(h.calls, []);
});

test("undo cancel uses a fixed key so a retry reuses the same Stripe call; operators cannot change Stripe", async () => {
  const plan = { kind: "set_to_cancel" as const, text: "", subscriptionId: "sub_1" };
  const h = harness("cancelled");
  await executeResume(h.deps, input({ status: "cancelled", expectStatus: "cancelled", plan, subscription: { cancel_at_period_end: true }, choice: { undoCancel: true, newSubscription: false } }));
  assert.ok(h.calls[0]!.startsWith(`undo sub_1 {"cancel_at_period_end":false} forecourt-resume-undo-sub_1-${Date.parse("2026-09-16T18:09:36Z")}`));
  const op = harness("cancelled");
  await assert.rejects(
    executeResume(op.deps, input({ status: "cancelled", expectStatus: "cancelled", owner: false, plan, choice: { undoCancel: true, newSubscription: false } })),
    /Only an owner/,
  );
  assert.deepEqual(op.calls, []);
});

test("a new subscription is only made when ticked, and its id is stored on the file", async () => {
  const plan = { kind: "ended" as const, text: "", canCreate: true };
  const off = harness("refunded");
  await executeResume(off.deps, input({ plan }));
  assert.ok(!off.calls.some((c) => c.startsWith("create")));
  const on = harness("refunded");
  await executeResume(on.deps, input({ plan, choice: { undoCancel: false, newSubscription: true } }));
  assert.ok(on.calls.some((c) => c.startsWith("create forecourt-resume-sub-7-")));
  assert.ok(on.calls.some((c) => c.includes(`"stripe_subscription_id":"sub_new"`)));
});

// ------------------------------------------------------------------ email holds lifted

test("after resume the progress and You're live holds no longer apply", async () => {
  assert.match(progressEmailHold({ stage: "preview", priorStatus: "refunded" }) ?? "", /refunded/);
  const status = resumeStatus({ billing: "subscription", stage: "preview" });
  assert.equal(progressEmailHold({ stage: "preview", priorStatus: status }), null);
  // Going live after resume starts the monthly plan as normal and is not held.
  const subs = {
    retrieve: async (id: string) => ({ id, status: "trialing" }),
    update: async (id: string) => ({ id, status: "active" }),
  };
  const held = await startMonthlyAtGoLive({ subscriptions: subs, log: console }, "sub_1", { tenantStatus: "refunded" });
  assert.equal(held.started, false);
  const start = await startMonthlyAtGoLive({ subscriptions: subs, log: console }, "sub_1", { tenantStatus: status });
  assert.equal(start.started, true);
  assert.equal(progressEmailHold({ stage: "live", priorStatus: status, start }), null);
});

// ------------------------------------------------------------------ balance link webhook

test("a paid balance link is noted for staff and answered 200, never 422", async () => {
  const session = { id: "cs_bal", status: "complete", payment_status: "paid", amount_total: 450_000, currency: "gbp", metadata: { kind: "balance", tenant_id: "7" } };
  const flag = balancePaidFlag(session)!;
  assert.equal(flag.kind, "balance_paid");
  assert.match(flag.body, /£4,500 paid on the balance payment link \(Stripe cs_bal\)/);
  assert.equal(balancePaidFlag({ ...session, metadata: { order_id: "1" } }), null);
  const flags: StaffFlag[] = [];
  const store = { flagForStaff: async (f: StaffFlag) => void flags.push(f) } as unknown as PaymentStore;
  const res = await handleStripeWebhook(
    {
      stripeSecret: "sk",
      webhookSecret: "wh",
      store,
      constructEvent: () => ({ type: "checkout.session.completed", data: { object: session } }),
      log: { error: () => {}, warn: () => {} },
    },
    "{}",
    "sig",
  );
  assert.equal(res.status, 200);
  assert.equal(flags.length, 1);
});

// ------------------------------------------------------------------ copy

test("copy: plain English, no em or en dashes, never glass", () => {
  const plans = [
    subscriptionPlan({ ...base, subscription: { id: "sub_1", status: "active", cancel_at_period_end: true, current_period_end: 1_790_000_000 } }),
    subscriptionPlan({ ...base, subscription: { id: "sub_1", status: "canceled" } }),
    subscriptionPlan({ ...base, stage: "live", subscription: null }),
    subscriptionPlan({ ...base, billing: "trial", hadSubscription: false, subscription: null }),
  ];
  const pick = resumeStage({ currentStage: "build", endedAt: null, events: [], validStages: STAGES, anyPaid: true });
  const texts = [
    ...plans.flatMap((p) => [p.text, p.kind === "ended" ? (p.createBlocked ?? "") : ""]),
    ...resumeSteps({ status: "refunded", stage: pick, stageLabel: "Build", newStatusLabel: "Subscription", balance: owed(450_000), plan: plans[1]!, choice: { undoCancel: true, newSubscription: true } }),
    ...resumeSteps({ status: "cancelled", stage: pick, stageLabel: "Build", newStatusLabel: "Subscription", balance: owed(0), plan: plans[0]!, choice: { undoCancel: false, newSubscription: false } }),
    resumeNote({ actor: "a@b.c", at: new Date(), from: "refunded", toStatus: "Subscription", stageLabel: "Build", balance: owed(1), stripe: [] }),
  ];
  const mail = balanceLinkEmail({ firstName: "Matt", dealer: "Test Motors", amountPence: 450_000, payUrl: "https://checkout.stripe.com/c/pay/cs_x", accountUrl: "https://www.forecourt.me/account" });
  texts.push(mail.subject, mail.text, mail.preheader);
  for (const t of texts) {
    assert.ok(!DASHES.test(t), `dash in: ${t}`);
    assert.ok(!/glass/i.test(t), `glass in: ${t}`);
  }
  assert.match(mail.text, /Pay £4,500: https:\/\/checkout\.stripe\.com/);
});
