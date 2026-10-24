import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PillRow } from "@/components/ui/pill-row";
import { Row, Rows, Section } from "@/components/ui/section";
import { SiteAmount, SitePill } from "@/components/account/site-billing";
import { gbpPence, type PlanId } from "@/lib/catalog";
import {
  lineLabel,
  parseBillingSites,
  restoreUntil,
  siteBreakdown,
  type BillingSite,
  type SiteStatus,
} from "@/lib/site-billing";
import { formatUkDate } from "@/lib/uk-date";
import { cn } from "@/lib/utils";

type Filter = "all" | SiteStatus;

function siteSub(s: BillingSite, note: string): string {
  if (s.status === "archived") {
    const until = restoreUntil(s.archivedAt);
    const when = s.archivedAt ? `Archived ${formatUkDate(s.archivedAt)}.` : "Archived.";
    return until ? `${when} Restore until ${formatUkDate(until)}.` : when;
  }
  if (s.status === "setting_up") return "Billing starts on its go live day";
  if (s.liveAt)
    return `Live since ${formatUkDate(s.liveAt)}${note ? `, ${note.toLowerCase()}` : ""}`;
  return note;
}

/** Account Sites: filter pills, one row per site, restore on archived rows (restoring happens in the desk). */
export function AccountSites({
  plan,
  sites,
  deskUrl,
  onAddSite,
  preLive = false,
}: {
  /** Before the desk goes live no site is billed yet, whatever the saved list says. */
  preLive?: boolean;
  plan: PlanId;
  sites: unknown;
  deskUrl: string | null;
  onAddSite: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const list = parseBillingSites(sites).map((s) =>
    preLive && s.status === "live" ? { ...s, status: "setting_up" as const } : s,
  );
  const b = siteBreakdown(plan, list);
  const count = (f: Filter) =>
    f === "all" ? list.length : list.filter((s) => s.status === f).length;
  const shown = list
    .map((s, i) => ({ s, r: b.rows[i]! }))
    .filter(({ s }) => filter === "all" || s.status === filter);
  return (
    <div className="fc-section-stack" data-testid="account-sites">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillRow
          label="Show sites"
          kind="radio"
          value={filter}
          onChange={setFilter}
          options={(
            [
              ["all", "All"],
              ["live", "Live"],
              ["setting_up", "Setting up"],
              ["archived", "Archived"],
            ] as const
          ).map(([id, label]) => ({ id, label, count: count(id) }))}
        />
        <Button variant="secondary" className="min-h-11 w-full sm:w-auto" onClick={onAddSite}>
          Add a site
        </Button>
      </div>
      <Section
        title="Your sites"
        rail="blue"
        testId="site-billing"
        actions={
          <span className="text-sm text-[var(--fc-text-dim)] tabular-nums">
            {gbpPence(b.total)} a month
          </span>
        }
      >
        {shown.length === 0 ? (
          <p className="text-sm text-muted">No sites here.</p>
        ) : (
          <Rows as="ul">
            {shown.map(({ s, r }) => (
              <Row
                as="li"
                key={s.code}
                className={cn("fc-site-row", s.status === "archived" && "is-archived")}
                testId={`site-${s.code}`}
                title={s.name}
                sub={siteSub(s, r.note) || undefined}
                trailing={
                  <>
                    <SiteAmount row={r} className="shrink-0 text-sm font-semibold" />
                    {s.status === "archived" ? (
                      restoreUntil(s.archivedAt) &&
                      Date.parse(restoreUntil(s.archivedAt)!) > Date.now() &&
                      deskUrl ? (
                        <Button variant="secondary" size="sm" className="min-h-11" asChild>
                          <a
                            href={deskUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Restore ${s.name} in your desk`}
                          >
                            Restore
                          </a>
                        </Button>
                      ) : null
                    ) : (
                      <SitePill status={s.status} />
                    )}
                  </>
                }
              />
            ))}
          </Rows>
        )}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--fc-row-border)] pt-3 text-sm">
          <span className="text-[var(--fc-text-dim)]">
            {b.lines.map(lineLabel).join(", ") || "No billed sites yet"}
          </span>
          <span className="font-semibold tabular-nums">{gbpPence(b.total)} a month</span>
        </div>
      </Section>
      <p className="text-[12.5px] text-[var(--fc-text-faint)]">
        A new site has no setup fee and starts billing on its go live day. An archived site stops
        billing at the end of the period and can be restored in your desk for 30 days.
      </p>
    </div>
  );
}
