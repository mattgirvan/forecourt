import { useRef, useState } from "react";
import { Check, MessageSquare, Plus, Send } from "lucide-react";
import { Chip, FakeCursor, SceneA, StepCopy, StepTrack, Swap, ease, lerp, placeCursor, pointIn, same, seg, useStepProgress } from "./kit";
import { cn } from "@/lib/utils";

const SUBJECT = "Logo looks blurry on phones";

export function StepTickets() {
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLSpanElement>(null);
  const sendRef = useRef<HTMLSpanElement>(null);
  const [s, setS] = useState({ compose: false, typed: 0, sent: false, reply: false, resolved: false, press: false });

  const trackRef = useStepProgress<HTMLElement>((p) => {
    const next = {
      compose: p >= 0.17,
      typed: Math.round(seg(p, 0.2, 0.4) * SUBJECT.length),
      sent: p >= 0.54,
      reply: p >= 0.68,
      resolved: p >= 0.8,
      press: (p >= 0.14 && p < 0.18) || (p >= 0.51 && p < 0.55),
    };
    setS((prev) => (same(prev, next) ? prev : next));

    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const from = { x: box.width * 0.9, y: box.height * 0.98 };
    const btn = pointIn(box, newRef.current);
    const send = pointIn(box, sendRef.current);
    let a = from;
    let b = btn;
    let t = ease(seg(p, 0.05, 0.13));
    if (p >= 0.42) {
      a = btn;
      b = send;
      t = ease(seg(p, 0.42, 0.5));
    }
    placeCursor(cursorRef.current, lerp(a.x, b.x, t), lerp(a.y, b.y, t), seg(p, 0.03, 0.08) * (1 - seg(p, 0.6, 0.67)));
  });

  return (
    <StepTrack n={4} kind="a" trackRef={trackRef}>
      <SceneA copy={<StepCopy n={4} title="A ticket, not a phone tag." line="Ask us anything from your account. The reply and the status sit in one place." />}>
        <div ref={stageRef} className="hiw-card hiw-card-tickets">
          <div className="hiw-card-head">
            <div>
              <div className="hiw-card-title">Tickets</div>
              <div className="hiw-card-sub">Example Motors</div>
            </div>
            <span ref={newRef} className="hiw-btn" data-tone="action">
              <Plus size={15} /> New ticket
            </span>
          </div>

          <div className={cn("hiw-in hiw-compose", s.compose && "is-in")}>
            <div className="hiw-field-label">Subject</div>
            <div className="hiw-field">
              <span>{SUBJECT.slice(0, s.typed)}</span>
              {s.compose && !s.sent && <span className="hiw-caret" aria-hidden />}
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[13px] text-[var(--shell-text-faint)]">
                Category <Chip tone="neutral">Question</Chip>
              </div>
              <span ref={sendRef} className="hiw-swap-btn">
                <Swap on={s.sent ? 1 : 0} end>
                  <span className="hiw-btn" data-tone="action">
                    <Send size={14} /> Send
                  </span>
                  <span className="hiw-btn" data-tone="quiet">
                    <Check size={14} /> Sent
                  </span>
                </Swap>
              </span>
            </div>
          </div>

          <div className={cn("hiw-in hiw-ticket", s.sent && "is-in")}>
            <div className="hiw-row">
              <MessageSquare size={17} className="shrink-0 text-[var(--shell-text-dim)]" />
              <div className="min-w-0 flex-1">
                <div className="hiw-row-title truncate">{SUBJECT}</div>
                <div className="hiw-row-sub">Question, opened just now</div>
              </div>
              <Swap on={s.resolved ? 1 : 0} end>
                <Chip tone="neutral">Sent</Chip>
                <Chip tone="done">Resolved</Chip>
              </Swap>
            </div>
            <div className="hiw-staff-strip">
              <span>Forecourt staff see</span>
              <Swap on={s.resolved ? 1 : 0} end>
                <Chip tone="action">Needs reply</Chip>
                <Chip tone="done">Resolved</Chip>
              </Swap>
            </div>
          </div>

          <div className={cn("hiw-in hiw-bubble", s.reply && "is-in")}>
            <div className="hiw-bubble-from">Forecourt</div>
            Sorted. We swapped in a sharper logo for small screens.
          </div>

          <FakeCursor innerRef={cursorRef} down={s.press} />
        </div>
      </SceneA>
    </StepTrack>
  );
}
