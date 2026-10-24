import { useEffect, useState } from "react";
import { gbpPence } from "@/lib/catalog";
import { openBillingPortal, openPaymentIssue } from "@/lib/server/portal";
import { Button } from "@/components/ui/button";
import type { OpenPaymentIssue } from "@/lib/server/payment-issues";

function ukDay(iso: string) {
  return new Date(iso)
    .toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Europe/London",
    })
    .replace("Sept", "Sep");
}

/** Exact customer banner copy (Atlas, 23 Oct 2026). */
export const PAYMENT_BANNER =
  "Your last payment didn't go through. It happens. Your site is still live. Update your card in billing and we'll try again automatically.";

/**
 * Banner for an open failed monthly payment. `team` shows the staff detail
 * (amount, attempts, Stripe invoice) for the Office billing pane.
 */
export function PaymentIssueNotice({
  token,
  tenantId,
  team = false,
}: {
  token: string;
  tenantId: number;
  team?: boolean;
}) {
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
          {gbpPence(issue.amountDuePence)} did not go through on {ukDay(issue.firstFailedAt)}{" "}
          (attempt {issue.attemptCount}).{" "}
          {issue.nextRetryAt
            ? `Stripe retries on ${ukDay(issue.nextRetryAt)}.`
            : "Stripe has no further retry scheduled."}
          {issue.invoiceId ? ` Invoice ${issue.invoiceId}.` : ""} The customer sees a banner asking
          them to update their card. This clears by itself when Stripe collects the payment.
        </p>
      </div>
    );
  }

  return <PaymentBanner token={token} tenantId={tenantId} />;
}

function PaymentBanner({ token, tenantId }: { token: string; tenantId: number }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-[#d9a24b]/40 bg-[#d9a24b]/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p>{PAYMENT_BANNER}</p>
        {err ? <p className="mt-1 text-muted">{err}</p> : null}
      </div>
      <Button
        className="w-full shrink-0 sm:w-auto"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setErr(null);
          void openBillingPortal({ data: { token, tenantId } })
            .then(({ url }) => window.location.assign(url))
            .catch((e) => {
              setErr(e instanceof Error ? e.message : "Could not open billing.");
              setBusy(false);
            });
        }}
      >
        Manage billing
      </Button>
    </div>
  );
}
