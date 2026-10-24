import { gbpPence, monthTotalPence, normalizeBilling, normalizePlan } from "@/lib/catalog";
import { stageMeta } from "@/lib/build";
import { packageLive, statusLabel, trialDaysLeft } from "@/lib/team";
import { Chip } from "@/components/ui/chip";
import { OverflowMenu, Row, Rows } from "@/components/ui/section";

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
  stage?: string | null;
  archived_at?: string | null;
  /** Payment flags staff should look at (duplicate payment, look-alike dealership). */
  flags?: { duplicate: boolean; lookalike: boolean; paymentFailed?: boolean } | null;
};

/** What each badge means, shown as text so it reads on touch screens too. */
export const FLAG_EXPLAINERS = {
  duplicate: "A second payment came in for this site. See the note on the file.",
  lookalike: "This paid order looks like another dealership. See the note on the file.",
  paymentFailed:
    "A monthly payment did not go through. Stripe is retrying. Get in touch with the dealer.",
} as const;

/** Small badges for payment flags. Shown on the list so they are seen even with emails off. */
export function FlagBadges({ flags }: { flags?: BoardRow["flags"] }) {
  if (!flags || (!flags.duplicate && !flags.lookalike && !flags.paymentFailed)) return null;
  const chips = flags.duplicate || flags.lookalike;
  const lines = [
    flags.paymentFailed ? FLAG_EXPLAINERS.paymentFailed : null,
    flags.duplicate ? FLAG_EXPLAINERS.duplicate : null,
    flags.lookalike ? FLAG_EXPLAINERS.lookalike : null,
  ].filter(Boolean);
  return (
    <span className="mt-1.5 block">
      {chips ? (
        <span className="flex flex-wrap gap-1">
          {flags.duplicate ? <Chip tone="action">Duplicate payment</Chip> : null}
          {flags.lookalike ? <Chip>Looks like another dealer</Chip> : null}
        </span>
      ) : null}
      {lines.map((l) => (
        <span key={l} className="mt-1 block max-w-xs text-xs text-muted">
          {l}
        </span>
      ))}
    </span>
  );
}

/** Where a dealer is, as one chip. Live and Paid are green, a failed payment is amber, the rest grey. */
export function dealerStatus(
  r: Pick<BoardRow, "plan" | "billing" | "status" | "trial_ends_at" | "flags">,
): { label: string; tone: "live" | "action" | "neutral" | "progress" } {
  if (r.flags?.paymentFailed) return { label: "Payment failed", tone: "action" };
  const trial = normalizeBilling(normalizePlan(r.plan), r.billing) === "trial";
  if (trial && trialDaysLeft(r.trial_ends_at) === 0)
    return { label: "Trial ended", tone: "neutral" };
  if (r.status === "live" || r.status === "paid")
    return { label: statusLabel(r.status), tone: "live" };
  return { label: statusLabel(r.status), tone: "neutral" };
}

export function DealerStatusChip({ row }: { row: Parameters<typeof dealerStatus>[0] }) {
  const s = dealerStatus(row);
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

export function BoardStats({ rows }: { rows: BoardRow[] }) {
  const live = rows.filter((r) => packageLive(r.status)).length;
  const trial = rows.filter((r) => {
    const days = trialDaysLeft(r.trial_ends_at);
    return (
      normalizeBilling(normalizePlan(r.plan), r.billing) === "trial" && (days == null || days > 0)
    );
  }).length;
  const expired = rows.filter((r) => {
    const days = trialDaysLeft(r.trial_ends_at);
    return normalizeBilling(normalizePlan(r.plan), r.billing) === "trial" && days === 0;
  }).length;
  const waiting = rows.filter((r) => r.waiting).length;
  const items = [
    { n: live, label: "Live" },
    { n: trial, label: "On trial" },
    { n: expired, label: "Trial ended" },
    { n: waiting, label: "Waiting on us" },
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
  onArchive,
  archivedView = false,
}: {
  rows: BoardRow[];
  onOpen: (id: number) => void;
  onArchive?: (id: number, archived: boolean) => void;
  archivedView?: boolean;
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
              <th className="px-4 py-3 font-medium">Build</th>
              <th className="px-4 py-3 font-medium">Support</th>
              <th className="px-4 py-3 font-medium">Inbox</th>
              <th className="px-4 py-3 font-medium"></th>
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
                    <FlagBadges flags={r.flags} />
                  </td>
                  <td className="px-4 py-3">
                    {plan}
                    {billing === "trial" ? " trial" : `, ${gbpPence(monthly)}/mo`}
                  </td>
                  <td className="px-4 py-3">
                    <DealerStatusChip row={r} />
                    {billing === "trial" && days != null && days > 0 ? (
                      <span className="ml-2 text-xs text-subtle">{days}d left</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{stageMeta(r.stage).label}</td>
                  <td className="px-4 py-3">
                    {r.waiting ? (
                      <Chip tone="action">They wrote</Chip>
                    ) : r.last_message_at ? (
                      <span className="text-muted">We replied</span>
                    ) : (
                      <span className="text-subtle">Quiet</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.email || "—"}</td>
                  <td className="w-14 px-2 py-1 text-right">
                    {onArchive ? (
                      <OverflowMenu
                        label={`More for ${r.name}`}
                        items={[
                          {
                            label: archivedView ? "Unarchive" : "Archive",
                            onSelect: () => onArchive(r.id, !archivedView),
                          },
                        ]}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Rows as="ul" className="mt-6 md:hidden">
        {rows.map((r) => (
          <Row as="li" key={r.id} tone={r.waiting ? "action" : "default"} className="pr-1">
            <button type="button" onClick={() => onOpen(r.id)} className="fc-row-btn">
              <span className="min-w-0 flex-1">
                <span className="fc-row-title block">{r.name}</span>
                <FlagBadges flags={r.flags} />
                <span className="fc-row-sub block">
                  {normalizePlan(r.plan)}, {stageMeta(r.stage).label}
                </span>
              </span>
              <span className="shrink-0">
                {r.waiting ? <Chip tone="action">They wrote</Chip> : <DealerStatusChip row={r} />}
              </span>
            </button>
            {onArchive ? (
              <OverflowMenu
                label={`More for ${r.name}`}
                items={[
                  {
                    label: archivedView ? "Unarchive" : "Archive",
                    onSelect: () => onArchive(r.id, !archivedView),
                  },
                ]}
              />
            ) : null}
          </Row>
        ))}
      </Rows>
    </>
  );
}
