import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { HomeCustomerView } from "@/components/home-customer-view";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/seo";

const TITLE = "Customer live order tracking for car dealerships | Forecourt";
const DESCRIPTION =
  "Let the customer open their order and see it live. Fewer chasing calls. Forecourt sits beside your CRM for UK motor trade desks.";

export const Route = createFileRoute("/for/customer-live-track")({
  component: CustomerLiveTrackPage,
  head: () =>
    pageHead({
      title: TITLE,
      description: DESCRIPTION,
      path: "/for/customer-live-track",
    }),
});

const points = [
  {
    title: "Customer opens their own order",
    line: "They see the car, progress, and what still needs doing without calling the showroom.",
  },
  {
    title: "Fewer chasing calls",
    line: "The exec is not reading status codes aloud all day. Live track answers the usual questions.",
  },
  {
    title: "To-dos the buyer can clear",
    line: "Outstanding tasks sit on their phone: balance, paperwork, handover reminders.",
  },
  {
    title: "Beside your CRM",
    line: "Deal paperwork stays in the CRM. Live track sits on the floor desk next to it.",
  },
] as const;

function CustomerLiveTrackPage() {
  return (
    <SiteShell>
      <section className="mx-auto max-w-3xl px-4 pt-16 text-center sm:px-6 sm:pt-24">
        <Reveal>
          <p className="text-[13px] font-medium tracking-wide text-muted">Customer live track</p>
          <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Any update on my car, answered without the switchboard
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            If the customer can open their order and see it live, the sales exec stops being a
            switchboard. That is a gap a CRM was never built for. Forecourt sits beside it.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button className="cta-amber rounded-full" asChild>
              <Link to="/" hash="scene-customer">
                See the customer view <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="secondary" className="rounded-full" asChild>
              <Link to="/for/beside-crm">Beside your CRM</Link>
            </Button>
          </div>
        </Reveal>
      </section>

      <ul className="mx-auto mt-12 grid max-w-3xl gap-3 px-4 sm:px-6">
        {points.map((p, i) => (
          <Reveal
            key={p.title}
            delay={i * 60}
            className="rounded-[1.75rem] border border-line bg-surface/80 p-6 text-left backdrop-blur-md sm:p-7"
          >
            <li className="list-none">
              <h2 className="text-xl font-semibold tracking-tight">{p.title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{p.line}</p>
            </li>
          </Reveal>
        ))}
      </ul>

      <HomeCustomerView className="pt-16 sm:pt-20" showPhraseLink={false} />

      <section className="mx-auto max-w-3xl px-4 pb-20 text-center sm:px-6 sm:pb-28">
        <Reveal>
          <p className="text-[13px] font-medium text-muted">See it moving</p>
          <h2 className="mx-auto mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Watch an order move from port to port.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-muted">
            The homepage shows the customer view updating as the car travels. Sample order, dummy
            details. Built for UK desks, including Scotland.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button className="cta-amber rounded-full" asChild>
              <Link to="/" hash="scene-customer">
                See the customer view <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="secondary" className="rounded-full" asChild>
              <Link to="/contact">Contact</Link>
            </Button>
          </div>
        </Reveal>
        <p className="mx-auto mt-14 max-w-md text-center text-[11px] leading-relaxed text-subtle">
          Forecourt is a UK motor trade floor product for franchise and group desks. It is not a
          consumer car marketplace.
        </p>
      </section>
    </SiteShell>
  );
}
