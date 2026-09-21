import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { DealerPortal } from "@/components/account/portal";
import { SignInGate } from "@/lib/sb-session";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FEATURES,
  INGEST,
  PLAN_ORDER,
  PLANS,
  PROVISION,
  defaultFeaturesFor,
  gbpPence,
  isBillingKind,
  isPlanId,
  monthTotalPence,
  normalizeBilling,
  normalizePlan,
  setupDuePence,
  type BillingKind,
  type FeatureId,
  type PlanId,
} from "@/lib/catalog";
import {
  confirmPayment,
  listMyOrders,
  listMyTenants,
  listProvision,
  startCheckout,
  toggleStep,
  upsertTenant,
} from "@/lib/server/commerce";
import { whoAmI } from "@/lib/server/portal";
import { packageLive } from "@/lib/team";
import { cn } from "@/lib/utils";
import { useSbAccessToken } from "@/lib/sb-session";
import { supabaseReady } from "@/lib/sb";

type Search = {
  plan?: PlanId;
  billing?: BillingKind;
  checkout?: string;
  paid?: string;
  canceled?: string;
  session_id?: string;
  preview?: string;
  order?: string;
};

export const Route = createFileRoute("/account")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    plan: isPlanId(raw.plan) ? raw.plan : undefined,
    billing: isBillingKind(raw.billing) ? raw.billing : undefined,
    checkout: typeof raw.checkout === "string" ? raw.checkout : undefined,
    paid: typeof raw.paid === "string" ? raw.paid : undefined,
    canceled: typeof raw.canceled === "string" ? raw.canceled : undefined,
    session_id: typeof raw.session_id === "string" ? raw.session_id : undefined,
    preview: typeof raw.preview === "string" ? raw.preview : undefined,
    order: typeof raw.order === "string" ? raw.order : undefined,
  }),
  component: AccountPage,
});

type TenantRow = Awaited<ReturnType<typeof listMyTenants>>[number];
type OrderRow = Awaited<ReturnType<typeof listMyOrders>>[number];
type StepRow = Awaited<ReturnType<typeof listProvision>>[number];

function AccountPage() {
  return (
    <SiteShell>
      <SignInGate
        fallback={
          <div className="mx-auto max-w-lg px-4 py-20 text-center">
            <h1 className="font-display text-3xl">Your Forecourt account.</h1>
            <p className="mt-3 text-sm text-muted">
              Package, billing, receipts, and a line to us. Sign in with the email you used to start.
            </p>
            <Button className="mt-6" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        }
      >
        <AccountInner />
      </SignInGate>
    </SiteShell>
  );
}

function AccountInner() {
  const search = Route.useSearch();
  const token = useSbAccessToken();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [legal, setLegal] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [domain, setDomain] = useState("");
  const [sites, setSites] = useState("Main");
  const [ingest, setIngest] = useState("excel");
  const [features, setFeatures] = useState<Record<string, boolean>>(defaultFeaturesFor("site", "trial"));
  const [plan, setPlan] = useState<PlanId>(search.plan ?? "site");
  const [billing, setBilling] = useState<BillingKind>(
    search.billing ?? (search.plan && search.plan !== "site" ? "subscription" : "trial"),
  );
  const [siteCount, setSiteCount] = useState(2);
  const [contractOk, setContractOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [team, setTeam] = useState(false);
  const [wantCheckout, setWantCheckout] = useState(Boolean(search.plan || search.checkout));

  const chosen = PLANS[plan];
  const trialLocked = plan !== "site";
  const effectiveBilling: BillingKind = trialLocked ? "subscription" : billing;
  const converting = useMemo(() => {
    const t = tenants.find((x) => x.id === activeId);
    if (!t) return false;
    const p = normalizePlan(t.plan);
    const b = normalizeBilling(p, t.billing);
    return p === "site" && b === "trial" && (t.status === "trial" || t.status === "paid") && effectiveBilling === "subscription";
  }, [tenants, activeId, effectiveBilling]);

  const setup = setupDuePence(plan, effectiveBilling, converting);
  const monthly = monthTotalPence(plan, siteCount);
  const needsContract = Boolean(chosen.contractMonths);

  useEffect(() => {
    if (plan !== "site" && billing !== "subscription") setBilling("subscription");
  }, [plan, billing]);

  useEffect(() => {
    setFeatures(defaultFeaturesFor(plan, effectiveBilling));
    if (plan === "franchise" || plan === "group") setIngest("manufacturer");
    if (plan === "site" && effectiveBilling === "trial") setIngest("excel");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, effectiveBilling]);

  async function reload() {
    if (!token) return;
    const [t, o, me] = await Promise.all([
      listMyTenants({ data: { token } }),
      listMyOrders({ data: { token } }),
      whoAmI({ data: { token } }).catch(() => ({ email: "", team: false })),
    ]);
    setTenants(t);
    setOrders(o);
    setTeam(me.team);
    const current = t.find((x) => x.id === activeId) ?? t[0];
    if (current) {
      setActiveId(current.id);
      setSteps(await listProvision({ data: { token, tenantId: current.id } }));
    }
  }

  useEffect(() => {
    if (!supabaseReady()) {
      setNotice("Supabase anon key is missing on this deploy.");
      return;
    }
    if (!token) return;
    void reload().catch(() => setNotice("Could not load account."));
    const sessionId = search.session_id;
    const preview = search.preview;
    const order = search.order;
    if (sessionId || preview) {
      void confirmPayment({
        data: {
          token,
          sessionId: sessionId ?? undefined,
          previewOrderId: order ? Number(order) : undefined,
        },
      }).then((r) => {
        if (r.ok) setNotice("Paid. We’ll set up your desk.");
        void reload();
      });
    }
    if (search.canceled) setNotice("Checkout was cancelled. Nothing was taken.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!activeId || !token) return;
    void listProvision({ data: { token, tenantId: activeId } }).then(setSteps);
  }, [activeId, token]);

  function loadTenant(t: TenantRow) {
    setActiveId(t.id);
    setName(t.name);
    setLegal(t.legal);
    setPhone(t.phone);
    setEmail(t.email);
    setDomain(t.domain);
    try {
      const list = JSON.parse(t.sites) as string[];
      setSites(list.join(", "));
      setSiteCount(Math.max(2, list.length));
    } catch {
      setSites(t.sites);
    }
    try {
      setFeatures(JSON.parse(t.features) as Record<string, boolean>);
    } catch {
      /* keep */
    }
    setIngest(t.ingest);
    const p = normalizePlan(t.plan);
    setPlan(p);
    setBilling(normalizeBilling(p, t.billing));
    if (typeof t.site_count === "number" && t.site_count > 0) setSiteCount(t.site_count);
  }

  async function persist() {
    if (!token) return null;
    if (!name.trim()) {
      setNotice("Need a dealership name.");
      return null;
    }
    const siteList = sites
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const count = plan === "group" ? Math.max(PLANS.group.minSites, siteCount, siteList.length) : siteList.length || 1;
    const res = await upsertTenant({
      data: {
        token,
        name,
        legal,
        phone,
        email,
        domain,
        sites: siteList.length ? siteList : ["Main"],
        features,
        ingest,
        plan,
        billing: effectiveBilling,
        siteCount: count,
      },
    });
    setActiveId(res.id);
    return { ...res, siteCount: count };
  }

  async function save() {
    setBusy(true);
    try {
      const res = await persist();
      if (!res) return;
      setNotice("Saved.");
      await reload();
      setActiveId(res.id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save the site.");
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!token) return;
    if (!name.trim()) {
      setNotice("Need a dealership name.");
      return;
    }
    if (needsContract && !contractOk) {
      setNotice("Franchise and group are a 12-month contract. Tick to continue.");
      return;
    }
    if (!termsOk) {
      setNotice("Tick that you agree to the terms.");
      return;
    }
    setBusy(true);
    try {
      const saved = await persist();
      if (!saved) return;
      const res = await startCheckout({
        data: {
          token,
          plan,
          billing: effectiveBilling,
          origin: window.location.origin,
          tenantId: saved.id,
          siteCount: saved.siteCount,
          convertFromTrial: converting,
        },
      });
      if (res.url) {
        window.location.assign(res.url);
        return;
      }
      setNotice(res.message ?? "Checkout didn’t open. Try again.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not start checkout.");
    } finally {
      setBusy(false);
    }
  }

  const payLabel = (() => {
    if (busy) return "Opening…";
    if (effectiveBilling === "trial") return `Start 60 days: ${gbpPence(setup)}`;
    if (converting) return `Convert trial: ${gbpPence(setup)} + ${gbpPence(monthly)}/mo`;
    if (chosen.perSite) {
      return `Start contract: ${gbpPence(setup)} + ${gbpPence(monthly)}/mo`;
    }
    return `Start subscription: ${gbpPence(setup)} + ${gbpPence(monthly)}/mo`;
  })();

  const live = tenants.filter((t) => packageLive(t.status));
  const current = live.find((t) => t.id === activeId) ?? live[0] ?? null;
  const showPortal = Boolean(current) && !search.plan && !wantCheckout;

  async function convert() {
    if (!token || !current) return;
    setBusy(true);
    try {
      const res = await startCheckout({
        data: {
          token,
          plan: "site",
          billing: "subscription",
          origin: window.location.origin,
          tenantId: current.id,
          siteCount: current.site_count ?? 1,
          convertFromTrial: true,
        },
      });
      if (res.url) {
        window.location.assign(res.url);
        return;
      }
      setNotice(res.message ?? "Checkout didn’t open. Try again.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not start checkout.");
    } finally {
      setBusy(false);
    }
  }

  if (team && tenants.length === 0 && !search.plan && !wantCheckout) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">You’re on the team.</h1>
        <p className="mt-3 text-sm text-muted">Dealer accounts live here. The office is where you work the files.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/office" search={{}}>
              Open the office
            </Link>
          </Button>
          <Button variant="secondary" type="button" onClick={() => setWantCheckout(true)}>
            Start a test package
          </Button>
        </div>
      </div>
    );
  }

  if (showPortal && current && token) {
    return (
      <DealerPortal
        token={token}
        tenant={current}
        converting={busy}
        onConvert={normalizeBilling(normalizePlan(current.plan), current.billing) === "trial" ? () => void convert() : undefined}
        onNewPackage={() => setWantCheckout(true)}
      />
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_0.9fr]">
      <div>
        <p className="text-[13px] font-medium text-muted">Get started</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Your package.</h1>
        <p className="mt-3 max-w-md text-sm text-muted">
          Site can start on 60 days. Franchise and group are a 12-month subscription.
        </p>
        {current && (
          <button
            type="button"
            className="mt-3 text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
            onClick={() => setWantCheckout(false)}
          >
            Back to account
          </button>
        )}
        {notice && (
          <p className="mt-4 rounded-md border border-line bg-elevated px-3 py-2 text-sm">{notice}</p>
        )}

        <div className="mt-8 grid gap-2 sm:grid-cols-3">
          {PLAN_ORDER.map((id) => {
            const p = PLANS[id];
            const on = plan === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPlan(id)}
                className={cn(
                  "rounded-2xl border px-4 py-4 text-left transition-colors",
                  on ? "border-line-strong bg-elevated" : "border-line bg-bg hover:border-line-strong",
                )}
              >
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">{p.tag}</div>
                <div className="mt-1 text-lg font-semibold tracking-tight">{p.name}</div>
                <div className="mt-2 text-xs leading-relaxed text-muted">
                  {p.trial ? "60-day trial available" : "12-month contract"}
                </div>
              </button>
            );
          })}
        </div>

        {plan === "site" && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setBilling("trial")}
              className={cn(
                "rounded-2xl border px-4 py-3 text-left",
                effectiveBilling === "trial" ? "border-line-strong bg-elevated" : "border-line",
              )}
            >
              <div className="text-sm font-medium">60-day trial</div>
              <div className="mt-1 text-xs text-muted">
                {gbpPence(PLANS.site.trialPence!)} once. Sales + manager. Comes off setup if you stay.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setBilling("subscription")}
              className={cn(
                "rounded-2xl border px-4 py-3 text-left",
                effectiveBilling === "subscription" ? "border-line-strong bg-elevated" : "border-line",
              )}
            >
              <div className="text-sm font-medium">Subscribe</div>
              <div className="mt-1 text-xs text-muted">
                {gbpPence(PLANS.site.setupPence)} setup + {gbpPence(PLANS.site.monthPence)}/month. Full site seats.
              </div>
            </button>
          </div>
        )}

        {plan !== "site" && (
          <p className="mt-4 rounded-md border border-line bg-surface px-3 py-2 text-sm text-muted">{chosen.why}</p>
        )}

        <div className="mt-8 space-y-4">
          <Field label="Dealership" htmlFor="n">
            <Input id="n" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Legal name" htmlFor="l">
            <Input id="l" value={legal} onChange={(e) => setLegal(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Showroom phone" htmlFor="p">
              <Input id="p" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Sales inbox" htmlFor="e">
              <Input id="e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          <Field label="Website you’d like" htmlFor="d">
            <Input id="d" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="sales.yourdealership.co.uk" />
          </Field>
          <Field label={plan === "group" ? "Sites (comma separated)" : "Site"} htmlFor="s">
            <Input id="s" value={sites} onChange={(e) => setSites(e.target.value)} />
          </Field>
          {plan === "group" && (
            <Field label="How many sites" htmlFor="sc">
              <Input
                id="sc"
                type="number"
                min={PLANS.group.minSites}
                value={siteCount}
                onChange={(e) => setSiteCount(Math.max(PLANS.group.minSites, Number(e.target.value) || PLANS.group.minSites))}
              />
            </Field>
          )}
          <div>
            <Label>Ingest</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {INGEST.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setIngest(i.id)}
                  className={cn(
                    "h-9 rounded-sm px-3 text-xs",
                    ingest === i.id ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
                  )}
                >
                  {i.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Features</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FEATURES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFeatures((prev) => ({ ...prev, [f.id]: !prev[f.id] }))}
                  className={cn(
                    "h-9 rounded-sm px-3 text-xs",
                    features[f.id as FeatureId] ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-line bg-surface px-3 py-3 text-sm">
            <div className="font-medium">Before you pay</div>
            <ul className="mt-2 space-y-1 text-muted">
              <li>Due now: {gbpPence(setup)}</li>
              <li>
                Then {gbpPence(monthly)}
                {chosen.perSite ? ` / month for ${siteCount} sites` : " / month"}
                {chosen.contractMonths ? ` · ${chosen.contractMonths}-month contract` : " · month to month"}
              </li>
              {effectiveBilling === "trial" && <li>60-day site trial. The £1,500 comes off setup if you stay.</li>}
              <li>
                Full terms, including payment and sign-off:{" "}
                <Link to="/terms" className="text-fg underline-offset-4 hover:underline">
                  Terms
                </Link>
                . Isolation:{" "}
                <Link to="/trust" className="text-fg underline-offset-4 hover:underline">
                  Trust
                </Link>
                .
              </li>
            </ul>
          </div>
          {needsContract && (
            <label className="flex items-start gap-3 rounded-md border border-line bg-surface px-3 py-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={contractOk}
                onChange={(e) => setContractOk(e.target.checked)}
              />
              <span>
                {chosen.contractMonths}-month contract. Setup {gbpPence(setup)}, then {gbpPence(monthly)}
                {chosen.perSite ? ` for ${siteCount} sites` : ""} each month. No 60-day trial on {chosen.name.toLowerCase()}.
              </span>
            </label>
          )}
          <label className="flex items-start gap-3 rounded-md border border-line bg-surface px-3 py-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={termsOk}
              onChange={(e) => setTermsOk(e.target.checked)}
            />
            <span>
              I agree to the{" "}
              <Link to="/terms" className="underline-offset-4 hover:underline">
                terms
              </Link>
              ,{" "}
              <Link to="/privacy" className="underline-offset-4 hover:underline">
                privacy
              </Link>
              , and{" "}
              <Link to="/dpa" className="underline-offset-4 hover:underline">
                data
              </Link>{" "}
              addendum. This is a business purchase.
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              type="button"
              size="lg"
              onClick={() => void pay()}
              disabled={busy || !name.trim() || !termsOk || (needsContract && !contractOk)}
            >
              {payLabel}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void save()} disabled={busy || !name.trim()}>
              Save
            </Button>
          </div>
        </div>

        {tenants.length > 0 && (
          <ul className="mt-8 space-y-2">
            {tenants.map((t) => {
              const p = normalizePlan(t.plan);
              const b = normalizeBilling(p, t.billing);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => loadTenant(t)}
                    className={cn(
                      "w-full rounded-md border px-3 py-2 text-left text-sm",
                      t.id === activeId ? "border-line-strong bg-elevated" : "border-line",
                    )}
                  >
                    <span className="font-medium">{t.name}</span>
                    <span className="ml-2 font-mono text-[11px] uppercase text-subtle">
                      {t.status} · {p}
                      {b === "trial" ? " trial" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <aside className="space-y-6">
        <div className="relative min-h-[220px] overflow-hidden rounded-lg border border-line">
          <img src="/images/desk.jpg" alt="" className="absolute inset-0 size-full object-cover opacity-80" />
        </div>
        <div className="rounded-lg border border-line p-5">
          <h2 className="font-display text-2xl tracking-tight">{chosen.name}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{chosen.body}</p>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            {chosen.includes.map((line) => (
              <li key={line} className="border-b border-line py-2">
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm">
            {effectiveBilling === "trial" ? (
              <>
                First charge {gbpPence(setup)}. Monthly starts when you convert.
              </>
            ) : (
              <>
                First invoice {gbpPence(setup + monthly)}
                {chosen.perSite ? ` (${siteCount} sites)` : ""}. Then {gbpPence(monthly)} / month.
              </>
            )}
          </p>
        </div>
        <div className="rounded-lg border border-line p-5">
          <h2 className="font-display text-2xl tracking-tight">After you pay</h2>
          <ol className="mt-3 space-y-2">
            {PROVISION.map((p) => {
              const row = steps.find((s) => s.step === p.id);
              const done = row?.done ?? false;
              return (
                <li key={p.id} className="flex items-start justify-between gap-3 border-b border-line py-2">
                  <div>
                    <div className="text-sm">{p.title}</div>
                    <div className="text-xs text-muted">{p.body}</div>
                  </div>
                  {activeId && (
                    <button
                      type="button"
                      className={cn(
                        "h-8 shrink-0 rounded-sm px-2 font-mono text-[10px] uppercase",
                        done ? "bg-ok/15 text-ok" : "bg-elevated text-muted",
                      )}
                      onClick={() =>
                        token &&
                        void toggleStep({ data: { token, tenantId: activeId, step: p.id, done: !done } }).then(() =>
                          listProvision({ data: { token, tenantId: activeId } }).then(setSteps),
                        )
                      }
                    >
                      {done ? "Done" : "Open"}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <div className="rounded-lg border border-line p-5">
          <h2 className="font-medium">Orders</h2>
          {orders.length === 0 ? (
            <p className="mt-2 text-sm text-muted">None yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {orders.map((o) => (
                <li key={o.id} className="flex justify-between border-b border-line py-2">
                  <span>
                    {normalizePlan(o.plan)}
                    {"kind" in o && o.kind ? ` · ${o.kind}` : ""} · {gbpPence(o.amount_pence)}
                  </span>
                  <span className="font-mono text-[11px] uppercase text-subtle">{o.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
