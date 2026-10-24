import { gbpPence, type PlanId } from "@/lib/catalog";
import { amountLabel, lineLabel, parseBillingSites, siteBreakdown, type SiteBillRow, type SiteStatus } from "@/lib/site-billing";
import { cn } from "@/lib/utils";
import { Row, Rows, Section } from "@/components/ui/section";

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
    <Section
      testId="site-billing"
      rail="teal"
      eyebrow="Billing"
      title="Your sites"
      count={`${b.live} live`}
      actions={<span className="text-sm font-semibold tabular-nums">{gbpPence(b.total)} a month</span>}
    >
      <Rows as="ul">
        {b.rows.map((r) => (
          <Row
            as="li"
            key={r.code}
            title={r.name}
            sub={r.note || undefined}
            trailing={
              <>
                <SitePill status={r.status} />
                <SiteAmount row={r} className="w-20 shrink-0 text-sm" />
              </>
            }
          />
        ))}
      </Rows>
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
        Adding a site has no setup fee. The monthly fee starts at go live or 180 days after payment, whichever comes first. An archived site comes off your bill at the end of this billing period, with no refund for part months. You can restore it within 30 days.
      </p>
    </Section>
  );
}
