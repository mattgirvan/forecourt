import { SkeletonCards } from "@/components/ui/skeleton";
import { Fragment, useEffect, useState } from "react";
import { gbpPence } from "@/lib/catalog";
import { listOfficeSiteBilling, setSiteState } from "@/lib/server/site-billing-server";
import { archiveConfirmCopy, goLiveConfirmCopy, lineLabel, totalIf } from "@/lib/site-billing";
import { SiteAmount, SitePill } from "@/components/account/site-billing";
import { OverflowMenu, Row, Rows, Section } from "@/components/ui/section";

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
  if (!rows) return <SkeletonCards count={1} label="Loading sites" />;
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
  return p.to === "archived" ? archiveConfirmCopy(p.name, a.total, after, a.periodEnd) : goLiveConfirmCopy(p.name, a.total, after, a.plan);
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
    <div className="fc-section-stack" data-testid="office-site-billing">
      <p className="text-sm text-muted">
        Setting up and archived sites are not billed. Group bills at least 2 sites.
        <span className="mt-1 block text-xs text-subtle" data-testid="site-billing-hint">
          {dry ? "Billing sync is in dry run. Stripe is not changed." : "Going live or archiving a site updates Stripe."}
        </span>
      </p>
      {notice ? (
        <p role="status" className="rounded-xl border border-line bg-elevated px-3 py-2 text-sm" data-testid="site-notice">
          {notice}
        </p>
      ) : null}
      {rows.map((a) => (
        <Section
          key={a.id}
          rail="teal"
          title={a.name}
          eyebrow={`${PLAN[a.plan]}, ${a.live} live of ${a.rows.length}`}
          count={`${gbpPence(a.total)} a month`}
          actions={<span className="hidden text-xs text-subtle sm:inline">{a.hasSubscription ? "Subscription on file" : "No subscription yet"}</span>}
        >
          <Rows as="ul">
            {a.rows.map((r) => (
              <Fragment key={r.code}>
              <Row
                as="li"
                title={r.name}
                sub={
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <SitePill status={r.status} />
                    <SiteAmount row={r} className="text-left" />
                    <span className="hidden text-subtle sm:inline">{r.code}</span>
                  </span>
                }
                trailing={
                  <>
                    {a.canChange && onChange && r.status === "setting_up" ? (
                      <button
                        type="button"
                        className="fc-tap inline-flex w-[5.25rem] shrink-0 items-center justify-center rounded-xl border border-line bg-elevated px-2.5 text-xs font-medium hover:text-fg disabled:opacity-50"
                        disabled={busy}
                        onClick={() => setPending({ tenantId: a.id, code: r.code, name: r.name, plan: a.plan, to: "live" })}
                      >
                        Go live
                      </button>
                    ) : a.canChange && onChange && r.status === "live" ? (
                      <OverflowMenu
                        label={`More for ${r.name}`}
                        items={[
                          {
                            label: "Archive",
                            disabled: busy,
                            onSelect: () => setPending({ tenantId: a.id, code: r.code, name: r.name, plan: a.plan, to: "archived" }),
                          },
                        ]}
                      />
                    ) : null}
                  </>
                }
              />
              {pending && pending.tenantId === a.id && pending.code === r.code ? (
                <li className="rounded-[14px] border border-line bg-[var(--fc-solid-2)] p-3 text-sm" data-testid="site-confirm">
                  <p>{confirmCopy(pending, a)}</p>
                  {dry ? <p className="mt-1 text-xs text-subtle">Dry run. Stripe is not changed.</p> : null}
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="fc-tap rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50" disabled={busy} onClick={() => void run()}>
                      {pending.to === "live" ? "Yes, go live" : "Yes, archive"}
                    </button>
                    <button type="button" className="fc-tap rounded-xl border border-line px-4 text-sm" disabled={busy} onClick={() => setPending(null)}>
                      Cancel
                    </button>
                  </div>
                </li>
              ) : null}
              </Fragment>
            ))}
          </Rows>
          <p className="mt-3 text-xs text-subtle">
            {a.lines.map((l) => `${lineLabel(l)} = ${gbpPence(l.unitPence * l.quantity)}`).join(", ")}
          </p>
        </Section>
      ))}
    </div>
  );
}
