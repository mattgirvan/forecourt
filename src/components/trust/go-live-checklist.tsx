import { useState } from "react";
import {
  GO_LIVE_DNS_BLURB,
  GO_LIVE_STEPS,
  goLiveFooter,
  goLiveStatuses,
  type TenantPack,
} from "@/lib/build";
import { cn } from "@/lib/utils";

/**
 * Your desk — five honest ticks. Done only when we have a real signal;
 * staff / stock / customer stay upcoming until provision fields exist.
 */
export function GoLiveChecklist({
  pack,
  stage,
  onInviteStaff,
}: {
  pack: TenantPack;
  stage: string | null | undefined;
  onInviteStaff?: () => void;
}) {
  const statuses = goLiveStatuses(pack, stage);
  const [showDns, setShowDns] = useState(false);
  const [tip, setTip] = useState<string | null>(null);

  return (
    <section className="rounded-[1.75rem] border border-line bg-surface p-6 sm:p-8">
      <p className="text-[13px] font-medium text-muted">After you pay</p>
      <h3 className="mt-1 text-2xl font-semibold tracking-tight">Your desk</h3>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Five steps to go live. We email you as each one moves — no ticket numbers.
      </p>

      <ol className="mt-6 space-y-2">
        {GO_LIVE_STEPS.map((step) => {
          const status = statuses[step.id];
          return (
            <li
              key={step.id}
              className={cn(
                "flex flex-col gap-2 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                status === "done" &&
                  "border-[color-mix(in_srgb,var(--emerald)_40%,transparent)] bg-[color-mix(in_srgb,var(--emerald)_12%,transparent)]",
                status === "current" &&
                  "border-[color-mix(in_srgb,var(--shell-accent)_42%,transparent)] bg-[color-mix(in_srgb,var(--shell-accent)_14%,transparent)]",
                status === "upcoming" && "border-line bg-elevated/40 opacity-70",
              )}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{step.label}</span>
                  <StatusChip status={status} />
                </div>
                {status !== "done" ? (
                  <p className="mt-1 text-xs leading-relaxed text-muted">{step.waiting}</p>
                ) : null}
              </div>
              {status !== "done" && step.cta ? (
                <button
                  type="button"
                  className="shrink-0 self-start rounded-full border border-line bg-elevated px-3 py-1.5 text-xs text-muted hover:text-fg sm:self-center"
                  onClick={() => {
                    if (step.id === "domain") setShowDns((v) => !v);
                    else if (step.id === "staff") onInviteStaff?.();
                    else if (step.id === "stock")
                      setTip("Upload an Excel or CSV with a VIN column — same sheet your stock team already keeps.");
                    else if (step.id === "customer")
                      setTip("From the desk, open a deal and send customer glass — they get a magic link for that order only.");
                  }}
                >
                  {step.cta}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      {showDns ? (
        <p className="mt-4 rounded-2xl border border-line bg-elevated/60 px-4 py-3 text-sm leading-relaxed text-muted">
          {GO_LIVE_DNS_BLURB}
        </p>
      ) : null}
      {tip ? (
        <p className="mt-4 rounded-2xl border border-line bg-elevated/60 px-4 py-3 text-sm leading-relaxed text-muted">
          {tip}
        </p>
      ) : null}

      <p className="mt-6 text-xs leading-relaxed text-subtle">{goLiveFooter()}</p>
    </section>
  );
}

function StatusChip({ status }: { status: "done" | "current" | "upcoming" }) {
  if (status === "done") {
    return (
      <span className="rounded-full border border-[color-mix(in_srgb,var(--emerald)_40%,transparent)] bg-[color-mix(in_srgb,var(--emerald)_22%,rgba(255,255,255,0.08))] px-2 py-0.5 text-[10px] font-medium text-[color-mix(in_srgb,var(--emerald)_85%,white)] shadow-[0_1px_0_rgba(255,255,255,0.12)]">
        Done
      </span>
    );
  }
  if (status === "current") {
    return (
      <span className="rounded-full border border-[color-mix(in_srgb,var(--shell-accent)_42%,transparent)] bg-[color-mix(in_srgb,var(--shell-accent)_22%,rgba(255,255,255,0.08))] px-2 py-0.5 text-[10px] font-medium text-[var(--shell-accent)] shadow-[0_1px_0_rgba(255,255,255,0.12)]">
        Current
      </span>
    );
  }
  return <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] font-medium text-subtle">Upcoming</span>;
}
