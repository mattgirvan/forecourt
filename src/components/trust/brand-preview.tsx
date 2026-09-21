import { brandOptions, type TenantPack } from "@/lib/build";
import { cn } from "@/lib/utils";

const OEM_NOTE = "Colours for preview only — not affiliated with the manufacturer.";

/** Dark desk chrome mock: accent pill + wordmark/letter + URL chip. */
export function BrandPackPreview({
  pack,
  onAccentPick,
  className,
}: {
  pack: TenantPack;
  onAccentPick?: (brandId: string) => void;
  className?: string;
}) {
  const mark = (pack.groupMark || pack.name || "FC").slice(0, 3).toUpperCase();
  const word = pack.franchise.word || "YOUR BRAND";
  const accent = pack.franchise.accent || "#D9A24B";
  const host = pack.domain?.trim()
    ? pack.domain.replace(/^https?:\/\//, "")
    : "portal.yourdealer.co.uk";

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-xl font-semibold tracking-tight">Brand pack preview</h3>
        <p className="mt-1 text-sm text-muted">
          How the desk chrome will feel with your colours — still Forecourt glass, with your name on it.
        </p>
      </div>

      <div
        className="overflow-hidden rounded-[1.5rem] border border-line"
        style={{ background: "#0B0F14", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex size-9 items-center justify-center rounded-full text-[11px] font-bold"
              style={{ background: accent, color: pack.franchise.ink || "#0B0F14" }}
            >
              {mark}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">{pack.name || "Your dealership"}</div>
              <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: accent }}>
                {word}
              </div>
            </div>
          </div>
          <span
            className="rounded-full px-3 py-1 text-[11px] font-medium"
            style={{ background: accent, color: pack.franchise.ink || "#0B0F14" }}
          >
            Live desk
          </span>
        </div>
        <div className="space-y-3 px-4 py-4">
          <div
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] text-white/80"
            style={{ borderColor: "rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.06)" }}
          >
            <span className="size-1.5 rounded-full" style={{ background: accent }} />
            https://{host}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["Overview", "Stock", "Deals"].map((tab) => (
              <div
                key={tab}
                className="rounded-xl border px-3 py-4 text-center text-[11px] text-white/70"
                style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
              >
                {tab}
              </div>
            ))}
          </div>
        </div>
      </div>

      {onAccentPick ? (
        <div>
          <div className="text-sm">Franchise colours</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {brandOptions().map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onAccentPick(b.id)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs",
                  pack.franchise.id === b.id ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
                )}
              >
                <span className="size-2.5 rounded-full" style={{ background: b.accent }} />
                {b.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="size-3 rounded-full" style={{ background: accent }} />
          {word} · {accent}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-subtle">{OEM_NOTE}</p>
      <p className="text-xs text-muted">
        Logo: {pack.brief.logoReady ? "Marked ready (or group mark)." : "Still needed — SVG or PNG."}
      </p>
    </div>
  );
}
