import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Row, Rows } from "@/components/ui/section";
import { askConfirm } from "@/components/ui/confirm-sheet";
import { applyPlanChangeTicket, getPlanChangeTicket, rejectPlanChangeTicket, type PlanChangeTicketView } from "@/lib/server/plan-change-staff";

import { applySheet, rejectSheet, ticketDay as day } from "@/lib/plan-change-ticket-copy";

/** Apply and Reject for a plan change ticket. `initial` skips the fetch (mock shots only). */
export function PlanChangeTicketActions({
  token,
  itemId,
  onChanged,
  initial,
  initialNotice,
}: {
  token: string;
  itemId: number;
  onChanged: () => void;
  initial?: PlanChangeTicketView;
  initialNotice?: { tone: "done" | "manual" | "error"; text: string };
}) {
  const [v, setV] = useState<PlanChangeTicketView | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "done" | "manual" | "error"; text: string } | null>(initialNotice ?? null);
  const load = () =>
    void getPlanChangeTicket({ data: { token, itemId } })
      .then(setV)
      .catch((e) => setNotice({ tone: "error", text: e instanceof Error ? e.message : "Could not load the plan change." }));
  useEffect(() => {
    if (!initial) load();
  }, [token, itemId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!v) return notice ? <p className="text-sm text-muted">{notice.text}</p> : <p className="text-sm text-muted">Loading the plan change.</p>;

  const apply = async () => {
    if (!(await askConfirm(applySheet(v)))) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await applyPlanChangeTicket({ data: { token, changeId: v.changeId } });
      setNotice(r.ok && r.manualPrice ? { tone: "manual", text: r.manualPrice } : { tone: "done", text: r.message });
      load();
      onChanged();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "Could not apply." });
    } finally {
      setBusy(false);
    }
  };
  const reject = async () => {
    if (!(await askConfirm(rejectSheet(v)))) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await rejectPlanChangeTicket({ data: { token, changeId: v.changeId, reason: "Not going ahead." } });
      setNotice({ tone: "done", text: r.message });
      load();
      onChanged();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "Could not reject." });
    } finally {
      setBusy(false);
    }
  };

  const starts =
    v.goLiveAt
      ? `Went live ${day(v.goLiveAt)}`
      : v.monthlyStarts === "on_go_live"
        ? "From the go live day"
        : v.effectiveAt
          ? `From period end, ${day(v.effectiveAt)}`
          : "From period end";
  return (
    <div data-testid="plan-change-ticket">
      <Rows>
        <Row title="Move" trailing={<span className="font-semibold">{v.from} to {v.to}</span>} />
        <Row title="Setup difference" sub={v.setupPaid ? "Paid, inc. VAT" : undefined} trailing={<span className="font-semibold tabular-nums">{v.setupPaid ?? "Nothing to pay"}</span>} />
        <Row title="New monthly price" sub="Inc. VAT" trailing={<span className="font-semibold tabular-nums">{v.newMonthly}</span>} />
        <Row title="Price starts" trailing={<span className="text-muted">{starts}</span>} />
        <Row title="Billing switch" trailing={<span className="text-muted">{v.syncOn ? "On: Stripe updates itself" : "Off: set the price by hand"}</span>} />
      </Rows>
      {notice ? (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`fc-pc-feedback mt-3 ${notice.tone === "done" ? "is-success" : notice.tone === "error" ? "is-error" : ""}`}
          data-testid="plan-change-ticket-notice"
        >
          <span className="fc-pc-feedback-dot" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{notice.tone === "manual" ? "Now set the price in Stripe" : notice.tone === "done" ? "Done" : "Not done"}</span>
            <span className="mt-0.5 block text-[13px] text-[var(--fc-text-dim)]">{notice.text}</span>
          </span>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {v.canApply ? (
          <Button variant="action" disabled={busy} onClick={() => void apply()} data-testid="plan-change-apply">
            Apply
          </Button>
        ) : null}
        {v.canReject ? (
          <Button variant="ghost" disabled={busy || !v.isOwner} onClick={() => void reject()} data-testid="plan-change-reject">
            Reject
          </Button>
        ) : null}
        {v.canReject && !v.isOwner ? <span className="text-[12.5px] text-[var(--fc-text-faint)]">Only an owner can reject and refund.</span> : null}
      </div>
    </div>
  );
}
