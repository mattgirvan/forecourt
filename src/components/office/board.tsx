import { gbpPence, monthTotalPence, normalizeBilling, normalizePlan } from "@/lib/catalog";
import { packageLive, statusLabel, trialDaysLeft } from "@/lib/team";
import { cn } from "@/lib/utils";

export type BoardRow = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  plan: string;
  status: string;
  billing?: string | null;
  site_count?: number | null;
  trial_ends_at?: string | null;
  term_months?: number | null;
  group_name?: string | null;
  principal_name?: string | null;
  created_at?: string | null;
  last_message_at?: string | null;
  waiting?: boolean;
};

export function BoardStats({ rows }: { rows: BoardRow[] }) {
  const live = rows.filter((r) => packageLive(r.status)).length;
  const trial = rows.filter((r) => normalizeBilling(normalizePlan(r.plan), r.billing) === "trial").length;
  const waiting = rows.filter((r) => r.waiting).length;
  const idle = rows.filter((r) => !packageLive(r.status)).length;
  const items = [
    { n: live, label: "Live" },
    { n: trial, label: "On trial" },
    { n: waiting, label: "Waiting on us" },
    { n: idle, label: "Not started" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="rounded-2xl border border-line bg-surface px-4 py-4">
          <div className="text-3xl font-semibold tracking-tight">{s.n}</div>
          <div className="mt-1 text-[13px] text-muted">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export function CustomerTable({
  rows,
  onOpen,
}: {
  rows: BoardRow[];
  onOpen: (id: number) => void;
}) {
  if (rows.length === 0) {
    return <p className="mt-8 text-sm text-muted">No dealerships yet.</p>;
  }
  return (
    <>
      <div className="mt-6 hidden overflow-hidden rounded-[1.75rem] border border-line md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-elevated text-[11px] uppercase tracking-[0.12em] text-subtle">
            <tr>
              <th className="px-4 py-3 font-medium">Dealership</th>
              <th className="px-4 py-3 font-medium">Package</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Support</th>
              <th className="px-4 py-3 font-medium">Inbox</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const plan = normalizePlan(r.plan);
              const billing = normalizeBilling(plan, r.billing);
              const days = trialDaysLeft(r.trial_ends_at);
              const monthly = monthTotalPence(plan, r.site_count ?? 1);
              return (
                <tr
                  key={r.id}
                  className="cursor-pointer border-t border-line hover:bg-elevated/60"
                  onClick={() => onOpen(r.id)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted">
                      {r.group_name || r.principal_name || r.email || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {plan}
                    {billing === "trial" ? " trial" : ` · ${gbpPence(monthly)}/mo`}
                  </td>
                  <td className="px-4 py-3">
                    {statusLabel(r.status)}
                    {billing === "trial" && days != null ? ` · ${days}d` : ""}
                  </td>
                  <td className="px-4 py-3">
                    {r.waiting ? (
                      <span className="text-fg">They wrote</span>
                    ) : r.last_message_at ? (
                      <span className="text-muted">We replied</span>
                    ) : (
                      <span className="text-subtle">Quiet</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.email || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="mt-6 space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              className={cn(
                "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-left",
                r.waiting && "border-line-strong",
              )}
            >
              <div className="font-medium">{r.name}</div>
              <div className="mt-1 text-xs text-muted">
                {statusLabel(r.status)} · {normalizePlan(r.plan)}
                {r.waiting ? " · they wrote" : ""}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
