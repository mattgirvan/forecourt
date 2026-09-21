import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DealerBar } from "@/components/demo/dealer-bar";
import { ContactPromo } from "@/components/contact-promo";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { FEATURES, INGEST, PROVISION, type IngestId } from "@/lib/catalog";
import { DoorsMap } from "@/components/trust/doors-map";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/how")({ component: HowPage });

/** Stage 2 is a picture of the order, not a control. Mix of on and off. */
const ORDER_PREVIEW: Record<string, boolean> = {
  overview: true,
  stock: true,
  locator: true,
  pipeline: true,
  customer: true,
  mind: false,
  forms: true,
  manufacturer: false,
};

const FLOOR = [
  {
    title: "Office / administrator seat",
    line: "Knows what’s going out without chasing the floor.",
  },
  {
    title: "Progressor",
    line: "Knows what needs to be ready, and when.",
  },
  {
    title: "Month-end",
    line: "The picture is already there. Not six spreadsheets on a Sunday.",
  },
] as const;

export function HowPage() {
  const [ingest, setIngest] = useState<IngestId>("manufacturer");
  const chosen = INGEST.find((x) => x.id === ingest) ?? INGEST[0];

  return (
    <SiteShell>
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal className="text-center">
          <p className="text-[13px] font-medium text-muted">How it works</p>
          <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            You pick a package. We put your name on it. You go live.
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base text-muted">
            Built on a showroom floor, by someone who still works one. The gaps this fills are the ones we actually hit, not a consultant’s list.
          </p>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted">
            It ties into the stock system you already run. We don’t replace DealerWeb or the DMS.
            Site can start on 60 days. Franchise and group start on a 12-month contract.
          </p>
        </Reveal>

        <Reveal className="mt-16">
          <p className="text-[13px] font-medium text-muted">Where you log in</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">Five doors. Not one ambiguous Administrator.</h2>
          <p className="mt-3 max-w-xl text-sm text-muted">
            This website, your account, your desk, customer glass, and our staff office. Administrator is a seat on your desk. The Forecourt team uses a separate door.
          </p>
          <div className="mt-8">
            <DoorsMap />
          </div>
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
                        {FEATURES.map((f) => {
                          const lit = ORDER_PREVIEW[f.id] ?? f.defaultOn;
                          return (
                            <span
                              key={f.id}
                              className={cn(
                                "inline-flex h-9 items-center rounded-full px-3 text-xs",
                                lit ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
                              )}
                            >
                              {f.label}
                            </span>
                          );
                        })}
                      </div>
                      <p className="max-w-sm text-sm text-muted">
                        On the order you switch these. Some on, some off, wired to how you actually work, not a default we copied from someone else.
                      </p>
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
                              "h-9 rounded-full px-3 text-xs transition-colors",
                              ingest === x.id ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
                            )}
                          >
                            {x.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">{chosen.blurb}</p>
                    </div>
                  )}
                  {p.id === "ship" && (
                    <p className="text-sm leading-relaxed text-muted">
                      Your own web address. Staff get a code to sign in. Then you’re live. Monthly
                      billing starts here for a subscription, not at the first conversation.
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
            Wired to how your dealership already runs.
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted">
            Every site is different. We don’t hand you a list of job titles and tell you who sees what.
            When we build yours, we match the people you actually have.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {FLOOR.map((f) => (
            <article key={f.title} className="rounded-[1.5rem] border border-line bg-surface p-6">
              <h3 className="text-xl font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.line}</p>
            </article>
          ))}
        </div>
      </section>

      <ContactPromo
        eyebrow="Still weighing it up"
        title="Something about your sites does not fit the steps above."
        body="Integration notes, special requirements, or a trial question. Talk to us before you start a package."
      />

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