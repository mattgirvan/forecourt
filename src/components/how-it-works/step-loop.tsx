import { useRef, useState } from "react";
import { Mail } from "lucide-react";
import { FakeCursor, SceneA, StepCopy, StepTrack, Swap, ease, lerp, placeCursor, pointIn, same, seg, useStepProgress } from "./kit";
import { cn } from "@/lib/utils";

const STAGES = ["Setup", "Preview", "Testing", "Live"] as const;
type NodeState = "done" | "current" | "idle";

export function StepLoop() {
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLDivElement>(null);
  const moverRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const [s, setS] = useState({ email: false, opened: false, press: false });

  const trackRef = useStepProgress<HTMLElement>((p) => {
    const next = { email: p >= 0.36, opened: p >= 0.58, press: p >= 0.55 && p < 0.6 };
    setS((prev) => (same(prev, next) ? prev : next));

    // Marker: Setup to Preview, then Preview to Testing once the email is opened.
    const m = ease(seg(p, 0.12, 0.3)) + ease(seg(p, 0.6, 0.72));
    if (moverRef.current) moverRef.current.style.transform = `translateX(${(m * 33.3333).toFixed(3)}%)`;
    // Green fill only covers finished stages: Setup to Preview once Preview is signed off.
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${(ease(seg(p, 0.58, 0.66)) / 3).toFixed(4)})`;

    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const from = { x: box.width * 0.9, y: box.height * 0.98 };
    const to = pointIn(box, emailRef.current);
    const t = ease(seg(p, 0.42, 0.53));
    placeCursor(cursorRef.current, lerp(from.x, to.x, t), lerp(from.y, to.y, t), seg(p, 0.4, 0.45) * (1 - seg(p, 0.66, 0.74)));
  });

  const states: NodeState[] = s.opened ? ["done", "done", "current", "idle"] : ["done", "current", "idle", "idle"];

  return (
    <StepTrack n={2} kind="a" trackRef={trackRef}>
      <SceneA copy={<StepCopy n={2} title="You always know where things stand." line="Every stage shows on your account, and we email you the moment something moves." />}>
        <div ref={stageRef} className="hiw-card hiw-card-loop">
          <div ref={emailRef} className={cn("hiw-in hiw-email", s.email && "is-in")} data-from="top">
            <Mail size={18} className="mt-0.5 shrink-0 text-[var(--shell-text-dim)]" />
            <div className="min-w-0">
              <div className="hiw-row-title">Forecourt: Your preview is ready</div>
              <div className="hiw-row-sub">Have a look and tell us anything you want changed.</div>
            </div>
          </div>

          <div className="hiw-card-head mt-3">
            <div>
              <div className="hiw-card-title">Your build</div>
              <div className="hiw-card-sub">Example Motors</div>
            </div>
          </div>

          <div className="hiw-tl" aria-label={`Setup done, Preview ${s.opened ? "done" : "current"}, Testing ${s.opened ? "current" : "to come"}, Live to come`}>
            <div className="hiw-tl-line" aria-hidden>
              <span ref={fillRef} className="hiw-tl-fill" />
              <span ref={moverRef} className="hiw-tl-mover">
                <span className="hiw-tl-halo" />
              </span>
            </div>
            {STAGES.map((st, i) => (
              <div key={st} className="hiw-tl-node">
                <Swap on={states[i] === "done" ? 0 : states[i] === "current" ? 1 : 2}>
                  <span className="hiw-dot" data-state="done" />
                  <span className="hiw-dot" data-state="current" />
                  <span className="hiw-dot" data-state="idle" />
                </Swap>
                <span className={cn("hiw-tl-label", states[i] === "idle" && "is-idle")}>{st}</span>
              </div>
            ))}
          </div>

          <div className="hiw-loop-foot">
            <Swap on={s.opened ? 1 : 0}>
              <span>Preview is with you. Have a look when you can.</span>
              <span>Preview signed off. We are testing it now.</span>
            </Swap>
          </div>

          <FakeCursor innerRef={cursorRef} down={s.press} />
        </div>
      </SceneA>
    </StepTrack>
  );
}
