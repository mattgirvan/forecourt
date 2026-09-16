import { createFileRoute, Link } from "@tanstack/react-router";
import { Desk } from "@/components/demo/desk";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { tenants } from "@/lib/demo-data";
import { useDemo } from "@/lib/demo-store";

export const Route = createFileRoute("/demo")({ component: DemoPage });

function DemoPage() {
  const tenant = useDemo((s) => s.tenant);
  const t = tenants[tenant];

  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">
              Interactive desk
            </p>
            <h1 className="mt-2 font-display text-4xl tracking-tight">The instance they would run.</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
              Fictional dealers, live controls. Switch the brand pack, move a car along the factory
              lane, put GP on the row, open what the customer sees. {t.legal} · {t.sites.join(", ")} ·{" "}
              {t.domain}

            </p>
          </div>
          <Button asChild>
            <Link to="/pilot">This, on our rooftop</Link>
          </Button>
        </div>
        <div className="mt-8">
          <Desk />
        </div>
        <p className="mt-4 text-xs text-subtle">{t.note}</p>
      </div>
    </SiteShell>
  );
}
