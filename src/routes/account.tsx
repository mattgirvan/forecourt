import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { SignInGate } from "@/lib/sb-session";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FEATURES, INGEST, PLANS, PROVISION, gbpPence, type FeatureId } from "@/lib/catalog";
import {
  confirmPayment,
  listMyOrders,
  listMyTenants,
  listProvision,
  startCheckout,
  toggleStep,
  upsertTenant,
} from "@/lib/server/commerce";
import { cn } from "@/lib/utils";
import { useSbAccessToken } from "@/lib/sb-session";
import { supabaseReady } from "@/lib/sb";

export const Route = createFileRoute("/account")({ component: AccountPage });

type TenantRow = Awaited<ReturnType<typeof listMyTenants>>[number];
type OrderRow = Awaited<ReturnType<typeof listMyOrders>>[number];
type StepRow = Awaited<ReturnType<typeof listProvision>>[number];

function AccountPage() {
  return (
    <SiteShell>
      <SignInGate
        fallback={
          <div className="mx-auto max-w-lg px-4 py-20 text-center">
            <h1 className="font-display text-3xl">Sign in to run a rooftop.</h1>
            <p className="mt-3 text-sm text-muted">
              Account is how a principal pays the pilot, drops a brand pack, and watches provision.
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
  const [features, setFeatures] = useState<Record<string, boolean>>(
    Object.fromEntries(FEATURES.map((f) => [f.id, f.defaultOn])),
  );

  async function reload() {
    if (!token) return;
    const [t, o] = await Promise.all([
      listMyTenants({ data: { token } }),
      listMyOrders({ data: { token } }),
    ]);
    setTenants(t);
    setOrders(o);
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
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const preview = params.get("preview");
    const order = params.get("order");
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
      setSites((JSON.parse(t.sites) as string[]).join(", "));
    } catch {
      setSites(t.sites);
    }
    try {
      setFeatures(JSON.parse(t.features) as Record<string, boolean>);
    } catch {
      /* keep */
    }
    setIngest(t.ingest);
  }

  async function save() {
    if (!token) return;
    if (!name.trim()) {
      setNotice("Need a dealership name.");
      return;
    }
    setBusy(true);
    try {
      const res = await upsertTenant({
        data: {
          token,
          name,
          legal,
          phone,
          email,
          domain,
          sites: sites.split(",").map((s) => s.trim()).filter(Boolean),
          features,
          ingest,
          plan: "pilot",
        },
      });
      setNotice("Saved.");
      await reload();
      setActiveId(res.id);
      return res.id;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save the rooftop.");
      return null;
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
    setBusy(true);
    try {
      const saved = await upsertTenant({
        data: {
          token,
          name,
          legal,
          phone,
          email,
          domain,
          sites: sites.split(",").map((s) => s.trim()).filter(Boolean),
          features,
          ingest,
          plan: "pilot",
        },
      });
      setActiveId(saved.id);
      const res = await startCheckout({
        data: { token, plan: "pilot", origin: window.location.origin, tenantId: saved.id },
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

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_0.9fr]">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">Start</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">Your rooftop.</h1>
        <p className="mt-3 max-w-md text-sm text-muted">Name the dealership. Pay for 60 days. We put it in your colours.</p>
        {notice && (
          <p className="mt-4 rounded-md border border-line bg-elevated px-3 py-2 text-sm">{notice}</p>
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
          <Field label="Sites" htmlFor="s">
            <Input id="s" value={sites} onChange={(e) => setSites(e.target.value)} />
          </Field>
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
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button type="button" size="lg" onClick={() => void pay()} disabled={busy || !name.trim()}>
              {busy ? "Opening…" : `Pay ${gbpPence(PLANS.pilot.setupPence)}`}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void save()} disabled={busy || !name.trim()}>
              Save
            </Button>
          </div>
        </div>

        {tenants.length > 0 && (
          <ul className="mt-8 space-y-2">
            {tenants.map((t) => (
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
                    {t.status} · {t.plan}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="space-y-6">
        <div className="relative min-h-[220px] overflow-hidden rounded-lg border border-line">
          <img src="/images/desk.jpg" alt="" className="absolute inset-0 size-full object-cover opacity-80" />
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
                    {o.plan} · {gbpPence(o.amount_pence)}
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
