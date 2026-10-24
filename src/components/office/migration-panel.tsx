import { useState } from "react";
import { Button } from "@/components/ui/button";
import { askConfirm } from "@/components/ui/confirm-sheet";
import { PLANS } from "@/lib/catalog";
import { markPaidSheet } from "@/lib/plan-change";
import { markPlanChangePaid } from "@/lib/server/plan-change-server";
import { MigrationTracker } from "@/components/account/migration-tracker";
import { nextStage, officeCanMark, type Tracker } from "@/lib/migration";
import { markMigration } from "@/lib/server/migration-server";

/** Office: the account's open type change, with the steps Forecourt marks by hand and a cancel that puts it back to Live. */
export function OfficeMigrationPanel({ token, tracker, onChanged, preview = false, owner = false }: { token: string; tracker: Tracker; onChanged: () => void; preview?: boolean; owner?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const next = nextStage(tracker.scenario, tracker.stage, tracker.steps);
  const canMark = next ? officeCanMark(tracker.scenario, tracker.stage, next, tracker.steps) : false;
  const nextStep = tracker.steps.find((s) => s.stage === next);

  async function act(action: "setup" | "complete" | "cancel") {
    if (preview) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await markMigration({ data: { token, changeId: tracker.id, action } });
      setNotice(r.message);
      onChanged();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not update the migration.");
    } finally {
      setBusy(false);
    }
  }

  const awaiting = tracker.status === "pending_payment" && Boolean(tracker.setupDiffPence);
  async function markPaid() {
    const ok = await askConfirm(markPaidSheet({ from: PLANS[tracker.from].name, to: PLANS[tracker.to].name, setupDiffPence: tracker.setupDiffPence ?? 0 }));
    if (!ok || preview) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await markPlanChangePaid({ data: { token, changeId: tracker.id } });
      setNotice(r.message);
      if (r.ok) onChanged();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not mark it as paid.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <MigrationTracker
        tracker={tracker}
        office
        actions={
          <>
            {awaiting ? (
              <Button type="button" variant="secondary" disabled={busy || !owner} onClick={() => void markPaid()} data-testid="plan-change-mark-paid">
                Mark as paid
              </Button>
            ) : null}
            {canMark && nextStep && (next === "setup" || next === "complete") ? (
              <Button type="button" disabled={busy} onClick={() => void act(next)}>
                {busy ? "Working…" : `Mark "${nextStep.title}" done`}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void act("cancel")}>
              Cancel migration
            </Button>
          </>
        }
      />
      {awaiting ? (
        <p className="text-[12px] text-subtle" data-testid="plan-change-awaiting-note">
          Awaiting customer payment. The admin has an emailed link and a Pay button on their account. {owner ? "Mark as paid is for bank transfers and other money that came in another way." : "Only an owner can mark it as paid."}
        </p>
      ) : null}
      <p className="text-[12px] text-subtle">Cancel closes the tracker and puts the account back to Live. It does not undo the plan, Stripe or any payment.</p>
      {notice ? <p className="rounded-xl border border-line-strong bg-elevated px-3 py-2 text-sm">{notice}</p> : null}
    </div>
  );
}
