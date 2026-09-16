import { createFileRoute, Link } from "@tanstack/react-router";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { PLAN_ORDER, PLANS, gbpPence } from "@/lib/catalog";

export const Route = createFileRoute("/pricing")({ component: PricingPage });

export function PricingPage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal className="text-center">
          <p className="text-[13px] font-medium text-muted">Pricing</p>
          <h1 className="mx-auto mt-4 max-w-2xl text-5xl font-semibold tracking-tight">
            Site, franchise, or group.
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base text-muted">
            A 60-day trial exists for one site. Franchise and group are a 12-month subscription —
            we don’t spend weeks standing up a group for a maybe.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-4 text-left lg:grid-cols-3">
          {PLAN_ORDER.map((id) => {
            const t = PLANS[id];
            return (
              <article
                key={t.id}
                className={
                  "flex flex-col rounded-[1.75rem] border border-line p-8 " +
                  (t.trial ? "bg-surface" : "bg-bg")
                }
              >
                <div className="text-[13px] text-muted">{t.tag}</div>
                <div className="mt-3 text-2xl font-semibold tracking-tight">{t.name}</div>
                <div className="mt-8 text-5xl font-semibold tracking-tight">{gbpPence(t.setupPence)}</div>
                <div className="mt-2 text-sm text-muted">
                  setup
                  {t.trialPence ? ` · or ${gbpPence(t.trialPence)} for 60 days` : ""}
                </div>
                <div className="mt-1 text-sm text-muted">
                  then {gbpPence(t.monthPence)}
                  {t.perSite ? " / site / month" : " / month"}
                  {t.contractMonths ? ` · ${t.contractMonths}-month contract` : " · month to month"}
                </div>
                <p className="mt-6 text-[15px] leading-relaxed text-muted">{t.body}</p>
                <ul className="mt-6 flex-1 space-y-2 text-sm text-muted">
                  {t.includes.map((line) => (
                    <li key={line} className="border-b border-line py-2">
                      {line}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs leading-relaxed text-subtle">{t.why}</p>
                <div className="mt-8 flex flex-col gap-2">
                  {t.trial && t.trialPence ? (
                    <Button asChild>
                      <Link to="/account" search={{ plan: t.id, billing: "trial" }}>
                        60 days — {gbpPence(t.trialPence)}
                      </Link>
                    </Button>
                  ) : null}
                  <Button variant={t.trial ? "secondary" : "default"} asChild>
                    <Link to="/account" search={{ plan: t.id, billing: "subscription" }}>
                      {t.contractMonths ? "Start 12-month contract" : "Subscribe"}
                    </Link>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>

        <p className="mx-auto mt-12 max-w-lg text-center text-sm text-muted">
          Trial credit: the £1,500 comes off site setup if you stay, so converting is £3,000 remaining + £399/month.
          Manufacturer ingest on a site is quoted, not bundled.
        </p>
      </div>
    </SiteShell>
  );
}
