import { createFileRoute, Link } from "@tanstack/react-router";
import { Desk } from "@/components/demo/desk";
import { RooftopBar } from "@/components/demo/rooftop-bar";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { BRANDS, companySlug, groupMark } from "@/lib/brands";
import { useDemo } from "@/lib/demo-store";

export const Route = createFileRoute("/demo")({ component: DemoPage });

function DemoPage() {
  const company = useDemo((s) => s.company);
  const brandId = useDemo((s) => s.brandId);
  const site = useDemo((s) => s.site);
  const brand = BRANDS[brandId];
  const mark = groupMark(company.trim() || "Your group");

  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">
              Interactive desk
            </p>
            <h1 className="mt-2 font-display text-4xl tracking-tight">Their portal. Live on this glass.</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
              Type the group. Pick the franchise. The desk becomes {mark} + {brand.word} — same chrome
              the live rooftop runs, their stock book, their name on the door.{" "}
              {site || "Main"} · portal.{companySlug(company.trim() || "group")}.co.uk
            </p>
          </div>
          <Button asChild>
            <Link to="/pilot">This, on our rooftop</Link>
          </Button>
        </div>
        <div className="mt-8">
          <RooftopBar />
        </div>
        <div className="mt-4">
          <Desk />
        </div>
        <p className="mt-4 text-xs text-subtle">
          Fictional customers and VINs. Official manufacturer marks are not used — colour, wordmark and
          fleet only, so a principal can see the instance without a trademark fight.
        </p>
      </div>
    </SiteShell>
  );
}
