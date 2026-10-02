/** Refund sends back the setup payment, never the newest monthly payment. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { findSetupPayment, refundConfirmText, type InvoicePaymentLike, type RefundDeps } from "./refund-target.ts";

const gbp = (p: number) => `£${(p / 100).toLocaleString("en-GB")}`;

function deps(over: Partial<RefundDeps> = {}): RefundDeps & { asked: string[] } {
  const asked: string[] = [];
  const payments: Record<string, InvoicePaymentLike[]> = {
    in_setup: [{ status: "paid", amount_paid: 450_000, payment: { type: "payment_intent", payment_intent: "pi_setup" } }],
    in_month: [{ status: "paid", amount_paid: 39_900, payment: { type: "payment_intent", payment_intent: "pi_month" } }],
  };
  return {
    asked,
    sessions: [],
    subscriptionId: null,
    listInvoices: async (sub) => {
      asked.push(`invoices:${sub}`);
      // Newest first, as Stripe lists them: the £399 after go live comes first.
      return [
        { id: "in_month", billing_reason: "subscription_cycle", amount_paid: 39_900 },
        { id: "in_setup", billing_reason: "subscription_create", amount_paid: 450_000 },
      ];
    },
    listInvoicePayments: async (inv) => {
      asked.push(`payments:${inv}`);
      return payments[inv] ?? [];
    },
    ...over,
  };
}

test("after go live, refund picks the setup invoice payment from the checkout, not the £399", async () => {
  const d = deps({
    sessions: [{ id: "cs_1", mode: "subscription", payment_status: "paid", payment_intent: null, invoice: "in_setup" }],
    subscriptionId: "sub_1",
  });
  const t = await findSetupPayment(d);
  assert.deepEqual(t, {
    paymentIntent: "pi_setup",
    amountPence: 450_000,
    label: "the setup payment (first invoice)",
    sessionId: "cs_1",
    invoiceId: "in_setup",
  });
  assert.equal(
    refundConfirmText(t, gbp),
    "Refund £4,500, the setup payment (first invoice), through Stripe and end this package? Monthly payments are not refunded.",
  );
});

test("with no session on record, the subscription's first invoice is used", async () => {
  const t = await findSetupPayment(deps({ subscriptionId: "sub_1" }));
  assert.equal(t?.paymentIntent, "pi_setup");
  assert.equal(t?.amountPence, 450_000);
  assert.equal(t?.sessionId, null);
});

test("a 60-day trial refunds its own checkout payment", async () => {
  const t = await findSetupPayment(
    deps({ sessions: [{ id: "cs_t", mode: "payment", payment_status: "paid", payment_intent: "pi_trial", amount_total: 150_000 }] }),
  );
  assert.equal(t?.paymentIntent, "pi_trial");
  assert.equal(t?.amountPence, 150_000);
  assert.equal(t?.label, "the checkout payment");
});

test("unpaid sessions are skipped and there is no newest-payment fallback", async () => {
  const d = deps({
    sessions: [{ id: "cs_open", mode: "subscription", payment_status: "unpaid", invoice: "in_setup" }],
  });
  assert.equal(await findSetupPayment(d), null);
  assert.equal(d.asked.length, 0);
  assert.match(refundConfirmText(null, gbp), /No setup payment found/);
});
