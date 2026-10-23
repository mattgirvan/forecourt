/**
 * Failed monthly payments: what the Stripe invoice events mean for a site.
 * Kept free of framework and `@/` imports so it can be unit tested with
 * plain `node --test`, like payments.ts.
 *
 * Events handled (enable them on the Stripe webhook endpoint):
 *   invoice.payment_failed     a monthly charge did not go through
 *   invoice.payment_succeeded  a charge went through (recovery after a failure)
 *   invoice.paid               the invoice is settled (also covers paid out of band)
 *
 * We only read Stripe's invoice summary. Card data never passes through here.
 */

export const PAYMENT_FAILED_TITLE = "Monthly payment failed";
export const PAYMENT_RECOVERED_TITLE = "Monthly payment recovered";

export const INVOICE_EVENTS = ["invoice.payment_failed", "invoice.payment_succeeded", "invoice.paid"] as const;
export type InvoiceEventType = (typeof INVOICE_EVENTS)[number];

export function isInvoiceEvent(type: string): type is InvoiceEventType {
  return (INVOICE_EVENTS as readonly string[]).includes(type);
}

type Ref = string | { id?: string | null } | null | undefined;
type Meta = Record<string, string> | null | undefined;

/** The parts of a Stripe invoice we read. Covers the old and new (2025+) API shapes. */
export type InvoiceLike = {
  id?: string | null;
  subscription?: Ref;
  subscription_details?: { metadata?: Meta } | null;
  parent?: { subscription_details?: { subscription?: Ref; metadata?: Meta } | null } | null;
  metadata?: Meta;
  amount_due?: number | null;
  amount_paid?: number | null;
  attempt_count?: number | null;
  next_payment_attempt?: number | null;
  billing_reason?: string | null;
  currency?: string | null;
};

export type InvoiceFacts = {
  invoiceId: string;
  subscriptionId: string | null;
  /** tenant_id from the subscription metadata Checkout set, if any. */
  metaTenantId: number | null;
  amountDuePence: number;
  attemptCount: number;
  /** When Stripe will try again, or null when it has stopped retrying. */
  nextRetryAt: string | null;
};

function refId(r: Ref): string | null {
  if (!r) return null;
  if (typeof r === "string") return r || null;
  return r.id || null;
}

function tenantFrom(meta: Meta): number | null {
  const n = Number(meta?.tenant_id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function invoiceFacts(inv: InvoiceLike): InvoiceFacts | null {
  const invoiceId = inv.id || null;
  if (!invoiceId) return null;
  const subscriptionId = refId(inv.parent?.subscription_details?.subscription) ?? refId(inv.subscription);
  const metaTenantId =
    tenantFrom(inv.parent?.subscription_details?.metadata) ?? tenantFrom(inv.subscription_details?.metadata) ?? tenantFrom(inv.metadata);
  return {
    invoiceId,
    subscriptionId,
    metaTenantId,
    amountDuePence: Math.max(0, Math.round(inv.amount_due ?? 0)),
    attemptCount: Math.max(1, Math.round(inv.attempt_count ?? 1)),
    nextRetryAt: inv.next_payment_attempt ? new Date(inv.next_payment_attempt * 1000).toISOString() : null,
  };
}

/** Database side. Every method may throw; the handler decides what is fatal. */
export interface PaymentIssueStore {
  /** The site whose stored stripe_subscription_id matches, or null. */
  tenantIdForSubscription(subscriptionId: string): Promise<number | null>;
  /** Insert or refresh the open issue for this invoice. False when the table is not there yet. */
  recordFailure(tenantId: number, f: InvoiceFacts, at: Date): Promise<boolean>;
  /**
   * Close the open issue for this invoice. "closed" when this call closed it,
   * "none" when there was nothing open, "unknown" when the table is missing
   * (the caller then checks the timeline instead).
   */
  recordRecovery(tenantId: number, invoiceId: string, at: Date): Promise<"closed" | "none" | "unknown">;
  /** Fallback while the table is missing: is there a failure note for this invoice on the timeline? */
  hasFailureNote(tenantId: number, invoiceId: string): Promise<boolean>;
}

export type IssueFlag = {
  tenantId: number;
  kind: "payment_failed" | "payment_recovered";
  title: string;
  body: string;
  dedupeKey: string;
};

export type InvoiceDeps = {
  issues: PaymentIssueStore;
  /** Internal timeline note + team email (deduped by the caller's flag writer). */
  flagForStaff: (flag: IssueFlag) => Promise<void>;
  /** Friendly customer email, once per failed invoice. Never throws (wrapped). */
  notifyCustomer?: (tenantId: number, f: InvoiceFacts) => Promise<void>;
  log: { error: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
  now?: Date;
};

function money(p: number) {
  const pounds = p / 100;
  return `£${pounds.toLocaleString("en-GB", { minimumFractionDigits: pounds % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function ukDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).replace("Sept", "Sep");
}

export function failureFlag(tenantId: number, f: InvoiceFacts): IssueFlag {
  const retry = f.nextRetryAt ? `Stripe will retry on ${ukDay(f.nextRetryAt)}.` : "Stripe has no further retry scheduled.";
  return {
    tenantId,
    kind: "payment_failed",
    title: PAYMENT_FAILED_TITLE,
    body: `${money(f.amountDuePence)} on invoice ${f.invoiceId} did not go through (attempt ${f.attemptCount}). ${retry} The customer was told the team will be in touch.`,
    // One note and one team email per invoice, however many retries fail.
    dedupeKey: `payment-failed:${f.invoiceId}`,
  };
}

export function recoveryFlag(tenantId: number, f: InvoiceFacts): IssueFlag {
  return {
    tenantId,
    kind: "payment_recovered",
    title: PAYMENT_RECOVERED_TITLE,
    body: `Invoice ${f.invoiceId} is now paid. The failed payment flag is cleared.`,
    dedupeKey: `payment-recovered:${f.invoiceId}`,
  };
}

export type InvoiceResult = { status: number; body: string };

/**
 * One invoice event. Database failures on the core write answer 500 so Stripe
 * retries; everything else (no matching site, emails) answers 200.
 */
export async function handleInvoiceEvent(deps: InvoiceDeps, type: InvoiceEventType, inv: InvoiceLike): Promise<InvoiceResult> {
  const { log } = deps;
  const now = deps.now ?? new Date();
  const f = invoiceFacts(inv);
  if (!f) return { status: 200, body: "ignored: no invoice id" };
  // Setup is a one-off Checkout payment; only subscription invoices matter here.
  if (!f.subscriptionId) return { status: 200, body: "ignored: not a subscription invoice" };

  const tenantId = (await deps.issues.tenantIdForSubscription(f.subscriptionId)) ?? f.metaTenantId;
  if (!tenantId) {
    log.warn("[stripe-webhook] invoice for an unknown subscription:", f.invoiceId, f.subscriptionId);
    return { status: 200, body: "ignored: no site for this subscription" };
  }

  if (type === "invoice.payment_failed") {
    if (f.amountDuePence <= 0) return { status: 200, body: "ignored: nothing due" };
    const stored = await deps.issues.recordFailure(tenantId, f, now);
    if (!stored) log.warn("[stripe-webhook] payment_issues table missing (run supabase/payment-issues.sql); timeline note only");
    await deps.flagForStaff(failureFlag(tenantId, f));
    if (deps.notifyCustomer) {
      try {
        await deps.notifyCustomer(tenantId, f);
      } catch (err) {
        log.warn("[stripe-webhook] customer payment email failed:", err);
      }
    }
    return { status: 200, body: "payment failure recorded" };
  }

  // invoice.payment_succeeded or invoice.paid. Both arrive for one payment; only the first closes it.
  let wasOpen: boolean;
  const closed = await deps.issues.recordRecovery(tenantId, f.invoiceId, now);
  if (closed === "unknown") wasOpen = await deps.issues.hasFailureNote(tenantId, f.invoiceId);
  else wasOpen = closed === "closed";
  if (!wasOpen) return { status: 200, body: "ok" };
  await deps.flagForStaff(recoveryFlag(tenantId, f));
  return { status: 200, body: "payment recovery recorded" };
}

/** Does this database error mean the table is not there yet? */
export function missingTable(err: { code?: string; message?: string } | null | undefined) {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || /does not exist|could not find the table/i.test(err.message ?? "");
}

type QueryResult = { data: unknown; error: { message: string; code?: string } | null };
type Filter = PromiseLike<QueryResult> & {
  eq: (col: string, v: unknown) => Filter;
  is: (col: string, v: null) => Filter;
  like: (col: string, v: string) => Filter;
  limit: (n: number) => Filter;
  select: (cols: string) => Filter;
  maybeSingle: () => PromiseLike<QueryResult>;
};
export type IssueDb = {
  from: (table: string) => {
    select: (cols: string) => Filter;
    update: (patch: Record<string, unknown>) => Filter;
    upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => PromiseLike<QueryResult>;
  };
};

/** Supabase-backed store. `sb` must be the service-role client. */
export function supabaseIssueStore(sb: IssueDb): PaymentIssueStore {
  return {
    async tenantIdForSubscription(subscriptionId) {
      const r = await sb.from("tenants").select("id").eq("stripe_subscription_id", subscriptionId).limit(1);
      if (r.error) throw new Error(`find site for subscription: ${r.error.message}`);
      const rows = (r.data as Array<{ id: number }> | null) ?? [];
      return rows[0]?.id ?? null;
    },
    async recordFailure(tenantId, f, at) {
      const r = await sb.from("payment_issues").upsert(
        {
          tenant_id: tenantId,
          stripe_invoice_id: f.invoiceId,
          stripe_subscription_id: f.subscriptionId,
          amount_due_pence: f.amountDuePence,
          attempt_count: f.attemptCount,
          next_retry_at: f.nextRetryAt,
          last_failed_at: at.toISOString(),
          recovered_at: null,
        },
        { onConflict: "stripe_invoice_id" },
      );
      if (r.error && missingTable(r.error)) return false;
      if (r.error) throw new Error(`record payment failure: ${r.error.message}`);
      return true;
    },
    async recordRecovery(tenantId, invoiceId, at) {
      const r = await sb
        .from("payment_issues")
        .update({ recovered_at: at.toISOString(), next_retry_at: null })
        .eq("stripe_invoice_id", invoiceId)
        .eq("tenant_id", tenantId)
        .is("recovered_at", null)
        .select("id");
      if (r.error && missingTable(r.error)) return "unknown";
      if (r.error) throw new Error(`record payment recovery: ${r.error.message}`);
      return ((r.data as unknown[] | null) ?? []).length > 0 ? "closed" : "none";
    },
    async hasFailureNote(tenantId, invoiceId) {
      const failed = await sb
        .from("build_events")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("title", PAYMENT_FAILED_TITLE)
        .like("body", `%${invoiceId}%`)
        .limit(1);
      if (failed.error || !((failed.data as unknown[] | null) ?? []).length) return false;
      const recovered = await sb
        .from("build_events")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("title", PAYMENT_RECOVERED_TITLE)
        .like("body", `%${invoiceId}%`)
        .limit(1);
      return !((recovered.data as unknown[] | null) ?? []).length;
    },
  };
}

/** What the account page and the office show. Customers get the friendly fields only. */
export type OpenPaymentIssue = {
  firstFailedAt: string;
  nextRetryAt: string | null;
  amountDuePence: number;
  attemptCount: number;
  invoiceId?: string;
};
