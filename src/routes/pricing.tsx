import { createFileRoute, Link } from "@tanstack/react-router";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { FRANCHISE_PACK, PLANS, gbpPence } from "@/lib/catalog";
import { rolesForPlan } from "@/lib/roles";

export const Route = createFileRoute("/pricing")({ component: PricingPage });

const kit = [
  "Wordmark + stacked logo (SVG or PNG on transparent)",
  "Primary, surface, and danger hex",
  "Trading name and legal name",
  "Showroom phone and sales inbox",
  "Preferred subdomain (portal.theirdomain.co.uk)",
  "Staff list: name, email, role, site, franchise if more than one",
  "Whether customers get a login on day one",
  "Stock source: Excel, HTML drop, or manufacturer API",
];

export function PricingPage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">Commercial</p>
          <h1 className="mt-3 max-w-2xl font-display text-4xl tracking-tight sm:text-5xl">
            The original numbers were too cheap to be believed.
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted">
            £349/mo looks like a side project. A DMS is thousands. This is not a DMS — so it cannot
            charge like one — but it also cannot charge like a Notion template. Only the pilot is
            taken on a card today. Site and Group start when the desk is live.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {(Object.values(PLANS) as (typeof PLANS)[keyof typeof PLANS][]).map((t) => (
            <article
              key={t.id}
              className={
                "flex flex-col rounded-lg border p-6 " +
                (t.sellNow ? "border-line-strong bg-surface" : "border-line")
              }
            >
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                {t.tag}
              </div>
              <div className="mt-2 text-sm font-medium">{t.name}</div>
              <div className="mt-5 font-display text-4xl">{gbpPence(t.setupPence)}</div>
              <div className="mt-1 font-mono text-sm text-muted">
                {t.monthPence
                  ? `${gbpPence(t.monthPence)}${t.perSite ? " / site / mo" : " / mo"}`
                  : "credited to setup on convert"}
              </div>
              <p className="mt-5 text-sm leading-relaxed text-muted">{t.body}</p>
              <p className="mt-3 text-xs leading-relaxed text-subtle">{t.why}</p>
              <ul className="mt-4 space-y-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                {rolesForPlan(t.id).map((r) => (
                  <li key={r.id}>{r.label}</li>
                ))}
              </ul>
              <Button className="mt-6" variant={t.sellNow ? "default" : "secondary"} asChild>
                <Link to={t.sellNow ? "/account" : "/how"}>
                  {t.sellNow ? "Pay the pilot" : "See how it ships"}
                </Link>
              </Button>
            </article>
          ))}
        </div>

        <Reveal className="mt-10 rounded-lg border border-line p-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Franchise pack
          </div>
          <p className="mt-3 text-sm text-muted">
            {gbpPence(FRANCHISE_PACK.setupPence)} setup · {gbpPence(FRANCHISE_PACK.monthPence)} / mo.{" "}
            {FRANCHISE_PACK.body} A second badge on a Group contract is this pack — not a new role
            named after the brand.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-10 border-t border-line pt-12 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl tracking-tight">What we will not take money for yet</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              A monthly subscription before the second client can be stood up from config. That would
              be charging for a prototype. Site and Group invoices start at go-live.
            </p>
          </div>
          <div>
            <h2 className="font-display text-2xl tracking-tight">What they send before we start</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {kit.map((item) => (
                <li key={item} className="border-b border-line py-2">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
