import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { OpenDeskButton, RooftopBar } from "@/components/demo/rooftop-bar";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { PLANS, gbpPence } from "@/lib/catalog";
import { jobs, modules, reasons, dispatch } from "@/lib/demo-data";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <SiteShell>
      <section className="relative overflow-hidden border-b border-line">
        <img
          src="/images/forecourt.jpg"
          alt=""
          className="absolute inset-0 size-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/75 to-bg" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div className="rise">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
              Dealer operating system · September 2026
            </p>
            <h1 className="mt-5 font-display text-[2.6rem] leading-[1.05] tracking-tight sm:text-6xl">
              The dealer OS you already run — packaged for others.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
              Stock, deals, GP, locator, customer journey, aftersales prep. Built from live use
              at a franchised site. Their brand on the glass.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild>
                <a href="#glass">
                  Build a desk <ArrowRight className="size-4" />
                </a>
              </Button>
              <Button variant="secondary" asChild>
                <Link to="/account">Pay a 60-day pilot</Link>
              </Button>
            </div>
          </div>
          <div className="rise hidden lg:block" style={{ animationDelay: "80ms" }}>
            <img
              src="/images/desk.jpg"
              alt="Forecourt desk on a sales iPad"
              className="h-full w-full rounded-xl border border-line object-cover shadow-soft"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">The job</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl tracking-tight sm:text-4xl">
            Dealers already have a DMS, manufacturer portals, and WhatsApp. None of them run the day.
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {jobs.map((j) => (
            <article key={j.title} className="rounded-lg border border-line bg-surface p-5 sm:p-6">
              <h3 className="font-medium">{j.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{j.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="glass" className="border-y border-line bg-bg-2">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">The glass</p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl tracking-tight sm:text-4xl">
              Name the rooftop. Open their desk.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
              Not a widget on this page. Enter the group and franchise, then open a full portal —
              Audi book for an Audi dealer, Škoda for Škoda. Clickable. Locator, GP, customer view.
            </p>
          </Reveal>
          <div className="mt-8">
            <RooftopBar />
          </div>
        </div>
        <div className="mx-auto grid max-w-6xl gap-px border-t border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <article key={m.n} className="bg-bg-2 p-5 sm:p-6">
              <div className="font-mono text-[11px] text-subtle">{m.n}</div>
              <h3 className="mt-2 font-medium">{m.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{m.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">
          Why a principal buys it
        </p>
        <h2 className="mt-3 max-w-xl font-display text-3xl tracking-tight">
          Built on the drive, not in a product workshop.
        </h2>
        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          {reasons.map((r) => (
            <article key={r.title}>
              <h3 className="font-medium">{r.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{r.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">Commercial</p>
          <h2 className="mt-3 font-display text-3xl tracking-tight">
            Sell instances, not seats.
          </h2>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {(Object.values(PLANS) as (typeof PLANS)[keyof typeof PLANS][]).map((t) => (
              <article
                key={t.id}
                className={
                  "rounded-lg border p-6 " + (t.sellNow ? "border-line-strong bg-surface" : "border-line bg-bg")
                }
              >
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                  {t.tag}
                </div>
                <div className="mt-2 font-medium">{t.name}</div>
                <div className="mt-4 font-display text-3xl">{gbpPence(t.setupPence)}</div>
                <div className="mt-1 font-mono text-sm text-muted">
                  {t.monthPence
                    ? `${gbpPence(t.monthPence)}${t.perSite ? " / site / mo" : " / mo"} after go-live`
                    : "one-off, credited to setup"}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted">{t.body}</p>
              </article>
            ))}
          </div>
          <Link
            to="/pricing"
            className="mt-6 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
          >
            Why these numbers <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:grid-cols-2 sm:px-6 sm:py-20">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">Who buys</p>
          <h2 className="mt-3 font-display text-3xl tracking-tight">
            Independent groups of 2–8 sites. Not the plc on day one.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Owner-driven Škoda / VW / SEAT / Cupra / Ford / Toyota independents. Sales manager still
            walks the yard. IT is a person, not a department.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Not yet: national groups, manufacturer app suites, anyone who needs a 90-day security
            review before a pilot.
          </p>
        </div>
        <div>
          <img
            src="/images/yard.jpg"
            alt="Used-car yard at dusk with an empty bay in the foreground"
            className="h-64 w-full rounded-lg object-cover sm:h-full"
          />
        </div>
      </section>

      <section className="border-t border-line bg-bg-2">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">Dispatch</p>
          <h2 className="mt-3 font-display text-3xl tracking-tight">
            One codebase. One brand file. One provision script. Never a fork.
          </h2>
          <p className="mt-3 max-w-xl text-sm text-muted">
            Scroll the process. Toggle features. Watch the tenant JSON write itself.
          </p>
          <Button className="mt-6" variant="secondary" asChild>
            <Link to="/how">How an order ships</Link>
          </Button>
          <ol className="mt-10 grid gap-6 sm:grid-cols-5">
            {dispatch.map((d) => (
              <li key={d.n}>
                <div className="font-mono text-[11px] text-subtle">{d.n}</div>
                <h3 className="mt-2 text-sm font-medium">{d.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{d.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">The ask</p>
        <h2 className="mt-4 font-display text-4xl tracking-tight sm:text-5xl">
          A 60-day rooftop pilot.
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-muted">
          One success number. Their brand on the glass. Suggested metric: every live deal has a
          locator stage and a GP figure before month-end. If that is true, the product stays.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link to="/account">Pay the pilot</Link>
          </Button>
          <OpenDeskButton />
        </div>
        <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
          Matthew Girvan · Forecourt · September 2026
        </p>
      </section>
    </SiteShell>
  );
}
