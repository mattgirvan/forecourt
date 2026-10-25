import { useRef, useState } from "react";
import { Clock } from "lucide-react";
import { Chip, FakeCursor, StepCopy, StepTrack, Swap, ease, lerp, placeCursor, pointIn, same, seg, useStepProgress } from "./kit";
import { PinnedSplit, placeTravel } from "./split";
import { cn } from "@/lib/utils";

const HOURS = [
  { day: "Mon to Fri", time: "9:00 to 18:00" },
  { day: "Sat", time: "9:00 to 17:00" },
] as const;

export function StepChanges() {
  const splitRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const tagRef = useRef<HTMLSpanElement>(null);
  const sunRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const pulseRef = useRef<HTMLSpanElement>(null);
  const [s, setS] = useState({ row: false, status: 0, press: false, lifted: false, sun: false });

  const trackRef = useStepProgress<HTMLElement>((p) => {
    const next = {
      row: p >= 0.05,
      status: p >= 0.4 ? 2 : p >= 0.28 ? 1 : 0,
      press: (p >= 0.26 && p < 0.3) || (p >= 0.38 && p < 0.42),
      lifted: p >= 0.5,
      sun: p >= 0.74,
    };
    setS((prev) => (same(prev, next) ? prev : next));

    const left = leftRef.current?.getBoundingClientRect();
    if (left) {
      const from = { x: left.width * 0.9, y: left.height * 0.98 };
      const to = pointIn(left, statusRef.current);
      const t = ease(seg(p, 0.15, 0.25));
      placeCursor(cursorRef.current, lerp(from.x, to.x, t), lerp(from.y, to.y, t), seg(p, 0.12, 0.17) * (1 - seg(p, 0.46, 0.52)));
    }

    // Beat 3: lift then travel across. Hidden before the lift and after it lands.
    const show = seg(p, 0.5, 0.53) * (1 - seg(p, 0.73, 0.76));
    placeTravel(splitRef.current, chipRef.current, fillRef.current, tagRef.current, sunRef.current, seg(p, 0.53, 0.73), seg(p, 0.5, 0.53), show);

    // Beat 4: one soft highlight pulse on the Sunday row.
    if (pulseRef.current) pulseRef.current.style.opacity = (Math.sin(Math.PI * seg(p, 0.75, 0.92)) * 0.9).toFixed(3);
  }, 5200);

  return (
    <StepTrack n={3} kind="b" trackRef={trackRef}>
      <div className="hiw-b">
        <StepCopy n={3} center title="Ask for a change. Watch it go live." line="Your request lands on our desk. When we mark it done, your customers see it straight away." />
        <PinnedSplit
          splitRef={splitRef}
          chipRef={chipRef}
          fillRef={fillRef}
          chip={
            <span className="hiw-tag is-travel">
              <Clock size={13} /> Opening hours
            </span>
          }
          left={
            <div ref={leftRef} className="hiw-card hiw-card-split">
              <div className="hiw-card-head">
                <div>
                  <div className="hiw-card-kicker">Forecourt</div>
                  <div className="hiw-card-title">Change requests</div>
                </div>
                <span className="hiw-card-sub">Staff desk</span>
              </div>
              <div className="grid gap-2">
                <div className={cn("hiw-in hiw-row", s.row && "is-in")}>
                  <div className="min-w-0 flex-1">
                    <div className="hiw-row-title">Add Sunday opening hours</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span ref={tagRef} className={cn("hiw-tag", s.lifted && "is-lifted")}>
                        <Clock size={13} /> Opening hours
                      </span>
                      <span className="hiw-row-sub">Example Motors</span>
                    </div>
                  </div>
                  <span ref={statusRef}>
                    <Swap on={s.status} end>
                      <Chip tone="action">Needs reply</Chip>
                      <Chip tone="neutral">In progress</Chip>
                      <Chip tone="done">Done</Chip>
                    </Swap>
                  </span>
                </div>
                <div className="hiw-row">
                  <div className="min-w-0 flex-1">
                    <div className="hiw-row-title">Swap the hero photo</div>
                    <div className="hiw-row-sub">Example Motors, yesterday</div>
                  </div>
                  <Chip tone="done">Done</Chip>
                </div>
              </div>
              <FakeCursor innerRef={cursorRef} down={s.press} />
            </div>
          }
          right={
            <div className="hiw-card hiw-card-split">
              <div className="hiw-card-head">
                <div>
                  <div className="hiw-card-kicker">Customer view</div>
                  <div className="hiw-card-title">Example Motors</div>
                </div>
                <span className="hiw-card-sub">Opening hours</span>
              </div>
              <div className="hiw-hours">
                {HOURS.map((h) => (
                  <div key={h.day} className="hiw-hours-row">
                    <span>{h.day}</span>
                    <span>{h.time}</span>
                  </div>
                ))}
                <div ref={sunRef} className="hiw-hours-row is-sun">
                  <span ref={pulseRef} className="hiw-pulse" aria-hidden />
                  <span>Sun</span>
                  <Swap on={s.sun ? 1 : 0} end>
                    <span className="text-[var(--shell-text-faint)]">Closed</span>
                    <span>11:00 to 16:00</span>
                  </Swap>
                </div>
              </div>
            </div>
          }
        />
      </div>
    </StepTrack>
  );
}
