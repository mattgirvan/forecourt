import type { ReactNode } from "react";
import { clamp01, ease, lerp } from "./kit";

/*
 * Pinned split: Forecourt on the left, the customer view on the right, a faint
 * connector between them and a chip that travels across. Below 1024px the cards
 * stack and the connector runs downwards, so the chip travels down instead.
 * The chip is absolutely placed inside .hiw-split and moved with transform only.
 */

export function PinnedSplit({
  splitRef,
  left,
  right,
  chip,
  chipRef,
  fillRef,
}: {
  splitRef: React.Ref<HTMLDivElement>;
  left: ReactNode;
  right: ReactNode;
  chip: ReactNode;
  chipRef: React.Ref<HTMLDivElement>;
  fillRef: React.Ref<HTMLSpanElement>;
}) {
  return (
    <div ref={splitRef} className="hiw-split">
      <div className="hiw-split-side">{left}</div>
      <div className="hiw-connector" aria-hidden>
        <span className="hiw-connector-line" />
        <span ref={fillRef} className="hiw-connector-fill" />
      </div>
      <div className="hiw-split-side">{right}</div>
      <div ref={chipRef} className="hiw-travel" aria-hidden>
        {chip}
      </div>
    </div>
  );
}

function centreIn(box: DOMRect, el: Element | null) {
  if (!el) return { x: box.width / 2, y: box.height / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
}

/**
 * Place the travelling chip. `t` is 0 at the source and 1 at the target.
 * `lift` (0 to 1) raises it off the source card, `show` is its opacity.
 */
export function placeTravel(
  split: HTMLElement | null,
  chip: HTMLElement | null,
  fill: HTMLElement | null,
  from: Element | null,
  to: Element | null,
  t: number,
  lift: number,
  show: number,
) {
  if (!split || !chip) return;
  const box = split.getBoundingClientRect();
  const a = centreIn(box, from);
  const b = centreIn(box, to);
  const k = ease(clamp01(t));
  const x = lerp(a.x, b.x, k) - chip.offsetWidth / 2;
  // A soft arc so it reads as lifted, not slid.
  const arc = Math.sin(Math.PI * k) * -14;
  const y = lerp(a.y, b.y, k) - chip.offsetHeight / 2 + arc - lift * 4;
  const s = 1 + lift * 0.06 * (1 - k * 0.6);
  chip.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
  chip.style.opacity = show.toFixed(3);
  if (fill) fill.style.setProperty("--fill", k.toFixed(4));
}
