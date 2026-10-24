import type { ReactNode } from "react";
import { PLANS } from "@/lib/catalog";
import { ukDay } from "@/lib/plan-change";
import { cn } from "@/lib/utils";
import { isUpgrade, migrationTone, type Tracker } from "@/lib/migration";

/**
 * "Migration" status pill, shown instead of "Live" while an account type change is open.
 * Amber only while the customer must pay the setup difference, green on Complete, grey otherwise.
 */
const TONE = {
  amber: "border-[#d9a24b]/[.42] bg-[#d9a24b]/[.18] text-[#d9a24b]",
  green: "border-[#4BA82E]/[.42] bg-[#4BA82E]/[.18] text-[#4BA82E]",
  grey: "border-line bg-surface text-muted",
};

export function MigrationPill({ tracker }: { tracker?: Tracker | null }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px]", TONE[migrationTone(tracker)])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      Migration
    </span>
  );
}

/** Step by step tracker for an account type change, modelled on the setup tracker. */
export function MigrationTracker({ tracker, office = false, actions }: { tracker: Tracker; office?: boolean; actions?: ReactNode }) {
  const done = tracker.steps.filter((s) => s.state === "done").length;
  return (
    <section className="rounded-2xl border border-line bg-surface px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] text-subtle">Account type change</p>
          <p className="mt-0.5 text-[1.05rem] font-semibold tracking-tight">
            {PLANS[tracker.from].name} to {PLANS[tracker.to].name}
          </p>
        </div>
        <span className="text-[12px] text-subtle">
          {done} of {tracker.steps.length} done
        </span>
      </div>
      <ol className="mt-3">
        {tracker.steps.map((s, i) => (
          <li key={s.stage} className="flex gap-3 border-t border-line py-2.5 text-sm">
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]",
                s.state === "done" && "bg-[#4BA82E]/[.22] text-[#4BA82E]",
                s.state === "now" && "border border-muted text-muted",
                s.state === "next" && "border border-line text-subtle",
              )}
            >
              {s.state === "done" ? "✓" : i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block", s.state === "next" && "text-muted")}>{s.title}</span>
              <span className="block text-[12px] text-subtle">
                {s.line}
                {s.stage === "priced" && tracker.effectiveAt ? ` From ${ukDay(tracker.effectiveAt)}.` : ""}
              </span>
              {office && s.state === "now" ? <span className="mt-0.5 block text-[11px] text-subtle">{whoMoves(s.by, s.stage, tracker.scenario)}</span> : null}
            </span>
            <span className="shrink-0 text-[12px] text-subtle">{s.at && s.state === "done" ? ukDay(s.at) : s.state === "now" ? "Next" : ""}</span>
          </li>
        ))}
      </ol>
      {actions ? <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">{actions}</div> : null}
    </section>
  );
}

function whoMoves(by: string, stage: string, scenario: Tracker["scenario"]): string {
  if (by === "stripe") return "Moves on when Stripe confirms the payment.";
  if (by === "period_end") return "Moves on by itself at the period end.";
  // Trims are manual (Matt): staff do them in the customer's desk, Office only records it.
  if (by === "forecourt" && stage === "setup" && scenario === "group_to_franchise") return "Remove the brands to drop in the customer's desk, then mark this step done.";
  if (by === "forecourt" && stage === "setup" && !isUpgrade(scenario)) return "Archive the sites to drop in the customer's desk, then mark this step done.";
  if (by === "forecourt") return "Mark this done below when it is finished.";
  return "";
}
