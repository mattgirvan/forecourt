import { ROLES, matrixTrialLabel, rolesForPlan, type Role } from "@/lib/roles";
import type { BillingKind, PlanId } from "@/lib/catalog";
import { cn } from "@/lib/utils";

function rowsFor(plan?: PlanId, billing?: BillingKind): Role[] {
  if (plan) return [...rolesForPlan(plan, billing ?? "subscription")];
  return [...ROLES];
}

/** Seat · Sees · GP · On trial? — single source: src/lib/roles.ts */
export function SeatMatrix({
  plan,
  billing,
  compact,
}: {
  plan?: PlanId;
  billing?: BillingKind;
  compact?: boolean;
}) {
  const rows = rowsFor(plan, billing);
  return (
    <div className={cn("overflow-x-auto rounded-[1.75rem] border border-line bg-surface", compact ? "p-4" : "p-6 sm:p-8")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-muted">Seats</p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight">Who sees what</h3>
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-subtle">
          Trial seats: sales, management, host, progressor. Administrator is a desk seat — not the Forecourt team.
        </p>
      </div>
      <table className="mt-6 w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-subtle">
            <th className="py-2 pr-3 font-medium">Seat</th>
            <th className="py-2 pr-3 font-medium">Sees</th>
            <th className="py-2 pr-3 font-medium">Sees GP?</th>
            <th className="py-2 font-medium">On trial?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line align-top">
              <td className="py-3 pr-3 font-medium">{r.label}</td>
              <td className="py-3 pr-3 text-muted">{r.matrixSees}</td>
              <td className="py-3 pr-3 text-muted">{r.seesGp}</td>
              <td className="py-3">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                    r.trial
                      ? "bg-[color-mix(in_srgb,var(--emerald)_18%,rgba(255,255,255,0.08))] text-[color-mix(in_srgb,var(--emerald)_80%,white)]"
                      : "bg-elevated text-muted",
                  )}
                >
                  {matrixTrialLabel(r)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
