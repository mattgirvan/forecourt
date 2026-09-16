import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { RooftopBar } from "@/components/demo/rooftop-bar";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { PLANS, gbpPence } from "@/lib/catalog";

export const Route = createFileRoute("/")({ component: Home });

const pieces = [
  {
    n: "01",
    title: "Stock",
    line: "New and used in one list. Where the keys are. How long it’s been sitting.",
  },
  {
    n: "02",
    title: "Deals",
    line: "Every live order. The profit. What’s still missing before handover.",
  },
  {
    n: "03",
    title: "Locator",
    line: "Factory, boat, compound, or on the yard — so nobody has to guess.",
  },
  {
    n: "04",
    title: "Customers",
    line: "They can see their own car. Fewer “any update?” calls.",
  },
] as const;

const steps = [
  {
    n: "1",
    title: "See it",
    body: "Put your dealership name on a working desk. Sample cars. Click around.",
    href: "#try",
    cta: "Try it",
  },
  {
    n: "2",
    title: "Start 60 days",
    body: `${gbpPence(PLANS.pilot.setupPence)}. One rooftop. Your colours. If you stay, it comes off the setup.`,
    href: "/account",
    cta: "Get started",
  },
  {
    n: "3",
    title: "Go live",
    body: "We load your cars and staff. You get a website. The iPad on the desk is yours.",
    href: "/how",
    cta: "How it works",
  },
] as const;

function Home() {
  return (
    <SiteShell>
      <section className="px-4 pb-8 pt-16 text-center sm:px-6 sm:pt-24">
        <p className="rise text-[13px] font-medium tracking-wide text-muted">
          Software for car dealerships
        </p>
        <h1
          className="rise mx-auto mt-5 max-w-3xl text-[2.75rem] font-semibold leading-[1.02] tracking-tight sm:text-7xl"
          style={{ animationDelay: "90ms" }}
        >
          The screen on the sales desk.
        </h1>
        <p
          className="rise mx-auto mt-6 max-w-lg text-base leading-relaxed text-muted sm:text-lg"
          style={{ animationDelay: "180ms" }}
        >
          Forecourt is where your stock, your deals, and where every car is — in your colours.
        </p>
        <div className="rise mt-9 flex flex-wrap justify-center gap-3" style={{ animationDelay: "260ms" }}>
          <Button className="rounded-full" asChild>
            <a href="#try">
              Try it <ArrowRight className="size-4" />
            </a>
          </Button>
          <Button variant="secondary" className="rounded-full" asChild>
            <Link to="/how">How it works</Link>
          </Button>
        </div>
        <div
          className="rise mx-auto mt-14 max-w-5xl overflow-hidden rounded-[2rem] border border-line shadow-soft sm:rounded-[2.5rem]"
          style={{ animationDelay: "340ms" }}
        >
          <img src="/images/desk.jpg" alt="Forecourt on a sales iPad" className="hero-still w-full object-cover" />
        </div>
      </section>

      <section id="what" className="mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal className="text-center">
          <p className="text-[13px] font-medium text-muted">What you’re looking at</p>
          <h2 className="mx-auto mt-3 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
            One place for the day’s work.
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {pieces.map((p, i) => (
            <Reveal
              key={p.title}
              delay={i * 80}
              className="rounded-[1.75rem] border border-line bg-surface p-7 sm:p-8"
            >
              <div className="text-[13px] text-subtle">{p.n}</div>
              <h3 className="mt-8 text-3xl font-semibold tracking-tight">{p.title}</h3>
              <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted">{p.line}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="px-4 py-8 sm:px-6">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-line">
          <img src="/images/forecourt.jpg" alt="" className="h-72 w-full object-cover sm:h-[28rem]" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/20 to-transparent" />
          <p className="absolute bottom-8 left-8 right-8 max-w-md text-2xl font-semibold tracking-tight sm:text-3xl">
            Built for the person standing next to the car.
          </p>
        </div>
      </section>

      <section id="start" className="mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal className="text-center">
          <p className="text-[13px] font-medium text-muted">How to get started</p>
          <h2 className="mx-auto mt-3 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Three steps. That’s the whole path.
          </h2>
        </Reveal>
        <ol className="mt-14 grid gap-4 lg:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal
              key={s.n}
              delay={i * 90}
              className="flex flex-col rounded-[1.75rem] border border-line bg-surface p-7"
            >
              <div className="flex size-10 items-center justify-center rounded-full bg-fg text-sm font-semibold text-accent-fg">
                {s.n}
              </div>
              <h3 className="mt-6 text-2xl font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-3 flex-1 text-[15px] leading-relaxed text-muted">{s.body}</p>
              {s.href.startsWith("#") ? (
                <a href={s.href} className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-fg">
                  {s.cta} <ArrowRight className="size-4" />
                </a>
              ) : (
                <Link
                  to={s.href as "/account" | "/how"}
                  className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-fg"
                >
                  {s.cta} <ArrowRight className="size-4" />
                </Link>
              )}
            </Reveal>
          ))}
        </ol>
      </section>

      <section id="try" className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <Reveal className="text-center">
          <p className="text-[13px] font-medium text-muted">Step 1</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Try it with your name.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-muted">
            Type the group. Pick the brand. Open a real desk — not a slideshow.
          </p>
        </Reveal>
        <div className="mt-10">
          <RooftopBar />
        </div>
      </section>
    </SiteShell>
  );
}
