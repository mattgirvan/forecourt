/**
 * Which card payment a staff Refund sends back.
 *
 * Refund is for the SETUP: the one-off payment taken at checkout. After go
 * live a site also has monthly payments, and the newest payment is then the
 * £399, so "refund the latest payment" would return the wrong money. This
 * looks the setup payment up explicitly:
 * - a payment-mode checkout (the 60-day trial) carries its own payment intent;
 * - a subscription checkout puts the setup on the subscription's first
 *   invoice, so we refund the payment on that invoice.
 * There is deliberately no "newest payment" fallback.
 *
 * Pure (no framework or `@/` imports) so it can be unit tested with node --test.
 */

export type SessionLike = {
  id: string;
  mode: string;
  payment_status: string;
  payment_intent?: string | null;
  invoice?: string | null;
  subscription?: string | null;
  amount_total?: number | null;
};

export type InvoiceLike = { id: string; billing_reason?: string | null; amount_paid?: number | null };

export type InvoicePaymentLike = {
  status: string;
  amount_paid?: number | null;
  payment?: { type?: string; payment_intent?: string | null } | null;
};

export type RefundDeps = {
  /** Checkout sessions on this file, newest first. */
  sessions: SessionLike[];
  subscriptionId?: string | null;
  listInvoices: (subscriptionId: string) => Promise<InvoiceLike[]>;
  listInvoicePayments: (invoiceId: string) => Promise<InvoicePaymentLike[]>;
};

export type RefundTarget = {
  paymentIntent: string;
  amountPence: number;
  /** What the payment was, for the staff confirm and the success message. */
  label: string;
  sessionId: string | null;
  invoiceId: string | null;
};

async function paidOnInvoice(deps: RefundDeps, invoiceId: string) {
  const payments = await deps.listInvoicePayments(invoiceId);
  const paid = payments.find((p) => p.status === "paid" && p.payment?.payment_intent);
  if (!paid?.payment?.payment_intent) return null;
  return { paymentIntent: paid.payment.payment_intent, amountPence: paid.amount_paid ?? 0 };
}

export async function findSetupPayment(deps: RefundDeps): Promise<RefundTarget | null> {
  for (const s of deps.sessions) {
    if (s.payment_status !== "paid") continue;
    if (s.mode === "payment" && s.payment_intent) {
      return {
        paymentIntent: s.payment_intent,
        amountPence: s.amount_total ?? 0,
        label: "the checkout payment",
        sessionId: s.id,
        invoiceId: null,
      };
    }
    if (s.mode === "subscription" && s.invoice) {
      const hit = await paidOnInvoice(deps, s.invoice);
      if (hit) return { ...hit, label: "the setup payment (first invoice)", sessionId: s.id, invoiceId: s.invoice };
    }
  }
  // Older files: no session on record, but the subscription's first invoice
  // is the one that carried the setup line.
  if (deps.subscriptionId) {
    const invoices = await deps.listInvoices(deps.subscriptionId);
    const first = invoices.find((i) => i.billing_reason === "subscription_create" && (i.amount_paid ?? 0) > 0);
    if (first) {
      const hit = await paidOnInvoice(deps, first.id);
      if (hit) return { ...hit, label: "the setup payment (first invoice)", sessionId: null, invoiceId: first.id };
    }
  }
  return null;
}

export function refundConfirmText(target: RefundTarget | null, formatPence: (p: number) => string): string {
  if (!target) {
    return "No setup payment found on this file, so nothing can be refunded from here. Refund in Stripe by hand if they paid.";
  }
  return `Refund ${formatPence(target.amountPence)}, ${target.label}, through Stripe and end this package? Monthly payments are not refunded.`;
}
