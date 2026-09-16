import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { OpenDeskButton, RooftopBar } from "@/components/demo/rooftop-bar";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { PLANS, gbpPence } from "@/lib/catalog";

export const Route = createFileRoute("/")({ component: Home });

const pieces = [
  { n: "01", title: "Stock", line: "New and used. One list. Keys and days on the yard." },
  { n: "02", title: "Deals", line: "Every live order, the profit, and what’s still missing." },
  { n: "03", title: "Locator", line: "Where the car actually is — factory, boat, compound, site." },
  { n: "04", title: "Customers", line: "They can see their own car. Fewer “any update?” calls." },
] as const;

function Home() {
  return (
    <SiteShell>
      <section className="relative min-h-[88dvh] overflow-hidden border-b border-line">
        <img
          src="/images/forecourt.jpg"
          alt=""
          className="hero-still absolute inset-0 size-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/30 via-bg/70 to-bg" />
        <div className="relative mx-auto flex min-h-[88dvh] max-w-6xl flex-col justify-end px-4 pb-16 pt-28 sm:px-6 sm:pb-24">
          <p className="rise font-mono text-[11px] uppercase tracking-[0.28em] text-muted">Forecourt</p>
          <h1
            className="rise mt-5 max-w-3xl font-display text-[3rem] leading-[0.95] tracking-tight sm:text-7xl"
            style={{ animationDelay: "80ms" }}
          >
            Your dealership.
            <br />
            On one screen.
          </h1>
          <p
            className="rise mt-6 max-w-md text-base leading-relaxed text-muted sm:text-lg"
            style={{ animationDelay: "160ms" }}
          >
            The iPad on the desk. Stock, deals, and where every car is — in your colours.
          </p>
          <div className="rise mt-10 flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
            <Button asChild>
              <a href="#try">
                See yours <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/account">Start 60 days</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl sm:grid-cols-2 lg:grid-cols-4">
          {pieces.map((p, i) => (
            <Reveal
              key={p.title}
              delay={i * 70}
              className="border-b border-line p-6 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 lg:min-h-[240px]"
            >
              <div className="font-mono text-[11px] text-subtle">{p.n}</div>
              <h2 className="mt-8 font-display text-3xl tracking-tight">{p.title}</h2>
              <p className="mt-3 max-w-[16rem] text-sm leading-relaxed text-muted">{p.line}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="try" className="relative overflow-hidden border-b border-line">
        <div className="mx-auto grid max-w-6xl lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="px-4 py-16 sm:px-6 sm:py-24">
            <Reveal>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-subtle">Try it</p>
              <h2 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">
                Put your name on it.
              </h2>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
                Type the group. Pick the brand. Open a working desk — not a slideshow.
              </p>
            </Reveal>
            <div className="mt-8">
              <RooftopBar />
            </div>
          </div>
          <div className="relative min-h-[320px] border-t border-line lg:min-h-full lg:border-l lg:border-t-0">
            <img
              src="/images/desk.jpg"
              alt="Forecourt on a sales iPad"
              className="absolute inset-0 size-full object-cover"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-subtle">On the drive</p>
          <h2 className="mt-3 max-w-xl font-display text-4xl tracking-tight">
            Built for the person standing next to the car.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-12 sm:grid-cols-3">
          {[
            { t: "Know where it is", b: "No more ringing the factory or guessing the compound." },
            { t: "See the profit now", b: "GP on the deal, not in a board pack after month-end." },
            { t: "Fewer chase-ups", b: "The customer can look at their own order." },
          ].map((x, i) => (
            <Reveal key={x.t} delay={i * 90}>
              <div className="font-mono text-[11px] text-subtle">0{i + 1}</div>
              <h3 className="mt-4 font-display text-2xl tracking-tight">{x.t}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{x.b}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden border-y border-line">
        <img src="/images/yard.jpg" alt="" className="absolute inset-0 size-full object-cover opacity-25" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-bg/40" />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 py-20 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-28">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-subtle">60 days</p>
            <h2 className="mt-3 font-display text-5xl tracking-tight">{gbpPence(PLANS.pilot.setupPence)}</h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
              One rooftop. Your colours. If you stay, it comes off the setup.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link to="/account">Start 60 days</Link>
              </Button>
              <OpenDeskButton />
            </div>
          </Reveal>
        </div>
      </section>
    </SiteShell>
  );
}
