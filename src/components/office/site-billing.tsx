import { Fragment, useEffect, useState } from "react";
import { gbpPence } from "@/lib/catalog";
import { listOfficeSiteBilling, setSiteState } from "@/lib/server/site-billing-server";
import { archiveConfirmCopy, goLiveConfirmCopy, lineLabel, totalIf } from "@/lib/site-billing";
import { SiteAmount, SitePill } from "@/components/account/site-billing";

export type OfficeSiteBillingRow = Awaited<ReturnType<typeof listOfficeSiteBilling>>[number];

const PLAN: Record<string, string> = { group: "Group", franchise: "Franchise", site: "Site" };

export function OfficeSiteBillingPanel({ token }: { token: string }) {
  const [rows, setRows] = useState<OfficeSiteBillingRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () =>
    listOfficeSiteBilling({ data: { token } })
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load sites."));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  if (err) return <p className="text-sm text-muted">{err}</p>;
  if (!rows) return <p className="text-sm text-muted">Loading sites.</p>;
  return (
    <OfficeSiteBilling
      rows={rows}
      onChange={async (tenantId, code, to) => {
        const r = await setSiteState({ data: { token, tenantId, code, to } });
        await load();
        return r.message;
      }}
    />
  );
}

type Change = (tenantId: number, code: string, to: "live" | "archived") => Promise<string>;
type Pending = { tenantId: number; code: string; name: string; to: "live" | "archived"; plan: string };

function confirmCopy(p: Pending, a: OfficeSiteBillingRow) {
  const after = totalIf(a.plan, a.billingSites, p.code, p.to);
  return p.to === "archived" ? archiveConfirmCopy(p.name, a.total, after, a.periodEnd) : goLiveConfirmCopy(p.name, a.total, after);
}

/** Each Group and Franchise account, its sites, what they are billed, and Go live or Archive. */
export function OfficeSiteBilling({
  rows,
  onChange,
  initialPending = null,
  initialNotice = null,
}: {
  rows: OfficeSiteBillingRow[];
  onChange?: Change;
  initialPending?: Pending | null;
  initialNotice?: string | null;
}) {
  const [pending, setPending] = useState<Pending | null>(initialPending);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(initialNotice);
  const dry = rows.some((a) => a.mode !== "live");
  const run = async () => {
    if (!pending || !onChange) return;
    setBusy(true);
    try {
      setNotice(await onChange(pending.tenantId, pending.code, pending.to));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not change that site.");
    } finally {
      setBusy(false);
      setPending(null);
    }
  };
  if (!rows.length) return <p className="text-sm text-muted">No Group or Franchise accounts yet.</p>;
  return (
    <div className="space-y-4" data-testid="office-site-billing">
      <p className="text-sm text-muted">
        Setting up and archived sites are not billed. Group bills at least 2 sites.{" "}
        {dry ? "Billing sync is in dry run. Sites change state here and Stripe is not changed." : "Going live or archiving a site updates Stripe."}
      </p>
      {notice ? (
        <p role="status" className="rounded-xl border border-line bg-elevated px-3 py-2 text-sm" data-testid="site-notice">
          {notice}
        </p>
      ) : null}
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
              <Fragment key={r.code}>
              <li className="flex items-center justify-between gap-3 border-t border-line py-2 text-sm">
                <div className="min-w-0 flex-1 truncate">
                  <span>{r.name}</span>
                  <span className="ml-2 hidden text-xs text-subtle sm:inline">{r.code}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                  <SitePill status={r.status} />
                  <SiteAmount row={r} className="w-16 shrink-0 sm:w-20" />
                  {a.canChange && onChange && r.status !== "archived" ? (
                    <button
                      type="button"
                      className="w-[4.5rem] shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-medium bg-elevated hover:text-fg disabled:opacity-50"
                      disabled={busy}
                      onClick={() => setPending({ tenantId: a.id, code: r.code, name: r.name, plan: a.plan, to: r.status === "live" ? "archived" : "live" })}
                    >
                      {r.status === "live" ? "Archive" : "Go live"}
                    </button>
                  ) : a.canChange && onChange ? (
                    <span className="w-[4.5rem] shrink-0" />
                  ) : null}
                </div>
              </li>
              {pending && pending.tenantId === a.id && pending.code === r.code ? (
                <li className="rounded-xl border border-line bg-elevated p-3 text-sm" data-testid="site-confirm">
                  <p>{confirmCopy(pending, a)}</p>
                  {dry ? <p className="mt-1 text-xs text-subtle">Dry run. Stripe is not changed.</p> : null}
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-fg disabled:opacity-50" disabled={busy} onClick={() => void run()}>
                      {pending.to === "live" ? "Yes, go live" : "Yes, archive"}
                    </button>
                    <button type="button" className="rounded-full border border-line px-3 py-1 text-xs" disabled={busy} onClick={() => setPending(null)}>
                      Cancel
                    </button>
                  </div>
                </li>
              ) : null}
              </Fragment>
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
