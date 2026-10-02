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
  /** Our checkout metadata: kind (trial, subscription, convert) and monthly_from (checkout, go_live). */
  metadata?: { kind?: string | null; monthly_from?: string | null } | null;
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

/** What exactly the refunded payment paid for. */
export type RefundCovers = "trial" | "setup" | "setup_and_first_month" | "first_invoice";

export type RefundTarget = {
  paymentIntent: string;
  amountPence: number;
  /** What the payment was, for the staff confirm and the success message. */
  label: string;
  covers: RefundCovers;
  /** The payment that converted a paid trial (the trial fee was a separate payment). */
  conversion: boolean;
  /** The earlier trial payment, when this file converted from one. Not refunded here. */
  trialPence: number | null;
  sessionId: string | null;
  invoiceId: string | null;
};

function labelFor(covers: RefundCovers, conversion: boolean) {
  switch (covers) {
    case "trial":
      return "the 60-day trial payment";
    case "setup":
      return conversion ? "the remaining setup, paid when they converted from the trial" : "the setup payment";
    case "setup_and_first_month":
      return conversion
        ? "the remaining setup and the first month, paid when they converted from the trial"
        : "the setup and the first month";
    default:
      return "the first invoice on the subscription";
  }
}

async function paidOnInvoice(deps: RefundDeps, invoiceId: string) {
  const payments = await deps.listInvoicePayments(invoiceId);
  const paid = payments.find((p) => p.status === "paid" && p.payment?.payment_intent);
  if (!paid?.payment?.payment_intent) return null;
  return { paymentIntent: paid.payment.payment_intent, amountPence: paid.amount_paid ?? 0 };
}

export async function findSetupPayment(deps: RefundDeps): Promise<RefundTarget | null> {
  const paid = deps.sessions.filter((s) => s.payment_status === "paid");
  // An earlier paid trial (payment mode) on a file that later subscribed.
  const trialSession = (newer: SessionLike) =>
    paid.slice(paid.indexOf(newer) + 1).find((s) => s.mode === "payment" && s.metadata?.kind !== "subscription");
  for (const s of paid) {
    if (s.mode === "payment" && s.payment_intent) {
      return {
        paymentIntent: s.payment_intent,
        amountPence: s.amount_total ?? 0,
        label: labelFor("trial", false),
        covers: "trial",
        conversion: false,
        trialPence: null,
        sessionId: s.id,
        invoiceId: null,
      };
    }
    if (s.mode === "subscription" && s.invoice) {
      const hit = await paidOnInvoice(deps, s.invoice);
      if (!hit) continue;
      const trial = trialSession(s);
      const conversion = s.metadata?.kind === "convert" || Boolean(trial);
      const covers: RefundCovers = s.metadata?.monthly_from === "checkout" ? "setup_and_first_month" : "setup";
      return {
        ...hit,
        label: labelFor(covers, conversion),
        covers,
        conversion,
        trialPence: trial ? (trial.amount_total ?? null) : null,
        sessionId: s.id,
        invoiceId: s.invoice,
      };
    }
  }
  // Older files: no session on record, but the subscription's first invoice
  // is the one that carried the setup line.
  if (deps.subscriptionId) {
    const invoices = await deps.listInvoices(deps.subscriptionId);
    const first = invoices.find((i) => i.billing_reason === "subscription_create" && (i.amount_paid ?? 0) > 0);
    if (first) {
      const hit = await paidOnInvoice(deps, first.id);
      if (hit) {
        return {
          ...hit,
          label: labelFor("first_invoice", false),
          covers: "first_invoice",
          conversion: false,
          trialPence: null,
          sessionId: null,
          invoiceId: first.id,
        };
      }
    }
  }
  return null;
}

/** The staff confirm. Says exactly what goes back, and what does not. */
export function refundConfirmText(target: RefundTarget | null, formatPence: (p: number) => string): string {
  if (!target) {
    return "No setup payment found on this file, so nothing can be refunded from here. Refund in Stripe by hand if they paid.";
  }
  const parts = [`Refund ${formatPence(target.amountPence)}, ${target.label}, through Stripe and end this package?`];
  switch (target.covers) {
    case "trial":
      break;
    case "setup":
      parts.push("No monthly payments are refunded.");
      break;
    case "setup_and_first_month":
      parts.push("That includes the first month. Later monthly payments are not refunded.");
      break;
    default:
      parts.push("That is the setup, plus the first month if it was charged at checkout. Later monthly payments are not refunded.");
  }
  if (target.conversion) {
    parts.push(
      `The ${target.trialPence ? `${formatPence(target.trialPence)} ` : ""}trial payment they made before converting is separate and is not refunded here. Refund it in Stripe by hand if you need to.`,
    );
  }
  return parts.join(" ");
}
