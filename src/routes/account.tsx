import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { SignInGate } from "@/lib/auth/gates";
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
    const [t, o] = await Promise.all([listMyTenants(), listMyOrders()]);
    setTenants(t);
    setOrders(o);
    const current = t.find((x) => x.id === activeId) ?? t[0];
    if (current) {
      setActiveId(current.id);
      setSteps(await listProvision({ data: current.id }));
    }
  }

  useEffect(() => {
    void reload().catch(() => setNotice("Could not load account."));
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const preview = params.get("preview");
    const order = params.get("order");
    if (sessionId || preview) {
      void confirmPayment({
        data: {
          sessionId: sessionId ?? undefined,
          previewOrderId: order ? Number(order) : undefined,
        },
      }).then((r) => {
        if (r.ok) setNotice("Pilot is marked paid. Finish the brand pack and we ship.");
        void reload();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeId) return;
    void listProvision({ data: activeId }).then(setSteps);
  }, [activeId]);

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
    setBusy(true);
    try {
      const res = await upsertTenant({
        data: {
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
      setNotice(`Tenant ${res.slug} saved. One JSON. No fork.`);
      await reload();
      setActiveId(res.id);
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!activeId) {
      setNotice("Save the rooftop first.");
      return;
    }
    setBusy(true);
    try {
      const res = await startCheckout({
        data: { plan: "pilot", origin: window.location.origin, tenantId: activeId },
      });
      if (res.url) window.location.assign(res.url);
      else setNotice(res.message);
    } finally {
      setBusy(false);
    }
  }

  const jsonPreview = {
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "rooftop",
    name,
    legal,
    phone,
    email,
    domain,
    sites: sites.split(",").map((s) => s.trim()).filter(Boolean),
    ingest,
    features,
    staff: email
      ? [{ name: "", email, role: "management", site: sites.split(",")[0]?.trim() || "Main" }]
      : [],
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_0.9fr]">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">Account</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">Your instance.</h1>
        <p className="mt-3 text-sm text-muted">
          Pay the pilot. Drop the brand pack. Tick provision. Monthly Site / Group invoices after the
          desk is live — we do not take a subscription for a product that is still a prototype.
        </p>
        {notice && (
          <p className="mt-4 rounded-md border border-line bg-elevated px-3 py-2 text-sm">{notice}</p>
        )}

        <div className="mt-8 space-y-4">
          <Field label="Trading name" htmlFor="n">
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
          <Field label="Preferred subdomain" htmlFor="d">
            <Input id="d" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="portal.theirdomain.co.uk" />
          </Field>
          <Field label="Sites (comma)" htmlFor="s">
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
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void save()} disabled={busy || !name}>
              Save tenant JSON
            </Button>
            <Button type="button" variant="secondary" onClick={() => void pay()} disabled={busy || !activeId}>
              Pay pilot {gbpPence(PLANS.pilot.setupPence)}
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
        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">
            tenants/{jsonPreview.slug}.json
          </div>
          <pre className="mt-3 overflow-x-auto font-mono text-[11px] leading-relaxed text-muted">
            {JSON.stringify(jsonPreview, null, 2)}
          </pre>
        </div>
        <div className="rounded-lg border border-line p-5">
          <h2 className="font-medium">Provision</h2>
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
                        void toggleStep({ data: { tenantId: activeId, step: p.id, done: !done } }).then(() =>
                          listProvision({ data: activeId }).then(setSteps),
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
