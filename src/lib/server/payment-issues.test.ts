import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAYMENT_FAILED_TITLE,
  PAYMENT_RECOVERED_TITLE,
  handleInvoiceEvent,
  invoiceFacts,
  isInvoiceEvent,
  type IssueFlag,
  type PaymentIssueStore,
} from "./payment-issues.ts";
import { boardFlags } from "./payments.ts";
import { paymentFailedEmail } from "../email/templates.ts";

const NOW = new Date("2026-10-23T12:00:00Z");

function store(opts: { tenantFor?: number | null; table?: boolean; failureNote?: boolean } = {}) {
  const open = new Set<string>();
  const calls: string[] = [];
  const s: PaymentIssueStore = {
    async tenantIdForSubscription() {
      return opts.tenantFor === undefined ? 5 : opts.tenantFor;
    },
    async recordFailure(_t, f) {
      calls.push(`fail:${f.invoiceId}:${f.attemptCount}`);
      if (opts.table === false) return false;
      open.add(f.invoiceId);
      return true;
    },
    async recordRecovery(_t, id) {
      if (opts.table === false) return "unknown";
      if (!open.has(id)) return "none";
      open.delete(id);
      return "closed";
    },
    async hasFailureNote() {
      return Boolean(opts.failureNote);
    },
  };
  return { s, open, calls };
}

function deps(s: PaymentIssueStore) {
  const flags: IssueFlag[] = [];
  const mailed: string[] = [];
  return {
    flags,
    mailed,
    d: {
      issues: s,
      flagForStaff: async (f: IssueFlag) => void flags.push(f),
      notifyCustomer: async (_t: number, f: { invoiceId: string }) => void mailed.push(f.invoiceId),
      log: { error() {}, warn() {} },
      now: NOW,
    },
  };
}

const inv = (o: Record<string, unknown> = {}) => ({
  id: "in_1",
  parent: { subscription_details: { subscription: "sub_1", metadata: { tenant_id: "5" } } },
  amount_due: 39900,
  attempt_count: 1,
  next_payment_attempt: Date.parse("2026-10-26T12:00:00Z") / 1000,
  ...o,
});

test("invoice events are recognised", () => {
  assert.ok(isInvoiceEvent("invoice.payment_failed"));
  assert.ok(isInvoiceEvent("invoice.paid"));
  assert.ok(isInvoiceEvent("invoice.payment_succeeded"));
  assert.ok(!isInvoiceEvent("invoice.created"));
});

test("facts read both the new and old Stripe invoice shapes", () => {
  assert.equal(invoiceFacts(inv())!.subscriptionId, "sub_1");
  const old = invoiceFacts({ id: "in_2", subscription: "sub_9", subscription_details: { metadata: { tenant_id: "3" } } })!;
  assert.equal(old.subscriptionId, "sub_9");
  assert.equal(old.metaTenantId, 3);
  assert.equal(invoiceFacts({}), null);
});

test("a failure flags staff once, records the issue and emails the customer", async () => {
  const { s, open } = store();
  const { d, flags, mailed } = deps(s);
  const r = await handleInvoiceEvent(d, "invoice.payment_failed", inv());
  assert.equal(r.status, 200);
  assert.ok(open.has("in_1"));
  assert.equal(flags[0].title, PAYMENT_FAILED_TITLE);
  assert.equal(flags[0].dedupeKey, "payment-failed:in_1");
  assert.match(flags[0].body, /£399/);
  assert.deepEqual(mailed, ["in_1"]);
});

test("recovery clears the flag only when a failure was open", async () => {
  const { s } = store();
  const { d, flags } = deps(s);
  assert.equal((await handleInvoiceEvent(d, "invoice.paid", inv())).body, "ok");
  assert.equal(flags.length, 0);
  await handleInvoiceEvent(d, "invoice.payment_failed", inv());
  await handleInvoiceEvent(d, "invoice.payment_succeeded", inv());
  await handleInvoiceEvent(d, "invoice.paid", inv());
  assert.deepEqual(flags.map((f) => f.title), [PAYMENT_FAILED_TITLE, PAYMENT_RECOVERED_TITLE]);
});

test("without the table, recovery falls back to the timeline note", async () => {
  const { s } = store({ table: false, failureNote: true });
  const { d, flags } = deps(s);
  const r = await handleInvoiceEvent(d, "invoice.payment_failed", inv());
  assert.equal(r.status, 200);
  await handleInvoiceEvent(d, "invoice.paid", inv());
  assert.equal(flags.at(-1)!.title, PAYMENT_RECOVERED_TITLE);
});

test("non subscription invoices and unknown sites are ignored", async () => {
  const { s } = store({ tenantFor: null });
  const { d, flags } = deps(s);
  assert.match((await handleInvoiceEvent(d, "invoice.payment_failed", { id: "in_x", amount_due: 100 })).body, /not a subscription/);
  assert.match((await handleInvoiceEvent(d, "invoice.payment_failed", inv({ parent: { subscription_details: { subscription: "sub_z" } } }))).body, /no site/);
  assert.equal(flags.length, 0);
});

test("a database error is thrown so the webhook answers 500 and Stripe retries", async () => {
  const { s } = store();
  s.recordFailure = async () => {
    throw new Error("boom");
  };
  const { d } = deps(s);
  await assert.rejects(handleInvoiceEvent(d, "invoice.payment_failed", inv()));
});

test("board badge shows on failure and clears on recovery", () => {
  const ev = (title: string, at: string) => ({ tenant_id: 1, title, body: "", created_at: at });
  assert.equal(boardFlags([ev(PAYMENT_FAILED_TITLE, "2026-10-01")])[1].paymentFailed, true);
  assert.equal(boardFlags([ev(PAYMENT_FAILED_TITLE, "2026-10-01"), ev(PAYMENT_RECOVERED_TITLE, "2026-10-02")])[1].paymentFailed, false);
});

test("customer email is calm: no dashes, no glass, no portal, says Stripe retries and we will be in touch", () => {
  const m = paymentFailedEmail({ firstName: "Sam Smith", dealer: "Northbridge Motors", retryOn: "26 Oct 2026", accountUrl: "https://www.forecourt.me/account" });
  for (const body of [m.subject, m.text, m.html]) assert.doesNotMatch(body, /[\u2013\u2014]|glass|portal/i);
  assert.match(m.text, /Hi Sam,/);
  assert.match(m.text, /try the card again automatically on 26 Oct 2026/);
  assert.match(m.text, /in touch personally/);
  assert.doesNotMatch(m.text, /suspend|overdue|final notice/i);
});
