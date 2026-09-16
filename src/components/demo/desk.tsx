import { useMemo, useState } from "react";
import {
  ArrowRight,
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
import {
  locatorLane,
  monthTarget,
  pipelineStages,
  tenants,
  type Deal,
  type TenantSlug,
} from "@/lib/demo-data";
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

function dealsForTenant(deals: Deal[], slug: TenantSlug) {
  const sites = tenants[slug].sites;
  return deals.filter((d) => sites.includes(d.site));
}


export function Desk({ compact = false }: { compact?: boolean }) {
  const tenant = useDemo((s) => s.tenant);
  const tab = useDemo((s) => s.tab);
  const view = useDemo((s) => s.view);
  const setTenant = useDemo((s) => s.setTenant);
  const setTab = useDemo((s) => s.setTab);
  const setView = useDemo((s) => s.setView);
  const t = tenants[tenant];

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-line bg-surface shadow-soft",
        compact ? "min-h-[420px]" : "min-h-[640px]",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">
            Demo instance
          </div>
          <div className="truncate text-sm font-medium text-fg">{t.name}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(tenants) as TenantSlug[]).map((slug) => (
            <button
              key={slug}
              type="button"
              onClick={() => setTenant(slug)}
              className={cn(
                "h-8 rounded-sm px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors",
                tenant === slug
                  ? "bg-fg text-accent-fg"
                  : "bg-elevated text-muted hover:text-fg",
              )}
            >
              {tenants[slug].name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1.5 sm:px-3">
        <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "shrink-0 rounded-sm px-2.5 py-2 text-[12px] transition-colors",
                tab === item.id ? "bg-elevated text-fg" : "text-muted hover:text-fg",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setView(view === "staff" ? "customer" : "staff")}
          className="shrink-0 rounded-sm border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted hover:text-fg"
        >
          {view === "staff" ? "As customer" : "As staff"}


        </button>
      </div>

      <div className={cn("p-3 sm:p-4", compact && "max-h-[360px] overflow-auto")}>
        {view === "customer" ? <CustomerPane compact={compact} /> : <StaffPane compact={compact} />}
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
  const tenant = useDemo((s) => s.tenant);
  const deals = useDemo((s) => s.deals);
  const selectDeal = useDemo((s) => s.selectDeal);
  const toggleMonthEnd = useDemo((s) => s.toggleMonthEnd);
  const rows = dealsForTenant(deals, tenant);
  const live = rows.filter((d) => d.stageIndex < 5);
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
        <p className="text-xs text-muted">
          Target {monthTarget.units} units / {gbp(monthTarget.gp)} GP. Tick the row. GP sits on the
          deal, not in a board pack.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.12em] text-subtle">
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
              <tr key={d.id} className="border-b border-line/70">
                <td className="py-2.5 pr-3">
                  <div className="font-medium">{d.customer}</div>
                  <div className="font-mono text-[11px] text-subtle">{d.id}</div>
                </td>
                <td className="py-2.5 pr-3">
                  <div>{d.vehicle}</div>
                  <div className="text-xs text-muted">{d.colour}</div>
                </td>
                <td className="py-2.5 pr-3 text-xs text-muted">{pipelineStages[d.stageIndex]}</td>
                <td
                  className={cn(
                    "py-2.5 pr-3 font-mono text-xs tabular-nums",
                    d.gp == null || d.gp < 0 ? "text-bad" : "text-fg",
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
                        : "border-line text-subtle",
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
                    className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg"
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
    <div className="rounded-md border border-line bg-elevated px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">{k}</div>
      <div className={cn("mt-1 font-mono text-lg tabular-nums", warn ? "text-warn" : "text-fg")}>
        {v}
      </div>
    </div>
  );
}

function StockPane() {
  const tenant = useDemo((s) => s.tenant);
  const stock = useDemo((s) => s.stock);
  const sites = tenants[tenant].sites;
  const rows = stock.filter((s) => sites.includes(s.site));


  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {rows.length} units. Missing cars and unknown keys are flagged, not buried in a sheet.
        </p>
        <Badge tone={rows.some((r) => r.missing) ? "bad" : "ok"}>
          {rows.filter((r) => r.missing).length} missing
        </Badge>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((car) => (
          <li key={car.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{car.vehicle}</span>
                <Badge tone={car.type === "New" ? "neutral" : "ok"}>{car.type}</Badge>
                {car.missing && <Badge tone="bad">Missing</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" /> {car.site}
                </span>
                <span className="inline-flex items-center gap-1">
                  <KeyRound className="size-3" /> {car.keys}
                </span>
                <span className="font-mono tabular-nums">{car.days}d on site</span>
              </div>
            </div>
            <div className="shrink-0 text-right font-mono text-sm tabular-nums">
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
  const tenant = useDemo((s) => s.tenant);
  const rows = dealsForTenant(deals, tenant);
  const deal = rows.find((d) => d.id === selectedDealId) ?? rows[0];
  if (!deal) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {rows.map((d) => (
          <li key={d.id} className="shrink-0">
            <button
              type="button"
              onClick={() => selectDeal(d.id)}
              className={cn(
                "w-full rounded-sm border px-3 py-2 text-left text-sm",
                d.id === deal.id
                  ? "border-line-strong bg-elevated text-fg"
                  : "border-transparent text-muted hover:text-fg",
              )}
            >
              <div className="truncate">{d.customer}</div>
              <div className="font-mono text-[10px] text-subtle">{locatorLane[d.locatorIndex].code}</div>
            </button>
          </li>
        ))}
      </ul>
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-display text-2xl">{deal.vehicle}</div>
            <div className="mt-1 text-sm text-muted">
              {deal.customer} · {deal.colour} · {deal.vin.slice(-7)}
            </div>
          </div>
          <Badge tone={deal.confirmed ? "ok" : "warn"}>
            {deal.confirmed ? "Confirmed" : "Unconfirmed"}
          </Badge>
        </div>
        <ol className="mt-6 space-y-2">
          {locatorLane.map((step, i) => {
            const done = i <= deal.locatorIndex;
            const current = i === deal.locatorIndex;
            return (
              <li key={step.code} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border font-mono text-[10px]",
                    done
                      ? "border-ok/40 bg-ok/15 text-ok"
                      : "border-line text-subtle",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={cn("text-sm", current ? "text-fg" : "text-muted")}>
                  <span className="font-mono text-[11px] text-subtle">{step.code}</span> {step.label}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div className="w-32">
            <Label htmlFor="gp">GP</Label>
            <Input
              id="gp"
              className="mt-1.5"
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
            disabled={deal.locatorIndex >= 5}
            onClick={() => advanceLocator(deal.id)}
          >
            Advance locator
          </Button>
          {!deal.confirmed && (
            <Button size="sm" onClick={() => confirmDeal(deal.id)}>
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

function PipelinePane() {
  const tenant = useDemo((s) => s.tenant);
  const deals = useDemo((s) => s.deals);
  const setStage = useDemo((s) => s.setStage);
  const selectDeal = useDemo((s) => s.selectDeal);
  const rows = dealsForTenant(deals, tenant);

  return (
    <div className="space-y-3">
      {rows.map((d) => (
        <div key={d.id} className="rounded-md border border-line bg-elevated p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <button type="button" className="text-left" onClick={() => selectDeal(d.id)}>
              <div className="font-medium">{d.customer}</div>
              <div className="text-xs text-muted">
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
                  i === d.stageIndex ? "bg-fg text-accent-fg" : "bg-surface text-muted",
                )}
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
  const tenant = useDemo((s) => s.tenant);
  const rows = dealsForTenant(deals, tenant);
  const deal = rows.find((d) => d.id === selectedDealId) ?? rows[0];
  if (!deal) return null;
  const step = locatorLane[deal.locatorIndex];

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
          Your order
        </div>
        <div className="mt-1 font-display text-3xl leading-tight">{deal.vehicle}</div>
        <div className="mt-1 text-sm text-muted">{deal.colour}</div>
      </div>
      <div className="rounded-md border border-line bg-elevated p-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
          Where it is
        </div>
        <div className="mt-1 text-lg">{step.label}</div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg">
          <div
            className="h-full bg-fg transition-[width] duration-300"
            style={{ width: `${((deal.locatorIndex + 1) / locatorLane.length) * 100}%` }}
          />
        </div>
      </div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
          Still needed from you
        </div>
        <ul className="mt-2 space-y-2">
          {(deal.missing.length ? deal.missing : ["Nothing — we will message before handover"]).map(
            (item) => (
              <li
                key={item}
                className="flex items-center gap-2 rounded-sm border border-line px-3 py-2 text-sm"
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
        <p className="text-sm text-muted">
          Handover pencilled {new Date(deal.handover).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.
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
          .split(/[\/,]/)
          .some((w) => car.vehicle.toLowerCase().includes(w.trim().split(" ")[0] ?? ""));
        return colourOk && milesOk && priceOk && (modelOk || b.want.toLowerCase().includes("suv") || b.want.toLowerCase().includes("crossover") || b.want.toLowerCase().includes("pickup") || b.want.toLowerCase().includes("truck"));
      });
      return { brief: b, hits };
    });
  }, [briefs, stock]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">Saved briefs scanned against live stock.</p>
        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
          <Plus className="size-3.5" /> Brief
        </Button>
      </div>
      {open && <BriefForm onSave={(b) => { addBrief(b); setOpen(false); }} />}
      <ul className="space-y-3">
        {matches.map(({ brief, hits }) => (
          <li key={brief.id} className="rounded-md border border-line p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{brief.name}</div>
                <div className="text-xs text-muted">
                  {brief.want} · {brief.colour} · ≤ {brief.maxMiles.toLocaleString()} mi · ≤ {gbp(brief.maxPrice)}
                </div>
              </div>
              <Badge tone={hits.length ? "ok" : "neutral"}>{hits.length} match</Badge>
            </div>
            {hits.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-muted">
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

function BriefForm({ onSave }: { onSave: (b: { name: string; want: string; colour: string; maxMiles: number; maxPrice: number }) => void }) {
  const [name, setName] = useState("");
  const [want, setWant] = useState("");
  const [colour, setColour] = useState("Any");
  const [maxMiles, setMaxMiles] = useState("25000");
  const [maxPrice, setMaxPrice] = useState("25000");

  return (
    <form
      className="grid gap-3 rounded-md border border-line bg-elevated p-3 sm:grid-cols-2"
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
        <Label htmlFor="bn">Name</Label>
        <Input id="bn" className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="bw">Want</Label>
        <Input id="bw" className="mt-1.5" value={want} onChange={(e) => setWant(e.target.value)} placeholder="Kuga, pickup…" />
      </div>
      <div>
        <Label htmlFor="bc">Colour</Label>
        <Input id="bc" className="mt-1.5" value={colour} onChange={(e) => setColour(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="bm">Max miles</Label>
          <Input id="bm" className="mt-1.5" value={maxMiles} onChange={(e) => setMaxMiles(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="bp">Max £</Label>
          <Input id="bp" className="mt-1.5" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
        </div>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm">
          Save brief
        </Button>
      </div>
    </form>
  );
}
