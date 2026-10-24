import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { keepOnExpiry, markPaidOffline, MARK_PAID_OWNER_ONLY, type MarkPaidChange, type MarkPaidDeps } from "./plan-change-mark-paid.ts";
import { markRequestPaid } from "./plan-change-request.ts";
import { upgradeCheckoutParams } from "./plan-change-sync.ts";
import { planChangeEmail } from "../plan-change-emails.ts";
import { markPaidSheet, officePaymentLinkMessage, planChangeFeedback } from "../plan-change.ts";
import { accountEventEmail } from "../email/templates.ts";

function world(opts: { status?: string; session?: string | null; expireFails?: boolean; afterExpire?: string; invoiceFails?: boolean } = {}) {
  const row: MarkPaidChange & { marked_paid_by?: string; marked_paid_at?: string } = { id: 7, tenant_id: 4, status: opts.status ?? "pending_payment", setup_diff_pence: 150000, checkout_session_id: opts.session === undefined ? "cs_1" : opts.session };
  let sessionStatus = "open";
  const log: string[] = [];
  const deps: MarkPaidDeps = {
    now: () => new Date("2026-10-24T17:00:00Z"),
    loadChange: async () => ({ ...row }),
    retrieveSession: async (id) => (log.push(`retrieve:${id}`), { id, status: sessionStatus }),
    expireSession: async (id) => {
      log.push(`expire:${id}`);
      if (opts.expireFails) {
        sessionStatus = opts.afterExpire ?? "open";
        throw new Error("nope");
      }
      sessionStatus = "expired";
    },
    claimPaid: async (_id, patch) => {
      log.push("claim");
      if (row.status !== "pending_payment") return false;
      Object.assign(row, { status: "paid" }, patch);
      return true;
    },
    issueInvoice: async () => {
      log.push("invoice");
      if (opts.invoiceFails) throw new Error("stripe down");
      return "in_1";
    },
    afterPaid: async (_id, _t, inv) => void log.push(`after:${inv}`),
  };
  return { row, deps, log, setSession: (s: string) => (sessionStatus = s) };
}

test("Mark as paid: owner only, enforced in the flow", async () => {
  for (const role of [null, "staff", "manager", "admin"]) {
    const w = world();
    const r = await markPaidOffline(w.deps, { changeId: 7, role, email: "a@forecourt.me" });
    assert.deepEqual(r, { ok: false, message: MARK_PAID_OWNER_ONLY });
    assert.deepEqual(w.log, [], `${role} touched nothing`);
  }
});

test("Mark as paid: closes the open page, claims once, records who and when, then the webhook steps", async () => {
  const w = world();
  const r = await markPaidOffline(w.deps, { changeId: 7, role: "owner", email: "owner@forecourt.me" });
  assert.equal(r.ok, true);
  assert.deepEqual(w.log, ["retrieve:cs_1", "expire:cs_1", "claim", "invoice", "after:in_1"]);
  assert.equal(w.row.status, "paid");
  assert.equal(w.row.marked_paid_by, "owner@forecourt.me");
  assert.equal(w.row.marked_paid_at, "2026-10-24T17:00:00.000Z");
});

test("Mark as paid: a card payment that already went through wins", async () => {
  const w = world();
  w.setSession("complete");
  const r = await markPaidOffline(w.deps, { changeId: 7, role: "owner", email: "o@f.me" });
  assert.equal(r.ok, false);
  assert.match(r.message, /just paid by card/);
  assert.ok(!w.log.includes("claim"));
});

test("Mark as paid: if the page cannot be closed and is still open, nothing is marked", async () => {
  const w = world({ expireFails: true, afterExpire: "open" });
  const r = await markPaidOffline(w.deps, { changeId: 7, role: "owner", email: "o@f.me" });
  assert.equal(r.ok, false);
  assert.ok(!w.log.includes("claim"));
  const w2 = world({ expireFails: true, afterExpire: "complete" });
  assert.match((await markPaidOffline(w2.deps, { changeId: 7, role: "owner", email: "o@f.me" })).ok ? "" : "card", /card/);
  assert.ok(!w2.log.includes("claim"));
});

test("Mark as paid: refuses anything not pending, and twice in a row is a no op", async () => {
  for (const status of ["paid", "requested", "cancelled", "scheduled"]) {
    const w = world({ status });
    assert.equal((await markPaidOffline(w.deps, { changeId: 7, role: "owner", email: "o@f.me" })).ok, false);
    assert.ok(!w.log.includes("claim"));
  }
  const w = world();
  assert.equal((await markPaidOffline(w.deps, { changeId: 7, role: "owner", email: "o@f.me" })).ok, true);
  assert.equal((await markPaidOffline(w.deps, { changeId: 7, role: "owner", email: "o@f.me" })).ok, false);
  assert.equal(w.log.filter((l) => l.startsWith("after")).length, 1);
});

test("Mark as paid: an invoice failure never blocks the move", async () => {
  const w = world({ invoiceFails: true });
  const r = await markPaidOffline(w.deps, { changeId: 7, role: "owner", email: "o@f.me" });
  assert.equal(r.ok, true);
  assert.ok(w.log.includes("after:null"));
});

test("no double processing: a later Stripe paid event finds it paid and does nothing", async () => {
  let afterPaid = 0;
  const r = await markRequestPaid(
    { load: async () => ({ id: 7, tenant_id: 4, status: "paid", setup_diff_pence: 150000 }), claimPaid: async () => true, afterPaid: async () => void afterPaid++ },
    { id: "cs_1", payment_status: "paid", amount_total: 150000, metadata: { change_id: "7", tenant_id: "4" } },
  );
  assert.equal(r.body, "plan change already paid");
  assert.equal(afterPaid, 0);
});

test("Office starts carry started_from, and their expiry keeps the request", () => {
  const p = upgradeCheckoutParams({ tenantId: 4, changeId: 7, from: "site", to: "group", setupDiffPence: 150000, successUrl: "https://x/account?tab=billing&plan_change=paid", cancelUrl: "https://x/account?tab=billing", startedFrom: "office" });
  assert.equal(p.metadata.started_from, "office");
  assert.equal(keepOnExpiry(p.metadata), true);
  const c = upgradeCheckoutParams({ tenantId: 4, changeId: 7, from: "site", to: "group", setupDiffPence: 150000, successUrl: "s", cancelUrl: "c" });
  assert.equal("started_from" in c.metadata, false);
  assert.equal(keepOnExpiry(c.metadata), false, "customer starts are unchanged");
});

test("payment link email: Forecourt subject, neutral buttons, hello@ copy, link to the checkout", () => {
  const e = planChangeEmail({ changeId: 7, from: "site", to: "group", stage: "payment_link", setupPence: 150000, newMonthlyPence: 89800, payUrl: "https://checkout.stripe.com/c/pay/cs_1" });
  assert.equal(e.office, true);
  assert.deepEqual(e.link, { url: "https://checkout.stripe.com/c/pay/cs_1", label: "Pay the setup difference" });
  assert.equal(e.dedupe, "plan-change:7:payment_link");
  const all = [e.title, ...e.lines].join(" ");
  assert.doesNotMatch(all, /[\u2013\u2014]|·|Seats?\b/);
  assert.match(all, /£1,500 \(inc\. VAT\)/);
  const mail = accountEventEmail({ firstName: "Sam", dealer: "Harbourline Cars", title: e.title, lines: e.lines, accountUrl: "https://forecourt.me/account", link: e.link });
  assert.match(mail.subject, /^Forecourt: /);
  assert.doesNotMatch(mail.html, /#D9A24B|#d9a24b/, "no amber button");
});

test("Office copy: the outcome reads Awaiting customer payment, the confirm sheet says who is recorded", () => {
  const fb = planChangeFeedback({ outcome: "awaiting_customer", message: officePaymentLinkMessage({ to: "group", setupDiffPence: 150000 }, true) }, "group");
  assert.equal(fb.title, "Awaiting customer payment");
  assert.equal(fb.tone, "pending");
  assert.match(fb.body, /hello@/);
  const sheet = markPaidSheet({ from: "Site", to: "Group", setupDiffPence: 150000 });
  assert.match(sheet.body, /records you and the time/);
  for (const s of [fb.body, sheet.title, sheet.body, officePaymentLinkMessage({ to: "group", setupDiffPence: 150000 }, false)]) assert.doesNotMatch(s, /[\u2013\u2014]|·/);
});

test("server wiring: office starts never redirect staff, mark paid checks the owner on the server", () => {
  const src = readFileSync("src/lib/server/plan-change-server.ts", "utf8");
  assert.match(src, /reply\("awaiting_customer", officePaymentLinkMessage\([^)]*\), null\)/);
  assert.match(src, /role: who\.role \?\? null/);
  assert.match(src, /if \(keepOnExpiry\(session\.metadata\)\)/);
  const sql = readFileSync("supabase/plan-change-office-pay.sql", "utf8");
  for (const c of ["started_from", "marked_paid_by", "marked_paid_at"]) assert.match(sql, new RegExp(`add column if not exists ${c}`));
});

test("Atlas: office-started step 1 says Change set up, customer-started keeps You asked", async () => {
  const { trackerFor, paymentNeeded } = await import("../migration.ts");
  const row = { id: 1, from_plan: "site", to_plan: "group", status: "pending_payment", migration_stage: "requested", created_at: "2026-10-24T09:00:00Z", direction: "up", setup_diff_pence: 150000, new_monthly_pence: 49800 };
  const office = trackerFor({ ...row, started_from: "office" })!;
  assert.equal(office.steps[0]!.title, "Change set up");
  assert.equal(office.steps[0]!.line, "The Forecourt team set up your move to Group.");
  assert.doesNotMatch(office.steps[0]!.line, /You asked/);
  const own = trackerFor(row)!;
  assert.equal(own.steps[0]!.title, "Change requested");
  assert.equal(own.steps[0]!.line, "You asked to move to Group.");
  assert.equal(paymentNeeded(office), true);
  assert.equal(paymentNeeded(trackerFor({ ...row, status: "paid" })), false);
  assert.equal(paymentNeeded(trackerFor({ ...row, setup_diff_pence: 0 })), false);
  assert.equal(paymentNeeded(null), false);
});

test("Atlas: Mark as paid confirm is the neutral primary, payment link email says To get it started", async () => {
  const sheet = markPaidSheet({ from: "Site", to: "Group", setupDiffPence: 150000 });
  assert.equal(sheet.tone, "neutral");
  assert.equal(sheet.confirmLabel, "Mark as paid");
  const { planChangeEmail } = await import("../plan-change-emails.ts");
  const e = planChangeEmail({ changeId: 1, from: "site", to: "group", stage: "payment_link", setupPence: 150000, newMonthlyPence: 49800, payUrl: "https://example.test/pay" } as never);
  const text = e.lines.join(" ");
  assert.match(text, /To get it started, pay the setup difference of £1,500 \(inc\. VAT\)\./);
  assert.doesNotMatch(text, /send it ahead/);
});

test("Atlas: Payment needed chips on the plan card and the Plan menu item, no banner", () => {
  const src = readFileSync("src/components/account/live-view.tsx", "utf8");
  assert.match(src, /data-testid="plan-card-payment-needed"/);
  assert.match(src, /data-testid="plan-menu-payment-needed"/);
  assert.match(src, /paymentNeeded\(migration\)/);
  assert.match(src, /href="#plan-change-tracker"/);
  assert.doesNotMatch(src, /payment-needed-banner/);
});
