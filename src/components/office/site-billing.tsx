import { useEffect, useState } from "react";
import { gbpPence } from "@/lib/catalog";
import { listOfficeSiteBilling } from "@/lib/server/site-billing-server";
import { lineLabel } from "@/lib/site-billing";
import { SiteAmount, SitePill } from "@/components/account/site-billing";

export type OfficeSiteBillingRow = Awaited<ReturnType<typeof listOfficeSiteBilling>>[number];

const PLAN: Record<string, string> = { group: "Group", franchise: "Franchise", site: "Site" };

export function OfficeSiteBillingPanel({ token }: { token: string }) {
  const [rows, setRows] = useState<OfficeSiteBillingRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void listOfficeSiteBilling({ data: { token } })
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load sites."));
  }, [token]);
  if (err) return <p className="text-sm text-muted">{err}</p>;
  if (!rows) return <p className="text-sm text-muted">Loading sites.</p>;
  return <OfficeSiteBilling rows={rows} />;
}

/** Read only: each Group and Franchise account, its sites and what they are billed. */
export function OfficeSiteBilling({ rows }: { rows: OfficeSiteBillingRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted">No Group or Franchise accounts yet.</p>;
  return (
    <div className="space-y-4" data-testid="office-site-billing">
      <p className="text-sm text-muted">
        Read only. Only live sites are billed. Site changes update Stripe when a site goes live or is archived, never from here.
      </p>
      {rows.map((a) => (
        <section key={a.id} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold">{a.name}</h3>
              <p className="text-xs text-subtle">
                {PLAN[a.plan]} · {a.live} live of {a.rows.length} · {a.hasSubscription ? "Subscription on file" : "No subscription yet"}
              </p>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold tabular-nums">{gbpPence(a.total)}</div>
              <div className="text-xs text-subtle">a month</div>
            </div>
          </div>
          <ul className="mt-3">
            {a.rows.map((r) => (
              <li key={r.code} className="flex items-center justify-between gap-3 border-t border-line py-2 text-sm">
                <div className="min-w-0">
                  <span className="truncate">{r.name}</span>
                  <span className="ml-2 text-xs text-subtle">{r.code}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <SitePill status={r.status} />
                  <SiteAmount row={r} className="w-20 shrink-0" />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-subtle">
            {a.lines.map((l) => `${lineLabel(l)} = ${gbpPence(l.unitPence * l.quantity)}`).join(" · ")}
          </p>
        </section>
      ))}
    </div>
  );
}
