import { useRef, useState } from "react";
import { Calendar, Check, CheckCircle2, Circle, Sparkles } from "lucide-react";
import { Chip, FakeCursor, SceneA, StepCopy, StepTrack, Swap, ease, lerp, placeCursor, pointIn, same, seg, useStepProgress } from "./kit";
import { cn } from "@/lib/utils";

const CHECKS = ["Branding", "Staff added", "Stock linked"] as const;
const TAPS = [0.3, 0.45, 0.6];

export function StepSetup() {
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const tickRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [s, setS] = useState({ booked: false, ticked: 0, press: false, toast: false });

  const trackRef = useStepProgress<HTMLElement>((p) => {
    const next = {
      booked: p >= 0.06,
      ticked: TAPS.filter((t) => p >= t).length,
      press: TAPS.some((t) => p >= t - 0.025 && p < t + 0.02),
      toast: p >= 0.7,
    };
    setS((prev) => (same(prev, next) ? prev : next));

    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const pts = CHECKS.map((_, i) => pointIn(box, tickRefs.current[i]));
    const from = { x: box.width * 0.9, y: box.height * 0.98 };
    let a = from;
    let b = pts[0];
    let t = ease(seg(p, 0.15, 0.27));
    if (p >= 0.47) {
      a = pts[1];
      b = pts[2];
      t = ease(seg(p, 0.47, 0.57));
    } else if (p >= 0.32) {
      a = pts[0];
      b = pts[1];
      t = ease(seg(p, 0.32, 0.42));
    }
    placeCursor(cursorRef.current, lerp(a.x, b.x, t), lerp(a.y, b.y, t), seg(p, 0.12, 0.18) * (1 - seg(p, 0.78, 0.86)));
  });

  return (
    <StepTrack n={1} kind="a" trackRef={trackRef}>
      <SceneA copy={<StepCopy n={1} title="Set up in days, not months." line="Book a kickoff call, tick off three things, and your preview is ready to look at." />}>
        <div ref={stageRef} className="hiw-card hiw-card-setup">
          <div className="hiw-card-head">
            <div>
              <div className="hiw-card-title">Getting started</div>
              <div className="hiw-card-sub">Example Motors</div>
            </div>
            <Swap on={s.ticked} end>
              <Chip tone="neutral">3 to do</Chip>
              <Chip tone="neutral">2 to do</Chip>
              <Chip tone="neutral">1 to do</Chip>
              <Chip tone="done">
                <Check size={12} strokeWidth={3} /> All done
              </Chip>
            </Swap>
          </div>

          <div className="hiw-row">
            <Calendar size={18} className="shrink-0 text-[var(--shell-text-dim)]" />
            <div className="min-w-0 flex-1">
              <div className="hiw-row-title">Forecourt kickoff call</div>
              <div className="hiw-row-sub">Tue 3 Nov 2026, 10:00</div>
            </div>
            <Swap on={s.booked ? 1 : 0} end>
              <Chip tone="idle">Booking</Chip>
              <Chip tone="done">
                <Check size={13} strokeWidth={3} /> Booked
              </Chip>
            </Swap>
          </div>

          <ul className="mt-2 grid gap-2">
            {CHECKS.map((c, i) => {
              const done = s.ticked > i;
              return (
                <li key={c} className="hiw-row">
                  <div className="min-w-0 flex-1">
                    <div className="hiw-row-title">{c}</div>
                  </div>
                  <span
                    ref={(el) => {
                      tickRefs.current[i] = el;
                    }}
                    className="hiw-tick"
                  >
                    <Swap on={done ? 1 : 0}>
                      <Circle size={22} color="var(--shell-text-faint)" />
                      <CheckCircle2 size={22} color="var(--emerald)" />
                    </Swap>
                  </span>
                </li>
              );
            })}
          </ul>

          <div className={cn("hiw-in hiw-toast", s.toast && "is-in")}>
            <div className={cn("hiw-preview-tile", s.toast && "is-in")} aria-hidden>
              <span className="hiw-preview-bar" />
              <span className="hiw-preview-logo">EM</span>
            </div>
            <div className="min-w-0">
              <div className="hiw-row-title flex items-center gap-1.5">
                <Sparkles size={14} color="var(--emerald)" /> Your preview is ready.
              </div>
              <div className="hiw-row-sub">Your logo, your colours, your stock.</div>
            </div>
          </div>

          <FakeCursor innerRef={cursorRef} down={s.press} />
        </div>
      </SceneA>
    </StepTrack>
  );
}
