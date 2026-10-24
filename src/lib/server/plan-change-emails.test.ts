import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planChangeEmail, planChangeKey, PLAN_CHANGE_EMAIL_STAGES } from "../plan-change-emails.ts";
import { appliedStage, invoiceUrl, notify, sendReminderOnce, type ChangeRow, type SendFn } from "./plan-change-notify.ts";
import { accountEventEmail } from "../email/templates.ts";

const base = { changeId: 88, from: "site" as const, to: "franchise" as const, setupPence: 200_000, newMonthlyPence: 89_900 };
const row: ChangeRow = { id: 88, tenant_id: 12, from_plan: "site", to_plan: "franchise", setup_diff_pence: 200_000, new_monthly_pence: 89_900, reminder_sent_at: null };
const mock = () => {
  const sent: Parameters<SendFn>[0][] = [];
  const send: SendFn = async (ev) => {
    sent.push(ev);
  };
  return { sent, send };
};

test("every stage: no dashes, no glass, inc. VAT on prices, keyed to the request", () => {
  for (const stage of PLAN_CHANGE_EMAIL_STAGES) {
    const e = planChangeEmail({ ...base, stage, periodEnd: "2026-11-30T00:00:00Z", goLiveAt: "2026-10-24T13:00:00Z", invoiceUrl: "https://invoice.stripe.com/i/x", refunded: true, atPeriodEnd: true });
    const all = [e.title, ...e.lines].join(" ");
    assert.doesNotMatch(all, /[-\u2013\u2014]/, `${stage} has a dash: ${all}`);
    assert.doesNotMatch(all, /glass/i);
    for (const m of all.match(/£[\d,.]+/g) ?? []) assert.match(all, new RegExp(`${m.replace(/[.$]/g, "\\$&")}( a month)? \\(inc\\. VAT\\)`), `${stage}: ${m} without inc. VAT`);
    assert.equal(e.dedupe, planChangeKey(88, stage));
    assert.equal(e.dedupe, `plan-change:88:${stage}`);
  }
});

test("hello@ copies go with requests and payments only", () => {
  const office = PLAN_CHANGE_EMAIL_STAGES.filter((s) => planChangeEmail({ ...base, stage: s }).office);
  assert.deepEqual(office, ["received", "receipt"]);
});

test("UK dates", () => {
  const e = planChangeEmail({ ...base, stage: "scheduled", periodEnd: "2026-11-30T00:00:00Z" });
  assert.match(e.lines.join(" "), /on 30 Nov 2026/);
  const a = planChangeEmail({ ...base, stage: "applied", goLiveAt: "2026-10-24T13:00:00Z" });
  assert.equal(a.lines[1], "Your new price of £899 a month (inc. VAT) started on 24 Oct 2026, the day your change went live. The part month is added to your next bill.");
});

test("receipt links the Checkout invoice and shows the setup difference", () => {
  const e = planChangeEmail({ ...base, stage: "receipt", invoiceUrl: "https://invoice.stripe.com/i/x" });
  assert.match(e.lines[0], /£2,000 \(inc\. VAT\)/);
  assert.deepEqual(e.link, { url: "https://invoice.stripe.com/i/x", label: "View your invoice" });
  const html = accountEventEmail({ firstName: "Matt", dealer: "Kelso Autos", title: e.title, lines: e.lines, accountUrl: "https://www.forecourt.me/account", link: e.link }).html;
  assert.match(html, /invoice\.stripe\.com\/i\/x/);
  assert.match(html, /View your invoice/);
  assert.doesNotMatch(html, /#d9a24b/i, "no amber button");
  const subj = accountEventEmail({ firstName: null, dealer: "Kelso Autos", title: e.title, lines: e.lines, accountUrl: "https://x" }).subject;
  assert.equal(subj, "Forecourt: Payment received for your plan change");
  assert.equal(planChangeEmail({ ...base, stage: "receipt" }).link, undefined);
});

test("received: a drop names the period end, a £0 request does not", () => {
  const drop = planChangeEmail({ ...base, stage: "received", atPeriodEnd: true, periodEnd: "2026-11-30T00:00:00Z" });
  assert.match(drop.lines[1], /starts at the end of this billing period, on 30 Nov 2026/);
  const zero = planChangeEmail({ ...base, stage: "received" });
  assert.match(zero.lines[1], /nothing to pay/i);
  assert.doesNotMatch(zero.lines[1], /billing period/);
  assert.equal(zero.lines[2], "Your new price of £899 a month (inc. VAT) starts from the day your change goes live. The part month is added to your next bill.");
  assert.equal(drop.lines.length, 3);
});

test("rejected: refunded or nothing charged", () => {
  assert.match(planChangeEmail({ ...base, stage: "rejected", refunded: true }).lines[1], /refunded the setup difference of £2,000/);
  assert.equal(planChangeEmail({ ...base, stage: "rejected", refunded: false }).lines[1], "Nothing was charged.");
});

test("reminder is sent ONCE: reminder_sent_at claim wins once", async () => {
  const { sent, send } = mock();
  let claimed = false;
  const claimReminder = async () => {
    if (claimed) return false;
    claimed = true;
    return true;
  };
  assert.equal(await sendReminderOnce({ claimReminder, send }, row), "sent");
  assert.equal(await sendReminderOnce({ claimReminder, send }, row), "already");
  assert.equal(await sendReminderOnce({ claimReminder, send }, { ...row, reminder_sent_at: "2026-10-24T00:00:00Z" }), "already");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].dedupe, "plan-change:88:reminder");
  assert.equal(sent[0].office, false);
  assert.equal(sent[0].tenantId, 12);
});

test("no reminder when nothing was owed", async () => {
  const { sent, send } = mock();
  assert.equal(await sendReminderOnce({ claimReminder: async () => true, send }, { ...row, setup_diff_pence: 0 }), "nothing_owed");
  assert.equal(sent.length, 0);
});

test("a failed send never throws", async () => {
  assert.equal(await notify(async () => { throw new Error("resend down"); }, 12, { ...base, stage: "applied" }), false);
});

test("invoice link: hosted URL, or null without Stripe or on error", async () => {
  assert.equal(await invoiceUrl(async () => ({ hosted_invoice_url: "https://invoice.stripe.com/i/y" }), "in_1"), "https://invoice.stripe.com/i/y");
  assert.equal(await invoiceUrl(null, "in_1"), null);
  assert.equal(await invoiceUrl(async () => ({}), null), null);
  assert.equal(await invoiceUrl(async () => { throw new Error("x"); }, "in_1"), null);
});

test("apply sends applied for a rise and scheduled for a drop", () => {
  assert.equal(appliedStage("on_go_live"), "applied");
  assert.equal(appliedStage("period_end"), "scheduled");
});

test("wiring: each email is sent from its moment", () => {
  const srv = readFileSync(new URL("./plan-change-server.ts", import.meta.url), "utf8");
  const staff = readFileSync(new URL("./plan-change-staff.ts", import.meta.url), "utf8");
  assert.match(srv, /stage: "received"/);
  assert.match(srv, /"receipt", \{ invoiceUrl: url \}/);
  assert.match(srv, /sendReminderOnce\(/);
  assert.match(srv, /\.is\("reminder_sent_at", null\)/);
  assert.match(staff, /appliedStage\(move\.monthlyStarts\)/);
  assert.match(staff, /stage: "rejected"/);
});

test("drop emails say the plan switches when the team applies it, only the price waits", () => {
  const base = { changeId: 5, from: "franchise", to: "site", newMonthlyPence: 39900, periodEnd: "2026-11-14T00:00:00Z" } as const;
  const done = planChangeEmail({ ...base, stage: "scheduled" });
  assert.equal(done.title, "Your move to Site is done");
  assert.equal(done.lines[0], "Your account is now on Site. Your new price of £399 a month (inc. VAT) starts at the end of this billing period, on 14 Nov 2026.");
  const got = planChangeEmail({ ...base, stage: "received", atPeriodEnd: true });
  assert.match(got.lines.join(" "), /Your plan switches when the team applies your change\./);
  for (const m of [done, got]) assert.doesNotMatch(m.lines.join(" "), /[–—]|glass/i);
});
