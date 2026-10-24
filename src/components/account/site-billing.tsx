import { gbpPence, type PlanId } from "@/lib/catalog";
import { amountLabel, lineLabel, parseBillingSites, siteBreakdown, type SiteBillRow, type SiteStatus } from "@/lib/site-billing";
import { cn } from "@/lib/utils";

const STATUS: Record<string, string> = { live: "Live", setting_up: "Setting up", archived: "Archived" };

/** Live is green, matching the account Live pill. Setting up and Archived stay grey. */
export function SitePill({ status }: { status: SiteStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px]",
        status === "live" ? "border-[#4BA82E]/40 bg-[#4BA82E]/[.22] text-[#4BA82E]/[.85]" : "border-line bg-elevated text-subtle",
      )}
    >
      {status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {STATUS[status]}
    </span>
  );
}

/** Amount column: "Included" and "Not billed" in grey, prices in full. */
export function SiteAmount({ row, className }: { row: SiteBillRow; className?: string }) {
  const text = amountLabel(row);
  const grey = row.included || row.status !== "live";
  return <span className={cn("text-right", grey ? "text-subtle" : "tabular-nums", className)}>{text}</span>;
}

/** Account billing: what each site adds to the month (Group and Franchise only). */
export function SiteBillingSummary({ plan, sites }: { plan: PlanId; sites: unknown }) {
  if (plan !== "group" && plan !== "franchise") return null;
  const b = siteBreakdown(plan, parseBillingSites(sites));
  return (
    <div className="rounded-[1.75rem] border border-line bg-surface p-6 sm:p-8" data-testid="site-billing">
      <h2 className="text-2xl font-semibold tracking-tight">Your sites</h2>
      <p className="mt-2 text-sm text-muted">
        {b.live} live {b.live === 1 ? "site" : "sites"}, {gbpPence(b.total)} a month.
      </p>
      <ul className="mt-6">
        {b.rows.map((r) => (
          <li key={r.code} className="flex items-start justify-between gap-4 border-b border-line py-3 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{r.name}</div>
              {r.note && <div className="mt-0.5 text-xs text-subtle">{r.note}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <SitePill status={r.status} />
              <SiteAmount row={r} className="w-20 shrink-0" />
            </div>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-1.5 text-sm">
        {b.lines.map((l) => (
          <div key={l.key} className="flex justify-between gap-4">
            <dt className="text-muted">{lineLabel(l)}</dt>
            <dd className="tabular-nums">{gbpPence(l.unitPence * l.quantity)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-line pt-2 font-medium">
          <dt>Each month</dt>
          <dd className="tabular-nums">{gbpPence(b.total)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-subtle">
        Adding a site has no setup fee. A new site starts billing on its go live day. An archived site stops billing at the end of the current billing period.
      </p>
    </div>
  );
}
