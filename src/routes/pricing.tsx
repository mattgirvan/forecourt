import { createFileRoute, Link } from "@tanstack/react-router";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { PLANS, gbpPence } from "@/lib/catalog";

export const Route = createFileRoute("/pricing")({ component: PricingPage });

export function PricingPage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">Pricing</p>
          <h1 className="mt-3 max-w-xl font-display text-5xl tracking-tight">
            Start with 60 days.
          </h1>
          <p className="mt-4 max-w-md text-base text-muted">
            One rooftop. If it earns its keep, you stay. Monthly only once you’re live.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-3">
          {(Object.values(PLANS) as (typeof PLANS)[keyof typeof PLANS][]).map((t) => (
            <article
              key={t.id}
              className={"flex flex-col bg-bg p-8 " + (t.sellNow ? "bg-surface" : "")}
            >
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{t.tag}</div>
              <div className="mt-3 font-display text-3xl tracking-tight">{t.name}</div>
              <div className="mt-8 font-display text-5xl tracking-tight">{gbpPence(t.setupPence)}</div>
              <div className="mt-2 text-sm text-muted">
                {t.monthPence
                  ? `${gbpPence(t.monthPence)}${t.perSite ? " / site / month" : " / month"} after`
                  : "comes off setup if you stay"}
              </div>
              <p className="mt-6 flex-1 text-sm leading-relaxed text-muted">{t.body}</p>
              <Button className="mt-8" variant={t.sellNow ? "default" : "secondary"} asChild>
                <Link to={t.sellNow ? "/account" : "/how"}>{t.sellNow ? "Start" : "How it works"}</Link>
              </Button>
            </article>
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
