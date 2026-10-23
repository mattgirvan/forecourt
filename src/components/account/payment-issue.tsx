import { useEffect, useState } from "react";
import { gbpPence } from "@/lib/catalog";
import { openPaymentIssue } from "@/lib/server/portal";
import type { OpenPaymentIssue } from "@/lib/server/payment-issues";

function ukDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}

/** Customer copy for an open failed payment. Calm, personal, no action required. */
export function customerPaymentLines(issue: Pick<OpenPaymentIssue, "nextRetryAt">): string[] {
  return [
    "Your latest monthly payment did not go through. This happens from time to time, often when a card has been replaced, so there is nothing to worry about.",
    issue.nextRetryAt
      ? `Stripe will try the card again automatically on ${ukDay(issue.nextRetryAt)}, and your desk keeps working as normal.`
      : "Stripe will try the card again automatically, and your desk keeps working as normal.",
    "Someone from our team will be in touch personally to help. You can also message us from Support.",
  ];
}

/**
 * Banner for an open failed monthly payment. `team` shows the staff detail
 * (amount, attempts, Stripe invoice) for the Office billing pane.
 */
export function PaymentIssueNotice({ token, tenantId, team = false }: { token: string; tenantId: number; team?: boolean }) {
  const [issue, setIssue] = useState<OpenPaymentIssue | null>(null);
  useEffect(() => {
    let live = true;
    void openPaymentIssue({ data: { token, tenantId } })
      .then((r) => live && setIssue(r))
      .catch(() => live && setIssue(null));
    return () => {
      live = false;
    };
  }, [token, tenantId]);
  if (!issue) return null;

  if (team) {
    return (
      <div className="rounded-[1.75rem] border border-line-strong bg-surface p-6">
        <div className="text-sm font-medium">Monthly payment failed</div>
        <p className="mt-1 text-sm text-muted">
          {gbpPence(issue.amountDuePence)} did not go through on {ukDay(issue.firstFailedAt)} (attempt {issue.attemptCount}).{" "}
          {issue.nextRetryAt ? `Stripe retries on ${ukDay(issue.nextRetryAt)}.` : "Stripe has no further retry scheduled."}
          {issue.invoiceId ? ` Invoice ${issue.invoiceId}.` : ""} The customer was told we will be in touch. This clears by itself when Stripe collects the payment.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-line-strong bg-elevated px-4 py-3 text-sm">
      <div className="font-medium">A quick note about your payment</div>
      {customerPaymentLines(issue).map((l) => (
        <p key={l} className="mt-1 text-muted">
          {l}
        </p>
      ))}
    </div>
  );
}
