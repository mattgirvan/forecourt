import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTicket, manualPriceInstruction, openTicket, rejectTicket, refundKey, ticketDetails, ticketTitle, type ApplyDeps, type RejectDeps, type TicketChange } from "./plan-change-ticket.ts";

const change = (o: Partial<TicketChange> = {}): TicketChange => ({
  id: 7,
  tenant_id: 4,
  from_plan: "franchise",
  to_plan: "group",
  status: "paid",
  direction: "down",
  setup_diff_pence: 200_000,
  new_monthly_pence: 49_800,
  payment_intent_id: "pi_1",
  requested_by: "a@b.c",
  ...o,
});
const noDash = (s: string) => assert.ok(!/[\u2010-\u2015]|\s-\s|glass/i.test(s), s);

test("ticket opens once for paid, requested and scheduled, linked by support_item_id", async () => {
  for (const status of ["paid", "requested", "scheduled"]) {
    const log: string[] = [];
    const id = await openTicket(
      {
        insertItem: async (r) => (log.push(`insert:${r.kind}:${r.change_type}:${r.status}`), { id: 55 }),
        link: async (c, i) => (log.push(`link:${c}:${i}`), true),
        removeItem: async () => void log.push("remove"),
      },
      change({ status }),
    );
    assert.equal(id, 55);
    assert.deepEqual(log, ["insert:change:plan_change:submitted", "link:7:55"]);
  }
});

test("no ticket while waiting for payment, and none twice", async () => {
  const deps = { insertItem: async () => assert.fail("no insert"), link: async () => true, removeItem: async () => {} };
  assert.equal(await openTicket(deps, change({ status: "pending_payment" })), null);
  assert.equal(await openTicket(deps, change({ support_item_id: 9 })), 9);
});

test("a ticket that loses the link race is removed", async () => {
  const log: string[] = [];
  const id = await openTicket({ insertItem: async () => ({ id: 56 }), link: async () => false, removeItem: async (i) => void log.push(`remove:${i}`) }, change());
  assert.equal(id, null);
  assert.deepEqual(log, ["remove:56"]);
});

test("ticket copy is plain, inc. VAT, no dashes", () => {
  assert.equal(ticketTitle(change()), "Plan change: Franchise to Group");
  const d = ticketDetails(change());
  assert.match(d, /£2,000 paid \(inc\. VAT\)/);
  noDash(d);
});

function applyDeps(o: Partial<ApplyDeps> = {}) {
  const log: string[] = [];
  const deps: ApplyDeps = {
    syncOn: true,
    now: () => new Date("2026-11-01T10:00:00Z"),
    live: 2,
    subscriptionId: "sub_1",
    periodStart: "2026-10-14T00:00:00Z",
    periodEnd: "2026-11-14T00:00:00Z",
    stripeApply: async (k) => (log.push(`stripe:${k}`), { applied: true, mode: "now" }),
    claim: async (from, p) => (log.push(`claim:${from}->${p.status}:${p.go_live_at ? "golive" : ""}`), true),
    switchPlan: async () => void log.push("switch"),
    advanceTracker: async () => void log.push("tracker"),
    ticketStatus: async (s, m) => void log.push(`ticket:${s}:${m}`),
    ...o,
  };
  return { deps, log };
}

test("apply with sync on: Stripe swap, go live set, plan switched, tracker moved", async () => {
  const { deps, log } = applyDeps();
  const r = await applyTicket(deps, change({ from_plan: "site", to_plan: "franchise", direction: "up" }));
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.manualPrice, null);
  assert.deepEqual(log.slice(0, 4), ["stripe:plan-change-apply:7", "claim:paid->applied:golive", "switch", "tracker"]);
  assert.match(log[4], /part month goes on the next bill/);
});

test("apply with sync off: Stripe untouched, staff told to set the price by hand", async () => {
  const { deps, log } = applyDeps({ syncOn: false, stripeApply: async () => assert.fail("no Stripe with sync off") });
  const r = await applyTicket(deps, change({ from_plan: "site", to_plan: "franchise", direction: "up" }));
  assert.ok(r.ok && r.manualPrice);
  assert.match(r.ok ? r.manualPrice! : "", /^Plan sync is off\. In Stripe, change the price to £899 a month \(inc\. VAT\) from today, 1 Nov 2026, and add the part month of £/);
  assert.ok(log.includes("switch") && log.includes("tracker"));
  noDash(r.ok ? r.manualPrice! : "");
});

test("sync off drop: instruction points at period end", () => {
  const m = manualPriceInstruction(change({ from_plan: "group", to_plan: "site", status: "requested", effective_at: "2026-11-14T00:00:00Z" }), { goLiveAt: "2026-11-01T10:00:00Z", live: 3, periodStart: null, periodEnd: null });
  assert.match(m, /from the next billing period, 14 Nov 2026/);
});

test("apply on a booked schedule does not call Stripe again", async () => {
  const { deps, log } = applyDeps({ stripeApply: async () => assert.fail("already booked") });
  const r = await applyTicket(deps, change({ status: "scheduled", stripe_schedule_id: "sub_sched_1", from_plan: "group", to_plan: "site" }));
  assert.equal(r.ok, true);
  assert.equal(log[0], "claim:scheduled->scheduled:golive");
});

test("apply stops when Stripe refuses, and when someone else got there first", async () => {
  const a = applyDeps({ stripeApply: async () => ({ applied: false, reason: "stripe_error", detail: "down" }) });
  assert.equal((await applyTicket(a.deps, change())).ok, false);
  assert.ok(!a.log.includes("switch"));
  const b = applyDeps({ claim: async () => false });
  assert.equal((await applyTicket(b.deps, change())).ok, false);
  assert.ok(!b.log.includes("switch"));
  assert.equal((await applyTicket(applyDeps().deps, change({ status: "applied" }))).ok, false);
});

function rejectDeps(o: Partial<RejectDeps> = {}) {
  const log: string[] = [];
  const deps: RejectDeps = {
    role: "owner",
    refund: async (pi, key) => (log.push(`refund:${pi}:${key}`), { id: "re_1" }),
    releaseSchedule: async (id) => (log.push(`release:${id}`), { released: true }),
    claim: async (from, p) => (log.push(`claim:${from}->${p.status}:${p.refund_id}`), true),
    closeTracker: async () => void log.push("close"),
    ticketStatus: async (s, m) => void log.push(`ticket:${s}:${m}`),
    ...o,
  };
  return { deps, log };
}

test("reject is owner only", async () => {
  const { deps, log } = rejectDeps({ role: "staff" });
  const r = await rejectTicket(deps, change(), "x");
  assert.equal(r.ok, false);
  assert.deepEqual(log, []);
});

test("reject a paid request: refund with the Office refund key, then refunded", async () => {
  const { deps, log } = rejectDeps();
  const r = await rejectTicket(deps, change(), "Brand not supported yet.");
  assert.equal(r.ok, true);
  assert.equal(refundKey("pi_1"), "forecourt-refund-pi_1");
  assert.deepEqual(log.slice(0, 3), ["refund:pi_1:forecourt-refund-pi_1", "claim:paid->refunded:re_1", "close"]);
  assert.match(log[3], /^ticket:declined:Rejected and £2,000 refunded\./);
});

test("reject: Stripe refusal stops it; already refunded carries on", async () => {
  const a = rejectDeps({ refund: async () => { throw new Error("card declined"); } });
  assert.equal((await rejectTicket(a.deps, change(), "")).ok, false);
  assert.ok(!a.log.some((l) => l.startsWith("claim")));
  const b = rejectDeps({ refund: async () => { throw new Error("Charge has already been refunded."); } });
  assert.equal((await rejectTicket(b.deps, change(), "")).ok, true);
});

test("reject a £0 or scheduled request: no refund, schedule released", async () => {
  const a = rejectDeps({ refund: async () => assert.fail("no refund") });
  assert.equal((await rejectTicket(a.deps, change({ status: "requested", setup_diff_pence: 0 }), "")).ok, true);
  assert.equal(a.log[0], "claim:requested->cancelled:null");
  const b = rejectDeps();
  await rejectTicket(b.deps, change({ status: "scheduled", setup_diff_pence: 0, stripe_schedule_id: "ss_1" }), "");
  assert.equal(b.log[0], "release:ss_1");
});

import { applySheet, rejectSheet } from "../plan-change-ticket-copy.ts";
import { readFileSync } from "node:fs";

const view = { from: "Site", to: "Franchise", setupPaid: "£500", newMonthly: "£899", monthlyStarts: "on_go_live" as const, effectiveAt: null, syncOn: false };

test("confirm sheets: apply says what happens to the price, reject is danger with the refund amount", () => {
  const off = applySheet(view);
  assert.equal(off.title, "Apply the move to Franchise?");
  assert.match(off.body, /Plan sync is off, so Stripe is not changed/);
  assert.match(applySheet({ ...view, syncOn: true }).body, /£899 a month price starts today\. Stripe adds the part month to the next bill\./);
  const r = rejectSheet(view);
  assert.equal(r.tone, "danger");
  assert.equal(r.title, "Reject and refund £500?");
  assert.equal(rejectSheet({ ...view, setupPaid: null }).confirmLabel, "Reject");
  for (const s of [off, applySheet({ ...view, syncOn: true, monthlyStarts: "period_end", effectiveAt: "2026-11-14T00:00:00Z" }), r]) for (const t of [s.title, s.body, s.confirmLabel]) noDash(t);
});

test("Office wiring: plan change tickets use the shared confirm sheet and hide the status picker", () => {
  const ui = readFileSync(new URL("../../components/office/plan-change-ticket.tsx", import.meta.url), "utf8");
  assert.match(ui, /askConfirm\(applySheet\(v\)\)/);
  assert.match(ui, /askConfirm\(rejectSheet\(v\)\)/);
  assert.match(ui, /disabled=\{busy \|\| !v\.isOwner\}/);
  const desk = readFileSync(new URL("../../components/office/support-desk.tsx", import.meta.url), "utf8");
  assert.match(desk, /if \(isPlanChange\(item\)\) return <Pill/);
  const staff = readFileSync(new URL("./plan-change-staff.ts", import.meta.url), "utf8");
  assert.match(staff, /role: who\.role/);
  const server = readFileSync(new URL("./plan-change-server.ts", import.meta.url), "utf8");
  assert.equal(server.match(/openTicketFor\(/g)?.length, 5, "awaiting payment, Pay, requested, booked and paid open the ticket");
});

test("setup difference uses the real catalog: Site £4,500 to Franchise £6,500 is £2,000", async () => {
  const { PLANS } = await import("../catalog.ts");
  const { planMove } = await import("../plan-change-rules.ts");
  assert.equal(PLANS.site.setupPence, 450_000);
  assert.equal(PLANS.franchise.setupPence, 650_000);
  const m = planMove({ from: "site", to: "franchise", live: 1 });
  assert.equal(m.setupDuePence, 200_000);
});
