import { gbpPence, type PlanId } from "@/lib/catalog";
import { parseBillingSites, siteBreakdown } from "@/lib/site-billing";
import { cn } from "@/lib/utils";

const STATUS: Record<string, string> = { live: "Live", setting_up: "Setting up", archived: "Archived" };

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
              <div className="mt-0.5 text-xs text-subtle">{r.note}</div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className={cn("rounded-full border border-line px-2 py-0.5 text-[11px]", r.status === "live" ? "text-fg" : "text-subtle")}>
                {STATUS[r.status]}
              </span>
              <span className="w-16 text-right tabular-nums">{r.pence ? gbpPence(r.pence) : "£0"}</span>
            </div>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-1.5 text-sm">
        {b.lines.map((l) => (
          <div key={l.key} className="flex justify-between gap-4">
            <dt className="text-muted">
              {l.label} {l.quantity > 1 || l.key !== "franchise_base" ? `x ${l.quantity}` : ""}
            </dt>
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
