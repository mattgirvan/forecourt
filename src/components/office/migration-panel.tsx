import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MigrationTracker } from "@/components/account/migration-tracker";
import { nextStage, officeCanMark, type Tracker } from "@/lib/migration";
import { markMigration } from "@/lib/server/migration-server";

/** Office: the account's open type change, with the steps Forecourt marks by hand and a cancel that puts it back to Live. */
export function OfficeMigrationPanel({ token, tracker, onChanged, preview = false }: { token: string; tracker: Tracker; onChanged: () => void; preview?: boolean }) {
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

  return (
    <div className="space-y-2">
      <MigrationTracker
        tracker={tracker}
        office
        actions={
          <>
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
      <p className="text-[12px] text-subtle">Cancel closes the tracker and puts the account back to Live. It does not undo the plan, Stripe or any payment.</p>
      {notice ? <p className="rounded-xl border border-line-strong bg-elevated px-3 py-2 text-sm">{notice}</p> : null}
    </div>
  );
}
