import type { ReactNode } from "react";
import { Chip } from "@/components/ui/chip";
import { PLANS } from "@/lib/catalog";
import { ukDay } from "@/lib/plan-change";
import { cn } from "@/lib/utils";
import { migrationTone, requestStatusLabel, type Tracker } from "@/lib/migration";

/**
 * "Migration" status pill, shown instead of "Live" while an account type change is open.
 * Amber only while the customer must pay the setup difference, green on Complete, grey otherwise.
 */
const TONE = { amber: "action", green: "live", grey: "neutral" } as const;

export function MigrationPill({ tracker }: { tracker?: Tracker | null }) {
  return <Chip tone={TONE[migrationTone(tracker)]}>Migration</Chip>;
}

/** Step by step tracker for an account type change, modelled on the setup tracker. */
export function MigrationTracker({
  tracker,
  office = false,
  actions,
}: {
  tracker: Tracker;
  office?: boolean;
  actions?: ReactNode;
}) {
  const done = tracker.steps.filter((s) => s.state === "done").length;
  return (
    <section id={office ? undefined : "plan-change-tracker"} className="rounded-2xl border border-line bg-surface px-4 py-4 sm:px-5">
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
      <RequestCard tracker={tracker} />
      <ol className="mt-3">
        {tracker.steps.map((s, i) => (
          <li key={s.stage} className="flex gap-3 border-t border-line py-2.5 text-sm">
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]",
                s.state === "done" && "bg-[var(--fc-live-tint)] text-[var(--fc-live)]",
                s.state === "now" && "border border-muted text-muted",
                s.state === "next" && "border border-line text-subtle",
              )}
            >
              {s.state === "done" ? "✓" : i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block", s.state === "next" && "text-muted")}>
                {s.state !== "done" && s.todoTitle ? s.todoTitle : s.title}
              </span>
              <span className="block text-[12px] text-subtle">
                {s.state !== "done" && s.todo ? s.todo : s.line}
                {s.stage === "priced" && tracker.effectiveAt
                  ? ` From ${ukDay(tracker.effectiveAt)}.`
                  : ""}
              </span>
              {office && s.state === "now" ? (
                <span className="mt-0.5 block text-[11px] text-subtle">
                  {whoMoves(s.by, s.stage, tracker)}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-[12px] text-subtle">
              {s.at && s.state === "done" ? ukDay(s.at) : s.state === "now" ? "Next" : ""}
            </span>
          </li>
        ))}
      </ol>
      {actions ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">{actions}</div>
      ) : null}
    </section>
  );
}

function whoMoves(by: string, stage: string, tracker: Tracker): string {
  const scenario = tracker.scenario;
  if (stage === "switched" && tracker.status !== "pending_payment" && by === "forecourt")
    return "Moves on when the team presses Apply on the plan change ticket.";
  if (by === "stripe") return "Moves on when Stripe confirms the payment.";
  if (by === "period_end") return "Moves on by itself at the period end.";
  // Trims are manual (Matt): staff do them in the customer's desk, Office only records it.
  if (by === "forecourt" && stage === "setup" && scenario === "group_to_franchise")
    return "Remove the brands to drop in the customer's desk, then mark this step done.";
  if (by === "forecourt" && stage === "setup" && !tracker.rise && scenario !== "site_to_franchise" && scenario !== "site_to_group" && scenario !== "franchise_to_group")
    return "Archive the sites to drop in the customer's desk, then mark this step done.";
  if (by === "forecourt") return "Mark this done below when it is finished.";
  return "";
}

const gbp = (p: number) => `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Summary of the request: the move, setup difference, new price, when it starts and where it is up to. */
export function RequestCard({ tracker }: { tracker: Tracker }) {
  const starts = tracker.rise
    ? tracker.goLiveAt
      ? ukDay(tracker.goLiveAt)
      : "When your change goes live"
    : tracker.effectiveAt
      ? `${ukDay(tracker.effectiveAt)}, at period end`
      : "At the end of your billing period";
  const rows: [string, string][] = [
    ["Move", `${PLANS[tracker.from].name} to ${PLANS[tracker.to].name}`],
    ["Setup difference", tracker.setupDiffPence ? `${gbp(tracker.setupDiffPence)} inc. VAT, one-off` : "None"],
  ];
  if (tracker.newMonthlyPence != null) rows.push(["New price", `${gbp(tracker.newMonthlyPence)} a month inc. VAT`]);
  rows.push(["Price starts", starts], ["Status", requestStatusLabel(tracker)]);
  return (
    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-line bg-elevated px-3 py-3 text-sm" aria-label="Your request">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[12px] text-subtle">{k}</dt>
          <dd className="min-w-0 text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

