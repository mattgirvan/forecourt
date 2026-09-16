import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { RooftopBar } from "@/components/demo/rooftop-bar";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { FEATURES, INGEST, PROVISION, type FeatureId } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/how")({ component: HowPage });

export function HowPage() {
  const [on, setOn] = useState<Record<string, boolean>>(
    Object.fromEntries(FEATURES.map((f) => [f.id, f.defaultOn])),
  );
  const [ingest, setIngest] = useState("excel");

  const sample = {
    slug: "harbour-park",
    name: "Harbour Park",
    legal: "Harbour Park Automotive Ltd",
    phone: "01202 774 410",
    domain: "portal.harbourpark.example",
    sites: ["Poole"],
    ingest,
    features: on,
  };

  return (
    <SiteShell>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">How an order ships</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl tracking-tight sm:text-5xl">
            One codebase. One JSON file. Never a fork.
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted">
            The Aberdeen portal is the prototype. The next client does not get a copy of App.jsx.
            They get a tenant file, feature flags, and an ingest adapter. That is the only way this
            is sellable.
          </p>
        </Reveal>

        <ol className="mt-14 space-y-16">
          {PROVISION.map((p, i) => (
            <li key={p.id}>
              <Reveal delay={i * 40}>
                <div className="grid gap-6 lg:grid-cols-[0.4fr_1fr] lg:items-start">
                  <div>
                    <div className="font-mono text-[11px] text-subtle">{p.n}</div>
                    <h2 className="mt-2 font-display text-2xl">{p.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
                  </div>
                  {p.id === "brand" && (
                    <div className="rounded-lg border border-line bg-surface p-5">
                      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
                        Brand pack — one page
                      </p>
                      <ul className="mt-3 space-y-2 text-sm text-muted">
                        {[
                          "Wordmark + stacked logo",
                          "Primary / surface / danger hex",
                          "Trading name and legal name",
                          "Showroom phone and sales inbox",
                          "portal.theirdomain.co.uk",
                          "Staff list: name, email, role, site",
                        ].map((item) => (
                          <li key={item} className="border-b border-line py-2">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {p.id === "config" && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-1.5">
                        {FEATURES.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setOn((s) => ({ ...s, [f.id]: !s[f.id] }))}
                            className={cn(
                              "h-9 rounded-sm px-3 text-xs transition-colors",
                              on[f.id as FeatureId] ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
                            )}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                      <pre className="overflow-x-auto rounded-md border border-line bg-elevated p-4 font-mono text-[11px] leading-relaxed text-muted">
                        {JSON.stringify(sample, null, 2)}
                      </pre>
                    </div>
                  )}
                  {p.id === "data" && (
                    <div className="rounded-lg border border-line p-5 text-sm leading-relaxed text-muted">
                      Each client is a row-set scoped to their account. Aberdeen stays on its own
                      database. The next rooftop does not inherit their deals, VINs, or staff. Until
                      row-level tenancy is proven, the rule is: new project, new keys, first staff
                      user. Never share.
                    </div>
                  )}
                  {p.id === "ingest" && (
                    <div>
                      <div className="flex flex-wrap gap-1.5">
                        {INGEST.map((x) => (
                          <button
                            key={x.id}
                            type="button"
                            onClick={() => setIngest(x.id)}
                            className={cn(
                              "h-9 rounded-sm px-3 text-xs",
                              ingest === x.id ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
                            )}
                          >
                            {x.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-4 text-sm text-muted">
                        Core is upsert-by-VIN. Škoda UK is one adapter. Excel is another. A Ford
                        group does not get the Škoda function pasted into App.jsx.
                      </p>
                    </div>
                  )}
                  {p.id === "ship" && (
                    <div className="rounded-lg border border-line p-5 text-sm text-muted">
                      Custom domain, staff login, customer glass optional on day one. Monthly billing
                      starts here — not at the pitch meeting.
                    </div>
                  )}
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-line bg-bg-2">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <Reveal>
            <h2 className="font-display text-3xl tracking-tight">The glass they would get.</h2>
            <p className="mt-3 max-w-xl text-sm text-muted">
              Name the group and franchise. Open a full desk on its own page — not a widget here.
              Feature flags above are what a real order would turn on.
            </p>
          </Reveal>
          <div className="mt-8">
            <RooftopBar />
          </div>
          <Button className="mt-6" variant="secondary" asChild>
            <Link to="/account">Start a rooftop</Link>
          </Button>
        </div>
      </section>
    </SiteShell>
  );
}
