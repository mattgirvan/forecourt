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
    label: "the setup payment",
    covers: "setup",
    conversion: false,
    trialPence: null,
    sessionId: "cs_1",
    invoiceId: "in_setup",
  });
  assert.equal(
    refundConfirmText(t, gbp),
    "Refund £4,500, the setup payment, through Stripe and end this package? No monthly payments are refunded.",
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
  assert.equal(t?.label, "the 60-day trial payment");
  assert.equal(refundConfirmText(t, gbp), "Refund £1,500, the 60-day trial payment, through Stripe and end this package?");
});

test("unpaid sessions are skipped and there is no newest-payment fallback", async () => {
  const d = deps({
    sessions: [{ id: "cs_open", mode: "subscription", payment_status: "unpaid", invoice: "in_setup" }],
  });
  assert.equal(await findSetupPayment(d), null);
  assert.equal(d.asked.length, 0);
  assert.match(refundConfirmText(null, gbp), /No setup payment found/);
});

const convertPayments: Record<string, InvoicePaymentLike[]> = {
  in_conv: [{ status: "paid", amount_paid: 300_000, payment: { payment_intent: "pi_conv" } }],
  in_conv_live: [{ status: "paid", amount_paid: 339_900, payment: { payment_intent: "pi_conv_live" } }],
};
const trialSession = { id: "cs_trial", mode: "payment", payment_status: "paid", payment_intent: "pi_trial", amount_total: 150_000, metadata: { kind: "trial" } };

test("a live trial conversion: the confirm says the £3,399 includes the first month", async () => {
  const t = await findSetupPayment(
    deps({
      sessions: [
        { id: "cs_conv", mode: "subscription", payment_status: "paid", invoice: "in_conv_live", metadata: { kind: "convert", monthly_from: "checkout" } },
        trialSession,
      ],
      listInvoicePayments: async (inv) => convertPayments[inv] ?? [],
    }),
  );
  assert.equal(t?.paymentIntent, "pi_conv_live");
  assert.equal(t?.covers, "setup_and_first_month");
  const text = refundConfirmText(t, gbp);
  assert.match(text, /^Refund £3,399, the remaining setup and the first month, paid when they converted from the trial,/);
  assert.match(text, /That includes the first month\. Later monthly payments are not refunded\./);
  assert.doesNotMatch(text, /No monthly payments are refunded/);
});

test("a converted trial: the confirm says plainly the £1,500 trial payment is not refunded", async () => {
  const t = await findSetupPayment(
    deps({
      sessions: [
        { id: "cs_conv", mode: "subscription", payment_status: "paid", invoice: "in_conv", metadata: { kind: "convert", monthly_from: "go_live" } },
        trialSession,
      ],
      listInvoicePayments: async (inv) => convertPayments[inv] ?? [],
    }),
  );
  assert.equal(t?.paymentIntent, "pi_conv", "the conversion payment, not the trial");
  assert.equal(t?.conversion, true);
  assert.equal(t?.trialPence, 150_000);
  assert.equal(
    refundConfirmText(t, gbp),
    "Refund £3,000, the remaining setup, paid when they converted from the trial, through Stripe and end this package? No monthly payments are refunded. The £1,500 trial payment they made before converting is separate and is not refunded here. Refund it in Stripe by hand if you need to.",
  );
});

test("an older file with no session: the first invoice is described honestly", async () => {
  const t = await findSetupPayment(deps({ subscriptionId: "sub_1" }));
  assert.equal(t?.covers, "first_invoice");
  assert.match(refundConfirmText(t, gbp), /the first invoice on the subscription.*plus the first month if it was charged at checkout/);
});
