import { ROLES, matrixTrialLabel, rolesForPlan, type Role } from "@/lib/roles";
import type { BillingKind, PlanId } from "@/lib/catalog";
import { cn } from "@/lib/utils";

function rowsFor(plan?: PlanId, billing?: BillingKind): Role[] {
  if (plan) return [...rolesForPlan(plan, billing ?? "subscription")];
  return [...ROLES];
}

/** Seat · Sees · GP · On trial? Single source: src/lib/roles.ts */
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
    <div className={cn("overflow-x-auto rounded-[1.75rem] border border-line bg-surface", compact ? "p-4" : "p-4 sm:p-8")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-muted">Seats</p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight">Who sees what</h3>
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-subtle">
          Trial seats: sales, management, host, progressor. Administrator is a desk seat, not the Forecourt team.
        </p>
      </div>
      {/* Phones: fixed layout like the CRM comparison table. Seat and what it
          sees share the wide first column; GP and trial get narrow columns with
          short labels. From sm up the layout is the original four columns. */}
      <table className="mt-6 w-full table-fixed text-left text-[12.5px] sm:min-w-[36rem] sm:table-auto sm:text-sm">
        <colgroup>
          <col />
          <col className="hidden sm:table-column" />
          <col className="w-[3rem] sm:w-auto" />
          <col className="w-[4.5rem] sm:w-auto" />
        </colgroup>
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-subtle">
            <th scope="col" className="py-2 pr-2 font-medium sm:pr-3">
              Seat
            </th>
            <th scope="col" className="hidden py-2 pr-3 font-medium sm:table-cell">
              Sees
            </th>
            <th scope="col" className="py-2 pr-2 font-medium sm:pr-3">
              <span className="sm:hidden">GP?</span>
              <span className="hidden sm:inline">Sees GP?</span>
            </th>
            <th scope="col" className="py-2 font-medium">
              <span className="sm:hidden">Trial?</span>
              <span className="hidden sm:inline">On trial?</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line align-top">
              <td className="py-2.5 pr-2 sm:py-3 sm:pr-3">
                <span className="block font-medium">{r.label}</span>
                <span className="mt-0.5 block leading-snug text-muted sm:hidden">{r.matrixSees}</span>
              </td>
              <td className="hidden py-3 pr-3 text-muted sm:table-cell">{r.matrixSees}</td>
              <td className="py-2.5 pr-2 text-muted sm:py-3 sm:pr-3">{r.seesGp}</td>
              <td className="py-2.5 sm:py-3">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium leading-snug sm:leading-[inherit]",
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
