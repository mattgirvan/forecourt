import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DealerBar } from "@/components/demo/dealer-bar";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import {
  FEATURES,
  INGEST,
  PLAN_ORDER,
  PLANS,
  PROVISION,
  type BillingKind,
  type FeatureId,
  type PlanId,
} from "@/lib/catalog";
import { rolesForPlan } from "@/lib/roles";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/how")({ component: HowPage });

export function HowPage() {
  const [on, setOn] = useState<Record<string, boolean>>(
    Object.fromEntries(FEATURES.map((f) => [f.id, f.defaultOn])),
  );
  const [ingest, setIngest] = useState("excel");
  const [seatPlan, setSeatPlan] = useState<PlanId>("site");
  const [seatBilling, setSeatBilling] = useState<BillingKind>("trial");

  const billing: BillingKind = seatPlan === "site" ? seatBilling : "subscription";
  const seats = rolesForPlan(seatPlan, billing);

  return (
    <SiteShell>
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal className="text-center">
          <p className="text-[13px] font-medium text-muted">How it works</p>
          <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            You pick a package. We put your name on it. You go live.
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base text-muted">
            Same product that’s already on a showroom floor. Site can start on 60 days.
            Franchise and group start on a 12-month contract.
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
                    <p className="text-sm leading-relaxed text-muted">
                      Your cars stay yours. Nobody else can see them. A group still gets a database
                      per site unless you are explicitly on the group contract.
                    </p>
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
                      <p className="mt-4 text-sm text-muted">
                        Start with a spreadsheet. Factory feed is in the franchise and group packages.
                      </p>
                    </div>
                  )}
                  {p.id === "ship" && (
                    <p className="text-sm leading-relaxed text-muted">
                      Your own web address. Staff get a code to sign in. Then you’re live. Monthly
                      billing starts here for a subscription — not at the first conversation.
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
            Sales, the manager, and whoever else the package includes.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
            One desk. Different logins. The 60-day trial is sales and the manager only. Extra seats
            arrive when you subscribe.
          </p>
        </Reveal>

        <div className="mt-8 flex flex-wrap gap-1.5">
          {PLAN_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSeatPlan(id)}
              className={cn(
                "h-9 rounded-full px-3 text-xs",
                seatPlan === id ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
              )}
            >
              {PLANS[id].name}
            </button>
          ))}
          {seatPlan === "site" && (
            <>
              <span className="mx-1 self-center text-subtle">/</span>
              <button
                type="button"
                onClick={() => setSeatBilling("trial")}
                className={cn(
                  "h-9 rounded-full px-3 text-xs",
                  billing === "trial" ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
                )}
              >
                60-day trial
              </button>
              <button
                type="button"
                onClick={() => setSeatBilling("subscription")}
                className={cn(
                  "h-9 rounded-full px-3 text-xs",
                  billing === "subscription" ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
                )}
              >
                Subscribed
              </button>
            </>
          )}
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
          <DealerBar />
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/account" search={{ plan: "site", billing: "trial" }}>
              Start 60 days
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/pricing">See packages</Link>
          </Button>
        </div>
      </section>
    </SiteShell>
  );
}
