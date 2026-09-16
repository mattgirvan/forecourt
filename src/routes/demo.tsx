import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { Desk } from "@/components/demo/desk";
import { DealerBar } from "@/components/demo/dealer-bar";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import {
  BRANDS,
  companySlug,
  groupMark,
  isBrandId,
  type DemoSearch,
} from "@/lib/brands";
import { useDemo } from "@/lib/demo-store";

export const Route = createFileRoute("/demo")({
  validateSearch: (raw: Record<string, unknown>): DemoSearch => ({
    group: typeof raw.group === "string" ? raw.group : undefined,
    brand: isBrandId(raw.brand) ? raw.brand : undefined,
    site: typeof raw.site === "string" ? raw.site : undefined,
  }),
  component: DemoPage,
});

function DemoPage() {
  const search = Route.useSearch();
  const setDealer = useDemo((s) => s.setDealer);
  const hydrate = useDemo((s) => s.hydrate);
  const company = useDemo((s) => s.company);
  const brandId = useDemo((s) => s.brandId);
  const site = useDemo((s) => s.site);
  const [edit, setEdit] = useState(false);
  const brand = BRANDS[brandId];
  const mark = groupMark(company.trim() || "Your group");
  const host = `portal.${companySlug(company.trim() || "group")}.co.uk`;

  useEffect(() => {
    if (search.group || search.brand || search.site) {
      setDealer({
        ...(search.group ? { company: search.group } : {}),
        ...(search.brand ? { brandId: search.brand } : {}),
        ...(search.site ? { site: search.site } : {}),
      });
      return;
    }
    hydrate();
  }, [search.group, search.brand, search.site, setDealer, hydrate]);

  return (
    <div className="flex min-h-dvh flex-col bg-[#0b0f14] text-white">
      <header className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="flex items-center gap-2 text-white/70 hover:text-white">
            <Mark className="size-5" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em]">Forecourt</span>
          </Link>
          <span className="hidden text-white/25 sm:inline">/</span>
          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-xs font-medium">
              {mark} + {brand.word}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
              Preview · fictional {brand.label} book · {host}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEdit((v) => !v)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70 hover:text-white"
          >
            <SlidersHorizontal className="size-3.5" />
            {edit ? "Hide" : "Change site"}
          </button>
          <Button
            size="sm"
            variant="secondary"
            className="border-white/20 bg-transparent text-white hover:bg-white/10"
            asChild
          >
            <Link to="/">
              <ArrowLeft className="size-3.5" />
              Product
            </Link>
          </Button>
          <Button size="sm" className="desk-cta" asChild>
            <Link to="/account" search={{ plan: "site", billing: "trial" }}>
              This, on our site
            </Link>
          </Button>
        </div>
      </header>

      {edit && (
        <div className="shrink-0 border-b border-white/10 bg-[#10141a] px-3 py-3 sm:px-4">
          <DealerBar showOpen={false} />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col p-2 sm:p-3">
        <Desk fill />
      </div>
    </div>
  );
}
