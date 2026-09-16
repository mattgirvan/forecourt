import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Car,
  Check,
  ChevronRight,
  KeyRound,
  MapPin,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRANDS, companySlug, groupMark } from "@/lib/brands";
import { locatorLane, monthTarget, pipelineStages, type Deal } from "@/lib/demo-data";
import { useDemo, type DeskTab } from "@/lib/demo-store";
import { cn, gbp } from "@/lib/utils";

const tabs: { id: DeskTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "stock", label: "Stock" },
  { id: "locator", label: "Locator" },
  { id: "pipeline", label: "Pipeline" },
  { id: "customer", label: "Customer" },
  { id: "mind", label: "Keep in mind" },
];

function toneForMissing(n: number) {
  if (n === 0) return "ok" as const;
  if (n <= 1) return "warn" as const;
  return "bad" as const;
}

export function Desk({ compact = false }: { compact?: boolean }) {
  const company = useDemo((s) => s.company);
  const brandId = useDemo((s) => s.brandId);
  const site = useDemo((s) => s.site);
  const tab = useDemo((s) => s.tab);
  const view = useDemo((s) => s.view);
  const setTab = useDemo((s) => s.setTab);
  const setView = useDemo((s) => s.setView);
  const hydrate = useDemo((s) => s.hydrate);
  const brand = BRANDS[brandId];
  const mark = groupMark(company.trim() || "Your group");
  const domain = `portal.${companySlug(company.trim() || "group")}.co.uk`;

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div
      className={cn("desk-shell relative overflow-hidden", compact ? "min-h-[420px]" : "min-h-[640px]")}
      style={
        {
          "--desk-accent": brand.accent,
          "--desk-glow": brand.glow,
        } as CSSProperties
      }
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
    >
      <div className="desk-orb" aria-hidden />
      <div className="desk-orb desk-orb-2" aria-hidden />

      <header className="desk-nav relative z-10 flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tracking-wide"
            style={{ background: brand.accent, color: brand.ink }}
          >
            {brand.word.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold tracking-wide text-white">
              {mark}
              <span className="mx-1.5 text-white/35">+</span>
              <span style={{ color: brand.accent }}>{brand.word}</span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
              My order portal
              <span className="mx-1.5">·</span>
              {site || "Main"}
            </div>
          </div>
        </div>
        {!compact && (
          <div className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-white/35 sm:block">
            {domain}
          </div>
        )}
      </header>

      <div className="relative z-10 flex items-center justify-between gap-2 px-2 py-2 sm:px-3">
        <div className="desk-inset flex min-w-0 flex-1 gap-0.5 overflow-x-auto p-0.5">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                if (item.id !== "customer" && view === "customer") setView("staff");
              }}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-2 text-[12px] transition-colors duration-200",
                tab === item.id ? "bg-white/10 text-white" : "text-white/50 hover:text-white",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setView(view === "staff" ? "customer" : "staff")}
          className="shrink-0 rounded-md border border-white/15 bg-white/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70 hover:text-white"
        >
          {view === "staff" ? "As customer" : "As staff"}
        </button>
      </div>

      <div
        className={cn("relative z-10 p-3 sm:p-4", compact && "max-h-[360px] overflow-auto")}
        key={`${brandId}-${view}-${tab}`}
      >
        <div className="desk-pane">
          {view === "customer" ? <CustomerPane compact={compact} /> : <StaffPane compact={compact} />}
        </div>
      </div>
    </div>
  );
}

function StaffPane({ compact }: { compact: boolean }) {
  const tab = useDemo((s) => s.tab);
  if (tab === "overview") return <OverviewPane compact={compact} />;
  if (tab === "stock") return <StockPane />;
  if (tab === "locator") return <LocatorPane />;
  if (tab === "pipeline") return <PipelinePane />;
  if (tab === "customer") return <CustomerPane compact={compact} />;
  return <MindPane />;
}

function OverviewPane({ compact }: { compact: boolean }) {
  const deals = useDemo((s) => s.deals);
  const selectDeal = useDemo((s) => s.selectDeal);
  const toggleMonthEnd = useDemo((s) => s.toggleMonthEnd);
  const live = deals.filter((d) => d.stageIndex < 5);
  const gpSum = live.reduce((a, d) => a + (d.gp ?? 0), 0);
  const leaking = live.filter((d) => d.gp == null || d.gp < 0 || d.missing.length > 0);
  const monthEnd = live.filter((d) => d.monthEnd);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat k="Live deals" v={String(live.length)} />
        <Stat k="GP on book" v={gbp(gpSum)} warn={gpSum < monthTarget.gp} />
        <Stat k="Month-end" v={String(monthEnd.length)} />
        <Stat k="Leaking" v={String(leaking.length)} warn={leaking.length > 0} />
      </div>
      {!compact && (
        <p className="text-xs text-white/50">
          Target {monthTarget.units} units / {gbp(monthTarget.gp)} GP. Tick the row. GP sits on the
          deal, not in a board pack.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
              <th className="py-2 pr-3 font-medium">Deal</th>
              <th className="py-2 pr-3 font-medium">Vehicle</th>
              <th className="py-2 pr-3 font-medium">Stage</th>
              <th className="py-2 pr-3 font-medium">GP</th>
              <th className="py-2 pr-3 font-medium">ME</th>
              <th className="py-2 font-medium">Open</th>
            </tr>
          </thead>
          <tbody>
            {live.map((d) => (
              <tr key={d.id} className="border-b border-white/10">
                <td className="py-2.5 pr-3">
                  <div className="font-medium text-white">{d.customer}</div>
                  <div className="font-mono text-[11px] text-white/40">{d.id}</div>
                </td>
                <td className="py-2.5 pr-3">
                  <div className="text-white/90">{d.vehicle}</div>
                  <div className="text-xs text-white/45">{d.colour}</div>
                </td>
                <td className="py-2.5 pr-3 text-xs text-white/55">{pipelineStages[d.stageIndex]}</td>
                <td
                  className={cn(
                    "py-2.5 pr-3 font-mono text-xs tabular-nums",
                    d.gp == null || d.gp < 0 ? "text-bad" : "text-white",
                  )}
                >
                  {d.gp == null ? "—" : gbp(d.gp)}
                </td>
                <td className="py-2.5 pr-3">
                  <button
                    type="button"
                    onClick={() => toggleMonthEnd(d.id)}
                    className={cn(
                      "size-7 rounded-sm border text-[11px]",
                      d.monthEnd
                        ? "border-warn/40 bg-warn/15 text-warn"
                        : "border-white/15 text-white/40",
                    )}
                    aria-label="Toggle month-end"
                  >
                    {d.monthEnd ? "ME" : "—"}
                  </button>
                </td>
                <td className="py-2.5">
                  <button
                    type="button"
                    onClick={() => selectDeal(d.id)}
                    className="inline-flex items-center gap-1 text-xs text-white/55 hover:text-white"
                  >
                    Open <ChevronRight className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="desk-glass rounded-lg px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">{k}</div>
      <div className={cn("mt-1 font-mono text-lg tabular-nums", warn ? "text-warn" : "text-white")}>
        {v}
      </div>
    </div>
  );
}

function StockPane() {
  const stock = useDemo((s) => s.stock);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-white/50">
          {stock.length} units. Missing cars and unknown keys are flagged, not buried in a sheet.
        </p>
        <Badge tone={stock.some((r) => r.missing) ? "bad" : "ok"}>
          {stock.filter((r) => r.missing).length} missing
        </Badge>
      </div>
      <ul className="divide-y divide-white/10">
        {stock.map((car) => (
          <li key={car.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-white">{car.vehicle}</span>
                <Badge tone={car.type === "New" ? "neutral" : "ok"}>{car.type}</Badge>
                {car.missing && <Badge tone="bad">Missing</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/50">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" /> {car.site}
                </span>
                <span className="inline-flex items-center gap-1">
                  <KeyRound className="size-3" /> {car.keys}
                </span>
                <span className="font-mono tabular-nums">{car.days}d on site</span>
              </div>
            </div>
            <div className="shrink-0 text-right font-mono text-sm tabular-nums text-white">
              {gbp(car.price)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LocatorPane() {
  const deals = useDemo((s) => s.deals);
  const selectedDealId = useDemo((s) => s.selectedDealId);
  const selectDeal = useDemo((s) => s.selectDeal);
  const advanceLocator = useDemo((s) => s.advanceLocator);
  const confirmDeal = useDemo((s) => s.confirmDeal);
  const setGp = useDemo((s) => s.setGp);
  const deal = deals.find((d) => d.id === selectedDealId) ?? deals[0];
  if (!deal) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {deals.map((d) => (
          <li key={d.id} className="shrink-0">
            <button
              type="button"
              onClick={() => selectDeal(d.id)}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-left text-sm",
                d.id === deal.id
                  ? "border-white/20 bg-white/10 text-white"
                  : "border-transparent text-white/50 hover:text-white",
              )}
            >
              <div className="truncate">{d.customer}</div>
              <div className="font-mono text-[10px] text-white/40">{locatorLane[d.locatorIndex].code}</div>
            </button>
          </li>
        ))}
      </ul>
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold tracking-tight text-white">{deal.vehicle}</div>
            <div className="mt-1 text-sm text-white/55">
              {deal.customer} · {deal.colour} · {deal.vin.slice(-7)}
            </div>
          </div>
          <Badge tone={deal.confirmed ? "ok" : "warn"}>
            {deal.confirmed ? "Confirmed" : "Unconfirmed"}
          </Badge>
        </div>
        <LocatorRail deal={deal} />
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div className="w-32">
            <Label htmlFor="gp" className="text-white/55">
              GP
            </Label>
            <Input
              id="gp"
              className="mt-1.5 border-white/15 bg-white/10 text-white"
              inputMode="numeric"
              defaultValue={deal.gp ?? ""}
              key={`${deal.id}-${deal.gp}`}
              onBlur={(e) => {
                const n = e.target.value.trim();
                setGp(deal.id, n === "" ? null : Number(n));
              }}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="border-white/20 bg-white/10 text-white hover:bg-white/10"
            disabled={deal.locatorIndex >= 5}
            onClick={() => advanceLocator(deal.id)}
          >
            Advance locator
          </Button>
          {!deal.confirmed && (
            <Button size="sm" className="desk-cta" onClick={() => confirmDeal(deal.id)}>
              Confirm deal
            </Button>
          )}
        </div>
        {deal.missing.length > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>Still open: {deal.missing.join(", ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function LocatorRail({ deal }: { deal: Deal }) {
  const i = deal.locatorIndex;
  const pct = (i / (locatorLane.length - 1)) * 100;

  return (
    <div className="mt-6">
      <div className="relative px-3 pt-7 pb-1">
        <div className="absolute top-[34px] right-3 left-3 h-1 rounded-full bg-white/10" />
        <div
          className="absolute top-[34px] left-3 h-1 rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: `calc(${pct}% )`, background: "var(--desk-accent)" }}
        />
        <div
          className="desk-car-pill absolute top-0 z-10 flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-medium text-black shadow-soft transition-[left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: `calc(${pct}% * 0.92 + 12px)`, background: "var(--desk-accent)" }}
        >
          <Car className="size-3.5" />
          Now
        </div>
        <ol className="relative grid grid-cols-6 gap-1">
          {locatorLane.map((step, idx) => {
            const done = idx <= i;
            return (
              <li key={step.code} className="flex flex-col items-center text-center">
                <span
                  className={cn(
                    "mb-2 size-2.5 rounded-full border",
                    done ? "border-transparent" : "border-white/25 bg-transparent",
                  )}
                  style={done ? { background: "var(--desk-accent)" } : undefined}
                />
                <span className="font-mono text-[9px] tracking-wide text-white/40">{step.code}</span>
                <span className={cn("mt-0.5 text-[10px] leading-tight", done ? "text-white/80" : "text-white/35")}>
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function PipelinePane() {
  const deals = useDemo((s) => s.deals);
  const setStage = useDemo((s) => s.setStage);
  const selectDeal = useDemo((s) => s.selectDeal);

  return (
    <div className="space-y-3">
      {deals.map((d) => (
        <div key={d.id} className="desk-glass rounded-lg p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <button type="button" className="text-left" onClick={() => selectDeal(d.id)}>
              <div className="font-medium text-white">{d.customer}</div>
              <div className="text-xs text-white/50">
                {d.vehicle} · {d.customerType} · {d.site}
              </div>
            </button>
            <Badge tone={toneForMissing(d.missing.length)}>
              {d.missing.length ? `${d.missing.length} open` : "Clean"}
            </Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {pipelineStages.map((stage, i) => (
              <button
                key={stage}
                type="button"
                onClick={() => setStage(d.id, i)}
                className={cn(
                  "rounded-sm px-2 py-1 text-[11px]",
                  i === d.stageIndex ? "text-black" : "bg-white/5 text-white/50",
                )}
                style={i === d.stageIndex ? { background: "var(--desk-accent)" } : undefined}
              >
                {stage}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CustomerPane({ compact }: { compact: boolean }) {
  const deals = useDemo((s) => s.deals);
  const selectedDealId = useDemo((s) => s.selectedDealId);
  const company = useDemo((s) => s.company);
  const brandId = useDemo((s) => s.brandId);
  const deal = deals.find((d) => d.id === selectedDealId) ?? deals[0];
  if (!deal) return null;
  const step = locatorLane[deal.locatorIndex];
  const brand = BRANDS[brandId];

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
          Your order · {company.trim() || "Your group"}
        </div>
        <div className="mt-1 text-3xl leading-tight font-semibold tracking-tight text-white">
          {deal.vehicle}
        </div>
        <div className="mt-1 text-sm text-white/55">{deal.colour}</div>
      </div>
      <div className="desk-glass rounded-lg p-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">Where it is</div>
        <div className="mt-1 text-lg text-white">{step.label}</div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full transition-[width] duration-500"
            style={{
              width: `${((deal.locatorIndex + 1) / locatorLane.length) * 100}%`,
              background: brand.accent,
            }}
          />
        </div>
      </div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
          Still needed from you
        </div>
        <ul className="mt-2 space-y-2">
          {(deal.missing.length ? deal.missing : ["Nothing — we will message before handover"]).map(
            (item) => (
              <li
                key={item}
                className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85"
              >
                {deal.missing.length ? (
                  <TriangleAlert className="size-4 text-warn" />
                ) : (
                  <Check className="size-4 text-ok" />
                )}
                {item}
              </li>
            ),
          )}
        </ul>
      </div>
      {!compact && deal.handover && (
        <p className="text-sm text-white/50">
          Handover pencilled{" "}
          {new Date(deal.handover).toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
          .
        </p>
      )}
    </div>
  );
}

function MindPane() {
  const briefs = useDemo((s) => s.briefs);
  const stock = useDemo((s) => s.stock);
  const addBrief = useDemo((s) => s.addBrief);
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    return briefs.map((b) => {
      const hits = stock.filter((car) => {
        const colourOk =
          b.colour === "Any" ||
          car.colour.toLowerCase().includes(b.colour.toLowerCase().split(" ")[0] ?? "");
        const milesOk = car.miles == null || car.miles <= b.maxMiles;
        const priceOk = car.price <= b.maxPrice;
        const modelOk = b.want
          .toLowerCase()
          .split(/[/,]/)
          .some((w) => car.vehicle.toLowerCase().includes(w.trim().split(" ")[0] ?? ""));
        return (
          colourOk &&
          milesOk &&
          priceOk &&
          (modelOk ||
            b.want.toLowerCase().includes("suv") ||
            b.want.toLowerCase().includes("crossover") ||
            b.want.toLowerCase().includes("pickup") ||
            b.want.toLowerCase().includes("truck"))
        );
      });
      return { brief: b, hits };
    });
  }, [briefs, stock]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/50">Saved briefs scanned against live stock.</p>
        <Button
          size="sm"
          variant="secondary"
          className="border-white/20 bg-white/10 text-white hover:bg-white/10"
          onClick={() => setOpen((v) => !v)}
        >
          <Plus className="size-3.5" /> Brief
        </Button>
      </div>
      {open && (
        <BriefForm
          onSave={(b) => {
            addBrief(b);
            setOpen(false);
          }}
        />
      )}
      <ul className="space-y-3">
        {matches.map(({ brief, hits }) => (
          <li key={brief.id} className="desk-glass rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-white">{brief.name}</div>
                <div className="text-xs text-white/50">
                  {brief.want} · {brief.colour} · ≤ {brief.maxMiles.toLocaleString()} mi · ≤{" "}
                  {gbp(brief.maxPrice)}
                </div>
              </div>
              <Badge tone={hits.length ? "ok" : "neutral"}>{hits.length} match</Badge>
            </div>
            {hits.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-white/60">
                {hits.slice(0, 3).map((h) => (
                  <li key={h.id} className="flex items-center gap-2">
                    <ArrowRight className="size-3.5" /> {h.vehicle} · {h.colour} · {gbp(h.price)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BriefForm({
  onSave,
}: {
  onSave: (b: { name: string; want: string; colour: string; maxMiles: number; maxPrice: number }) => void;
}) {
  const [name, setName] = useState("");
  const [want, setWant] = useState("");
  const [colour, setColour] = useState("Any");
  const [maxMiles, setMaxMiles] = useState("25000");
  const [maxPrice, setMaxPrice] = useState("25000");

  return (
    <form
      className="desk-glass grid gap-3 rounded-lg p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: name || "Walk-in",
          want: want || "Any SUV",
          colour,
          maxMiles: Number(maxMiles) || 999999,
          maxPrice: Number(maxPrice) || 999999,
        });
      }}
    >
      <div>
        <Label htmlFor="bn" className="text-white/55">
          Name
        </Label>
        <Input
          id="bn"
          className="mt-1.5 border-white/15 bg-white/10 text-white"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="bw" className="text-white/55">
          Want
        </Label>
        <Input
          id="bw"
          className="mt-1.5 border-white/15 bg-white/10 text-white"
          value={want}
          onChange={(e) => setWant(e.target.value)}
          placeholder="Kodiaq, Q5…"
        />
      </div>
      <div>
        <Label htmlFor="bc" className="text-white/55">
          Colour
        </Label>
        <Input
          id="bc"
          className="mt-1.5 border-white/15 bg-white/10 text-white"
          value={colour}
          onChange={(e) => setColour(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="bm" className="text-white/55">
            Max miles
          </Label>
          <Input
            id="bm"
            className="mt-1.5 border-white/15 bg-white/10 text-white"
            value={maxMiles}
            onChange={(e) => setMaxMiles(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="bp" className="text-white/55">
            Max £
          </Label>
          <Input
            id="bp"
            className="mt-1.5 border-white/15 bg-white/10 text-white"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
          />
        </div>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" className="desk-cta">
          Save brief
        </Button>
      </div>
    </form>
  );
}
