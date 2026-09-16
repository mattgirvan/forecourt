import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { BRAND_LIST, BRANDS, ROOFTOP_PRESETS, groupMark, rooftopSearch } from "@/lib/brands";
import { useDemo } from "@/lib/demo-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function OpenDeskButton({ className }: { className?: string }) {
  const company = useDemo((s) => s.company);
  const brandId = useDemo((s) => s.brandId);
  const site = useDemo((s) => s.site);
  const brand = BRANDS[brandId];
  const mark = groupMark(company.trim() || "Your group");

  return (
    <Button className={className} asChild>
      <Link to="/demo" search={rooftopSearch({ company, brandId, site })}>
        Open {mark} + {brand.word}
        <ArrowRight className="size-4" />
      </Link>
    </Button>
  );
}

export function RooftopBar({ showOpen = true }: { showOpen?: boolean }) {
  const company = useDemo((s) => s.company);
  const brandId = useDemo((s) => s.brandId);
  const site = useDemo((s) => s.site);
  const setCompany = useDemo((s) => s.setCompany);
  const setBrand = useDemo((s) => s.setBrand);
  const setSite = useDemo((s) => s.setSite);
  const setRooftop = useDemo((s) => s.setRooftop);
  const hydrate = useDemo((s) => s.hydrate);
  const brand = BRANDS[brandId];
  const mark = groupMark(company.trim() || "Your group");

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">
            Put their name on the glass
          </p>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Group, rooftop, franchise. Then open a full desk — their book, their badge, not a widget
            in this page.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ROOFTOP_PRESETS.map((p) => (
            <button
              key={p.company}
              type="button"
              onClick={() => setRooftop(p)}
              className={cn(
                "h-8 rounded-sm px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors",
                company === p.company && brandId === p.brandId
                  ? "bg-fg text-accent-fg"
                  : "bg-elevated text-muted hover:text-fg",
              )}
            >
              {p.company.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
        <div>
          <Label htmlFor="group-name">Motor group</Label>
          <Input
            id="group-name"
            className="mt-1.5"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. John Clark Motor Group"
            autoComplete="organization"
          />
        </div>
        <div>
          <Label htmlFor="rooftop-site">Rooftop</Label>
          <Input
            id="rooftop-site"
            className="mt-1.5"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="e.g. Aberdeen"
          />
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
          Primary franchise
        </p>
        <div className="flex flex-wrap gap-1.5 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:pb-1">
          {BRAND_LIST.map((b) => {
            const on = b.id === brandId;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setBrand(b.id)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs transition-[border-color,background-color,color] duration-200",
                  on
                    ? "border-transparent text-bg"
                    : "border-line bg-elevated text-muted hover:text-fg",
                )}
                style={on ? { background: b.accent, color: b.ink } : undefined}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: on ? b.ink : b.accent }}
                />
                {b.label}
              </button>
            );
          })}
        </div>
      </div>

      {showOpen && (
        <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {mark}
              <span className="mx-1.5 text-muted">+</span>
              <span style={{ color: brand.accent }}>{brand.word}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              Opens a full {brand.label} desk. Fictional stock. Clickable — locator, GP, customer
              glass.
            </p>
          </div>
          <OpenDeskButton />
        </div>
      )}
    </div>
  );
}
