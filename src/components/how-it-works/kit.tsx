import { useEffect, useRef, type ReactNode } from "react";
import { clamp01 } from "@/components/home-scroll-scenes";
import { cn } from "@/lib/utils";

export { FakeCursor, placeCursor, pointIn, seg, ease, lerp, clamp01 } from "@/components/home-scroll-scenes";

/*
 * Shared kit for the How it works steps.
 *
 * Every step is a track with a stage inside. On desktop (1024px and up) the track is
 * tall and the stage is position: sticky, so scroll progress through the track (0 to 1)
 * drives the beats. A single rAF-throttled scroll handler writes that progress into
 * --p on the track and hands it to the step. Below 1024px there is no pin and no
 * scrub: the same beats play once by time when the stage comes into view. Reduced
 * motion jumps straight to the end state.
 */

export const DESKTOP_MQ = "(min-width: 1024px)";
export const REDUCED_MQ = "(prefers-reduced-motion: reduce)";
export const TOTAL_STEPS = 6;

export function useStepProgress<T extends HTMLElement>(onFrame: (p: number) => void, playMs = 4200) {
  const ref = useRef<T>(null);
  const frame = useRef(onFrame);
  frame.current = onFrame;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const desk = window.matchMedia(DESKTOP_MQ);
    const reduced = window.matchMedia(REDUCED_MQ);
    let raf = 0;
    let last = -1;
    let cleanup = () => {};

    const emit = (p: number) => {
      if (Math.abs(p - last) < 0.0005) return;
      last = p;
      el.style.setProperty("--p", p.toFixed(4));
      frame.current(p);
    };

    const setup = () => {
      cleanup();
      last = -1;
      if (reduced.matches) {
        emit(1);
        cleanup = () => {};
        return;
      }
      if (desk.matches) {
        let near = false;
        const measure = () => {
          raf = 0;
          const r = el.getBoundingClientRect();
          const span = r.height - window.innerHeight;
          emit(span > 1 ? clamp01(-r.top / span) : 1);
        };
        const schedule = () => {
          if (near && !raf) raf = requestAnimationFrame(measure);
        };
        const io = new IntersectionObserver(
          ([entry]) => {
            near = Boolean(entry?.isIntersecting);
            schedule();
          },
          { rootMargin: "25% 0px" },
        );
        io.observe(el);
        window.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", schedule, { passive: true });
        measure();
        cleanup = () => {
          io.disconnect();
          window.removeEventListener("scroll", schedule);
          window.removeEventListener("resize", schedule);
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
        };
        return;
      }
      // Phones and tablets: play once on view, by time.
      emit(0);
      let start = 0;
      let played = false;
      const tick = (t: number) => {
        if (!start) start = t;
        const p = clamp01((t - start) / playMs);
        emit(p);
        raf = p < 1 ? requestAnimationFrame(tick) : 0;
      };
      const io = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting && !played) {
            played = true;
            io.disconnect();
            raf = requestAnimationFrame(tick);
          }
        },
        { threshold: 0.4 },
      );
      io.observe(el);
      cleanup = () => {
        io.disconnect();
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      };
    };

    setup();
    desk.addEventListener("change", setup);
    reduced.addEventListener("change", setup);
    return () => {
      cleanup();
      desk.removeEventListener("change", setup);
      reduced.removeEventListener("change", setup);
    };
  }, [playMs]);

  return ref;
}

/** Update React state only when a discrete beat value really changes. */
export function same<T extends Record<string, unknown>>(a: T, b: T) {
  for (const k in a) if (a[k] !== b[k]) return false;
  return true;
}

export function StepTrack({
  n,
  kind,
  trackRef,
  children,
}: {
  n: number;
  kind: "a" | "b" | "c";
  trackRef?: React.Ref<HTMLElement>;
  children: ReactNode;
}) {
  return (
    <section ref={trackRef} id={`step-${n}`} data-step={n} className="hiw-track" data-kind={kind} aria-labelledby={`step-${n}-title`}>
      <div className="hiw-stage">{children}</div>
    </section>
  );
}

export function StepCopy({ n, title, line, center }: { n: number; title: string; line: string; center?: boolean }) {
  return (
    <div className={cn("hiw-copy", center && "is-center")}>
      <p className="hiw-eyebrow">
        Step {n} of {TOTAL_STEPS}
      </p>
      <h2 id={`step-${n}-title`} className="hiw-h2">
        {title}
      </h2>
      <p className="hiw-line">{line}</p>
    </div>
  );
}

/** Copy on the left, card on the right on desktop; stacked below 1024px. */
export function SceneA({ copy, children }: { copy: ReactNode; children: ReactNode }) {
  return (
    <div className="hiw-a">
      {copy}
      <div className="hiw-a-card">{children}</div>
    </div>
  );
}

export type Tone = "action" | "done" | "neutral" | "idle";

export function Chip({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("hiw-chip", className)} data-tone={tone}>
      {children}
    </span>
  );
}

/** Stacks its children in one grid cell; only the `on` index is visible. Space is the widest child. */
export function Swap({ on, children, end }: { on: number; children: ReactNode[]; end?: boolean }) {
  return (
    <span className={cn("hiw-swap", end && "is-end")}>
      {children.map((c, i) => (
        <span key={i} className={cn(i === on && "is-on")} aria-hidden={i === on ? undefined : true}>
          {c}
        </span>
      ))}
    </span>
  );
}
