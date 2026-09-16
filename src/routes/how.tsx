import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { RooftopBar } from "@/components/demo/rooftop-bar";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { FEATURES, INGEST, PLANS, PROVISION, type FeatureId, type PlanId } from "@/lib/catalog";
import { rolesForPlan } from "@/lib/roles";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/how")({ component: HowPage });

export function HowPage() {
  const [on, setOn] = useState<Record<string, boolean>>(
    Object.fromEntries(FEATURES.map((f) => [f.id, f.defaultOn])),
  );
  const [ingest, setIngest] = useState("excel");
  const [seatPlan, setSeatPlan] = useState<PlanId>("site");

  const seats = rolesForPlan(seatPlan);

  return (
    <SiteShell>
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal className="text-center">
          <p className="text-[13px] font-medium text-muted">How it works</p>
          <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            You pay. We put your name on it. You go live.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base text-muted">
            Same product that’s already on a showroom floor. Your colours, your cars, your staff.
          </p>
        </Reveal>

        <ol className="mt-16 space-y-10">
          {PROVISION.map((p, i) => (
            <li key={p.id}>
              <Reveal delay={i * 40}>
                <div className="grid gap-6 rounded-[1.75rem] border border-line bg-surface p-6 sm:p-8 lg:grid-cols-[0.4fr_1fr] lg:items-start">
                  <div>
                    <div className="flex size-10 items-center justify-center rounded-full bg-fg text-sm font-semibold text-accent-fg">
                      {i + 1}
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold tracking-tight">{p.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
                  </div>
                  {p.id === "brand" && (
                    <ul className="space-y-2 text-sm text-muted">
                      {[
                        "Logo",
                        "Your colours",
                        "Dealership name",
                        "Showroom phone and sales email",
                        "The web address you want",
                        "Who should have a login",
                      ].map((item) => (
                        <li key={item} className="border-b border-line py-2">
                          {item}
                        </li>
                      ))}
                    </ul>
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
                              "h-9 rounded-full px-3 text-xs transition-colors",
                              on[f.id as FeatureId] ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
                            )}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                      <p className="max-w-sm text-sm text-muted">Tick what you need. We turn the rest off.</p>
                    </div>
                  )}
                  {p.id === "data" && (
                    <p className="text-sm leading-relaxed text-muted">Your cars stay yours. Nobody else can see them.</p>
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
                              "h-9 rounded-full px-3 text-xs",
                              ingest === x.id ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
                            )}
                          >
                            {x.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-4 text-sm text-muted">Start with a spreadsheet. Factory feed later if you have one.</p>
                    </div>
                  )}
                  {p.id === "ship" && (
                    <p className="text-sm leading-relaxed text-muted">
                      Your own web address. Staff get a code to sign in. Then you’re live.
                    </p>
                  )}
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <Reveal>
          <p className="text-[13px] font-medium text-muted">Who uses it</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Sales, the manager, and whoever else you need.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
            One desk. Different logins. Host, accounts, progressor — only if you want them.
          </p>
        </Reveal>

        <div className="mt-8 flex flex-wrap gap-1.5">
          {(Object.values(PLANS) as (typeof PLANS)[keyof typeof PLANS][]).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSeatPlan(p.id)}
              className={cn(
                "h-9 rounded-full px-3 text-xs",
                seatPlan === p.id ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {seats.map((r) => (
            <article key={r.id} className="rounded-[1.5rem] border border-line bg-surface p-6">
              <h3 className="font-medium">{r.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{r.sees}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight">See it with your name.</h2>
        </Reveal>
        <div className="mt-8">
          <RooftopBar />
        </div>
        <Button className="mt-6" asChild>
          <Link to="/account">Get started</Link>
        </Button>
      </section>
    </SiteShell>
  );
}
