import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Desk } from "@/components/demo/desk";
import { RooftopBar } from "@/components/demo/rooftop-bar";
import { Button } from "@/components/ui/button";
import { companySlug } from "@/lib/brands";
import { useDemo, type DeskTab } from "@/lib/demo-store";
import { cn } from "@/lib/utils";

const tour: DeskTab[] = ["overview", "stock", "locator", "pipeline", "customer", "mind"];

export function PortalStage({ playing = true }: { playing?: boolean }) {
  const tab = useDemo((s) => s.tab);
  const setTab = useDemo((s) => s.setTab);
  const view = useDemo((s) => s.view);
  const setView = useDemo((s) => s.setView);
  const company = useDemo((s) => s.company);
  const [paused, setPaused] = useState(!playing);
  const host = `portal.${companySlug(company.trim() || "group")}.co.uk`;

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      const i = tour.indexOf(tab);
      const next = tour[(i + 1) % tour.length] ?? "overview";
      if (next === "customer") setView("customer");
      else {
        if (view === "customer") setView("staff");
        setTab(next);
      }
    }, 3200);
    return () => window.clearInterval(id);
  }, [paused, tab, view, setTab, setView]);

  return (
    <div className="space-y-3">
      <RooftopBar />
      <div
        className="overflow-hidden rounded-xl border border-line bg-bg-2 p-2 shadow-soft sm:p-3"
        onPointerDown={() => setPaused(true)}
      >
        <div className="mb-2 flex items-center gap-1.5 px-1">
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
            {host} — live desk
          </span>
        </div>
        <Desk />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Type the group. Pick Audi, Škoda, BMW. The glass, the wordmark and the book all move. Click
          in to take over the tour.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className={cn(
              "h-9 rounded-sm border border-line px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted",
              !paused && "text-fg",
            )}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? "Play tour" : "Pause"}
          </button>
          <Button size="sm" asChild>
            <Link to="/demo">Open full screen</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
