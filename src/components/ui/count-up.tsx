import { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const seen = new Set<string>();

/**
 * A number that counts up from 0 the first time it scrolls into view (700ms,
 * ease out). Later renders and reduced motion show the final value at once.
 * `id` keeps it to once per session, so tab switches do not replay it.
 */
export function CountUp({ value, format = (n) => String(Math.round(n)), id, duration = 700 }: { value: number; format?: (n: number) => string; id?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const skip = Boolean(id && seen.has(id));
  const [n, setN] = useState(skip ? value : 0);
  const done = useRef(skip);

  useEffect(() => {
    // Data often arrives after mount: wait for a real number before counting.
    if (!done.current && value <= 0) {
      setN(value);
      return;
    }
    if (done.current || reduced() || typeof IntersectionObserver === "undefined") {
      done.current = true;
      setN(value);
      return;
    }
    const el = ref.current;
    let raf = 0;
    const run = () => {
      const t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / duration);
        setN(value * (1 - Math.pow(1 - k, 3)));
        if (k < 1) raf = requestAnimationFrame(tick);
        else {
          done.current = true;
          if (id) seen.add(id);
        }
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        run();
      }
    });
    if (el) io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration, id]);

  return (
    <span ref={ref} className="tabular-nums" aria-label={format(value)}>
      <span aria-hidden>{format(n)}</span>
    </span>
  );
}
