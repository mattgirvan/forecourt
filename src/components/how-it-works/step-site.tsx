import { useRef, useState } from "react";
import { Building2, Check, CheckCircle2 } from "lucide-react";
import { Chip, FakeCursor, StepCopy, StepTrack, Swap, ease, lerp, placeCursor, pointIn, same, seg, useStepProgress } from "./kit";
import { PinnedSplit, placeTravel } from "./split";
import { cn } from "@/lib/utils";

const NAME = "Example Motors North";
const SITES = [
  { name: "Example Motors", brand: "Škoda" },
  { name: "Example Motors East", brand: "SEAT" },
] as const;

export function StepSite() {
  const splitRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLSpanElement>(null);
  const saveRef = useRef<HTMLSpanElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const [s, setS] = useState({ typed: 0, brand: false, added: false, note: false, landed: false, press: false });

  const trackRef = useStepProgress<HTMLElement>((p) => {
    const next = {
      typed: Math.round(seg(p, 0.06, 0.22) * NAME.length),
      brand: p >= 0.3,
      added: p >= 0.44,
      note: p >= 0.48,
      landed: p >= 0.75,
      press: (p >= 0.28 && p < 0.32) || (p >= 0.42 && p < 0.46),
    };
    setS((prev) => (same(prev, next) ? prev : next));

    const left = leftRef.current?.getBoundingClientRect();
    if (left) {
      const from = { x: left.width * 0.9, y: left.height * 0.98 };
      const brand = pointIn(left, brandRef.current);
      const save = pointIn(left, saveRef.current);
      let a = from;
      let b = brand;
      let t = ease(seg(p, 0.18, 0.27));
      if (p >= 0.33) {
        a = brand;
        b = save;
        t = ease(seg(p, 0.33, 0.41));
      }
      placeCursor(cursorRef.current, lerp(a.x, b.x, t), lerp(a.y, b.y, t), seg(p, 0.15, 0.2) * (1 - seg(p, 0.5, 0.56)));
    }

    const show = seg(p, 0.52, 0.55) * (1 - seg(p, 0.75, 0.78));
    placeTravel(splitRef.current, chipRef.current, fillRef.current, sourceRef.current, slotRef.current, seg(p, 0.55, 0.75), seg(p, 0.52, 0.55), show);
  }, 5200);

  const tile = (
    <>
      <Building2 size={16} className="shrink-0 text-[var(--shell-text-dim)]" />
      <div className="min-w-0 flex-1">
        <div className="hiw-row-title truncate">{NAME}</div>
        <div className="hiw-row-sub">Škoda</div>
      </div>
    </>
  );

  return (
    <StepTrack n={6} kind="b" trackRef={trackRef}>
      <div className="hiw-b">
        <StepCopy n={6} center title="Opening a new site? Add it yourself." line="Fill in the name and brand. It shows up in your customer view site switcher straight away." />
        <PinnedSplit
          splitRef={splitRef}
          chipRef={chipRef}
          fillRef={fillRef}
          chip={<div className="hiw-site-tile is-travel">{tile}</div>}
          left={
            <div ref={leftRef} className="hiw-card hiw-card-split">
              <div className="hiw-card-head">
                <div>
                  <div className="hiw-card-kicker">Forecourt</div>
                  <div className="hiw-card-title">Add site</div>
                </div>
                <span className="hiw-card-sub">Your account</span>
              </div>
              <div ref={sourceRef}>
                <div className="hiw-field-label">Site name</div>
                <div className="hiw-field">
                  <span>{NAME.slice(0, s.typed)}</span>
                  {s.typed > 0 && s.typed < NAME.length && <span className="hiw-caret" aria-hidden />}
                </div>
              </div>
              <div className="hiw-field-label mt-3">Brand</div>
              <div className="hiw-seg" role="presentation">
                <span ref={brandRef} className="hiw-seg-opt">
                  <span className={cn("hiw-seg-on", s.brand && "is-on")} aria-hidden />
                  <span className="relative">Škoda</span>
                </span>
                <span className="hiw-seg-opt">
                  <span className="relative">SEAT</span>
                </span>
              </div>
              <div className="mt-3 flex items-center justify-end">
                <span ref={saveRef}>
                  <Swap on={s.added ? 1 : 0} end>
                    <span className="hiw-btn" data-tone="action">
                      Save site
                    </span>
                    <span className="hiw-btn" data-tone="done">
                      <CheckCircle2 size={15} /> Added
                    </span>
                  </Swap>
                </span>
              </div>
              <p className={cn("hiw-in hiw-note", s.note && "is-in")}>No setup fee to add a site. Monthly cost depends on your plan.</p>
              <FakeCursor innerRef={cursorRef} down={s.press} />
            </div>
          }
          right={
            <div className="hiw-card hiw-card-split">
              <div className="hiw-card-head">
                <div>
                  <div className="hiw-card-kicker">Customer view</div>
                  <div className="hiw-card-title">Site switcher</div>
                </div>
                <Swap on={s.landed ? 1 : 0} end>
                  <span className="hiw-card-sub">2 sites</span>
                  <span className="hiw-card-sub">3 sites</span>
                </Swap>
              </div>
              <div className="grid gap-2">
                {SITES.map((site) => (
                  <div key={site.name} className="hiw-site-tile">
                    <Building2 size={16} className="shrink-0 text-[var(--shell-text-dim)]" />
                    <div className="min-w-0 flex-1">
                      <div className="hiw-row-title truncate">{site.name}</div>
                      <div className="hiw-row-sub">{site.brand}</div>
                    </div>
                  </div>
                ))}
                {/* Pre-reserved slot: the list grows by one without moving anything. */}
                <div ref={slotRef} className={cn("hiw-site-tile hiw-slot", s.landed && "is-in")}>
                  {tile}
                  <Chip tone="done">
                    <Check size={12} strokeWidth={3} /> Added
                  </Chip>
                </div>
              </div>
            </div>
          }
        />
      </div>
    </StepTrack>
  );
}
