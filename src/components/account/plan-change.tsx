import { Button } from "@/components/ui/button";
import { useState } from "react";
import { PLANS, type PlanId } from "@/lib/catalog";
import { quoteLines, type PlanChangeQuote } from "@/lib/plan-change";
import { previewPlanChange, requestPlanChange } from "@/lib/server/plan-change-server";

const ORDER: PlanId[] = ["site", "franchise", "group"];
const LABEL: Record<PlanId, string> = { site: "Site", franchise: "Franchise", group: "Group" };

/** Change account type. Customer (live accounts) and Office use the same panel. */
export function PlanChangePanel({ token, tenantId, plan, where }: { token: string; tenantId: number; plan: PlanId; where: "account" | "office" }) {
  return (
    <PlanChangeView
      plan={plan}
      where={where}
      onPreview={async (to) => (await previewPlanChange({ data: { token, tenantId, to } })).quote}
      onConfirm={async (to) => {
        const r = await requestPlanChange({ data: { token, tenantId, to, from: where } });
        if (r.url) window.location.assign(r.url);
        return r.message;
      }}
    />
  );
}

export function PlanChangeView({
  plan,
  where,
  onPreview,
  onConfirm,
  initialTo = null,
  initialQuote = null,
  initialNotice = null,
}: {
  plan: PlanId;
  where: "account" | "office";
  onPreview: (to: PlanId) => Promise<PlanChangeQuote>;
  onConfirm: (to: PlanId) => Promise<string>;
  initialTo?: PlanId | null;
  initialQuote?: PlanChangeQuote | null;
  initialNotice?: string | null;
}) {
  const [to, setTo] = useState<PlanId | null>(initialTo);
  const [quote, setQuote] = useState<PlanChangeQuote | null>(initialQuote);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(initialNotice);
  const pick = async (p: PlanId) => {
    setTo(p);
    setQuote(null);
    setNotice(null);
    setBusy(true);
    try {
      setQuote(await onPreview(p));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not price that change.");
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!to) return;
    setBusy(true);
    try {
      setNotice(await onConfirm(to));
      setQuote(null);
      setTo(null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not change the account type.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-[1.75rem] border border-line bg-surface p-6 sm:p-8" data-testid="plan-change">
      <h2 className="text-2xl font-semibold tracking-tight">Account type</h2>
      <p className="mt-2 text-sm text-muted">
        {where === "office" ? "This account is" : "You are"} on {LABEL[plan]}. Moving up means paying the setup difference first. Moving down has no setup refund.
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Account type">
        {ORDER.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={(to ?? plan) === p}
            disabled={busy || p === plan}
            onClick={() => void pick(p)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              (to ?? plan) === p ? "border-fg bg-transparent font-medium text-fg ring-1 ring-fg" : "border-line bg-elevated text-muted hover:text-fg"
            } disabled:cursor-default`}
          >
            {LABEL[p]}
            {p === plan ? " (current)" : ""}
          </button>
        ))}
      </div>
      {busy && !quote ? <p className="mt-4 text-sm text-muted">Working out the cost.</p> : null}
      {quote && to ? (
        <div className="mt-5 rounded-2xl border border-line bg-elevated p-4" data-testid="plan-change-quote">
          <h3 className="text-sm font-semibold">
            {LABEL[quote.from]} to {LABEL[quote.to]}
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {quoteLines(quote).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void confirm()}>
              {quote.direction === "upgrade" ? `Pay £${(quote.setupDiffPence / 100).toLocaleString("en-GB")} and switch` : `Switch to ${PLANS[quote.to].name}`}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => { setQuote(null); setTo(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {notice ? <p role="status" className="mt-4 text-sm text-muted" data-testid="plan-change-notice">{notice}</p> : null}
    </div>
  );
}
