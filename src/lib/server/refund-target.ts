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

// ---------------------------------------------------------------- whose payment is it

/** Title of the staff flag written when a second payment lands (payments.ts). */
export const DUPLICATE_FLAG_TITLE = "Second payment for a site that is already paid for";

const SESSION_ID_RE = /\bcs_(?:live|test)_[A-Za-z0-9]+\b/g;

/** Stripe Checkout session ids named in a piece of text (a flag or link note). */
export function sessionIdsIn(text: string | null | undefined): string[] {
  return [...(text ?? "").matchAll(SESSION_ID_RE)].map((m) => m[0]);
}

/**
 * Checkout sessions named in "Second payment" flags on the file: those are
 * the duplicates. The flag names the duplicate first ("Order #9 was paid
 * (Stripe session cs_..."); the order number is used too, via its session.
 */
export function flaggedDuplicateSessions(
  events: { title?: string | null; body?: string | null }[],
  orders: { id: number; stripe_session_id?: string | null }[] = [],
): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (e.title !== DUPLICATE_FLAG_TITLE) continue;
    const first = sessionIdsIn(e.body)[0];
    if (first) out.add(first);
    const orderId = Number(/^Order #(\d+) was paid/.exec(e.body ?? "")?.[1]);
    const sid = orders.find((o) => o.id === orderId)?.stripe_session_id;
    if (sid) out.add(sid);
  }
  return out;
}

export type OwnSessionLike = {
  id: string;
  mode: string;
  payment_status: string;
  /** Unix seconds. */
  created?: number | null;
  /** Checkout metadata kind: trial, subscription, convert, balance. */
  kind?: string | null;
};

function ukDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}

/**
 * Which paid checkouts belong to the site's current package. Office Refund
 * and Resume order both use this, so they always agree.
 * - A checkout named in a "Second payment" flag is a duplicate.
 * - A package that was refunded or cancelled is over: checkouts from before
 *   the last end that came ahead of the newest purchase belong to that old
 *   package (a refunded trial that buys again is a new package).
 * - Within one package a site pays one trial fee; a second is a duplicate.
 * The site's subscription id plays no part, so a subscription Resume set up
 * never makes the original setup look like a duplicate.
 */
export function ownSessions<T extends OwnSessionLike>(
  sessions: T[],
  opts: { duplicateSessionIds?: Iterable<string>; endedAt?: (number | null | undefined)[] } = {},
): { own: T[]; skipped: { id: string; reason: string }[] } {
  const dupes = new Set(opts.duplicateSessionIds ?? []);
  const ends = (opts.endedAt ?? []).filter((n): n is number => typeof n === "number" && Number.isFinite(n)).sort((a, b) => a - b);
  const skipped: { id: string; reason: string }[] = [];
  const paid: T[] = [];
  for (const s of [...sessions].sort((a, b) => (a.created ?? 0) - (b.created ?? 0))) {
    if (s.payment_status !== "paid") skipped.push({ id: s.id, reason: "not paid" });
    else if (dupes.has(s.id)) skipped.push({ id: s.id, reason: "duplicate payment (flagged on the file)" });
    else paid.push(s);
  }
  const purchases = paid.filter((s) => s.kind !== "balance");
  const newest = purchases[purchases.length - 1];
  const cutoff = newest ? [...ends].reverse().find((t) => t < (newest.created ?? 0)) : undefined;
  const own: T[] = [];
  let trialSeen = false;
  for (const s of paid) {
    if (cutoff !== undefined && (s.created ?? 0) < cutoff) {
      skipped.push({ id: s.id, reason: `from an earlier package that was ended on ${ukDate(cutoff)}` });
      continue;
    }
    const trial = s.mode === "payment" && s.kind !== "balance" && s.kind !== "subscription";
    if (trial) {
      if (trialSeen) {
        skipped.push({ id: s.id, reason: "second trial fee in the same package (duplicate payment)" });
        continue;
      }
      trialSeen = true;
    }
    own.push(s);
  }
  return { own, skipped };
}
