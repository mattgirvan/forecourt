import { createFileRoute, Link } from "@tanstack/react-router";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { PLANS, gbpPence } from "@/lib/catalog";

export const Route = createFileRoute("/pricing")({ component: PricingPage });

export function PricingPage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-24">
        <Reveal>
          <p className="text-[13px] font-medium text-muted">Pricing</p>
          <h1 className="mx-auto mt-4 max-w-xl text-5xl font-semibold tracking-tight">Start with 60 days.</h1>
          <p className="mx-auto mt-4 max-w-md text-base text-muted">
            One rooftop. If it earns its keep, you stay. Monthly only once you’re live.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-4 text-left lg:grid-cols-3">
          {(Object.values(PLANS) as (typeof PLANS)[keyof typeof PLANS][]).map((t) => (
            <article
              key={t.id}
              className={
                "flex flex-col rounded-[1.75rem] border border-line p-8 " +
                (t.sellNow ? "bg-surface" : "bg-bg")
              }
            >
              <div className="text-[13px] text-muted">{t.tag}</div>
              <div className="mt-3 text-2xl font-semibold tracking-tight">{t.name}</div>
              <div className="mt-8 text-5xl font-semibold tracking-tight">{gbpPence(t.setupPence)}</div>
              <div className="mt-2 text-sm text-muted">
                {t.monthPence
                  ? `${gbpPence(t.monthPence)}${t.perSite ? " / site / month" : " / month"} after`
                  : "comes off setup if you stay"}
              </div>
              <p className="mt-6 flex-1 text-[15px] leading-relaxed text-muted">{t.body}</p>
              <Button className="mt-8" variant={t.sellNow ? "default" : "secondary"} asChild>
                <Link to={t.sellNow ? "/account" : "/how"}>{t.sellNow ? "Get started" : "How it works"}</Link>
              </Button>
            </article>
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
