import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PillOption<T extends string> = { id: T; label: ReactNode; count?: number | null; countTone?: "neutral" | "action"; disabled?: boolean };

type Common<T extends string> = {
  label: string;
  options: readonly PillOption<T>[];
  className?: string;
  size?: "md" | "sm";
  testId?: string;
};
type Single<T extends string> = Common<T> & {
  /** tabs: switches a view. radio: picks one value. Arrow keys move the selection. */
  kind?: "tabs" | "radio";
  value: T;
  onChange: (id: T) => void;
};
type Multi<T extends string> = Common<T> & {
  /** toggle: each pill turns on or off. Arrow keys move focus, Space or Enter toggles. */
  kind: "toggle";
  isOn: (id: T) => boolean;
  onToggle: (id: T) => void;
};

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * One line of pills. Never wraps: swipe or scroll sideways, hidden scrollbar,
 * edge fade on whichever side has more, and the selected pill kept in view.
 */
export function PillRow<T extends string>(props: Single<T> | Multi<T>) {
  const { label, options, className, size = "md", testId } = props;
  const kind = props.kind ?? "tabs";
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const selected = (id: T) => (props.kind === "toggle" ? props.isOn(id) : props.value === id);
  const current = props.kind === "toggle" ? null : props.value;
  const [focusId, setFocusId] = useState<T | null>(null);
  // White pill that slides to the selected option (tabs and radio only).
  const [glide, setGlide] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [glideReady, setGlideReady] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const start = el.scrollLeft > 1;
    const end = max - el.scrollLeft > 1;
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
    if (current == null) return;
    const pill = el.querySelector<HTMLElement>(`[data-pill="${CSS.escape(current)}"]`);
    if (!pill) return setGlide(null);
    const g = { x: pill.offsetLeft, y: pill.offsetTop, w: pill.offsetWidth, h: pill.offsetHeight };
    setGlide((o) => (o && o.x === g.x && o.y === g.y && o.w === g.w && o.h === g.h ? o : g));
  }, [current]);

  useEffect(() => {
    if (!glide || glideReady) return;
    // Place it first without motion, then let later moves slide.
    const id = requestAnimationFrame(() => setGlideReady(true));
    return () => cancelAnimationFrame(id);
  }, [glide, glideReady]);

  useLayoutEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, options.length, current]);

  const reveal = useCallback((id: T, smooth: boolean) => {
    const el = ref.current;
    const pill = el?.querySelector<HTMLElement>(`[data-pill="${CSS.escape(id)}"]`);
    if (!el || !pill) return;
    const pad = 24;
    const left = pill.offsetLeft;
    const right = left + pill.offsetWidth;
    let to = el.scrollLeft;
    if (left - pad < el.scrollLeft) to = left - pad;
    else if (right + pad > el.scrollLeft + el.clientWidth) to = right + pad - el.clientWidth;
    if (to !== el.scrollLeft) el.scrollTo({ left: Math.max(0, to), behavior: smooth && !reduced() ? "smooth" : "auto" });
  }, []);

  const first = useRef(true);
  useEffect(() => {
    if (current == null) return;
    reveal(current, !first.current);
    first.current = false;
  }, [current, reveal]);

  const enabled = options.filter((o) => !o.disabled);
  const tabStop: T | undefined =
    (focusId && enabled.some((o) => o.id === focusId) ? focusId : undefined) ??
    (current != null && enabled.some((o) => o.id === current) ? current : undefined) ??
    enabled[0]?.id;

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key) || !enabled.length) return;
    e.preventDefault();
    const from = enabled.findIndex((o) => o.id === (focusId ?? tabStop));
    let i = from < 0 ? 0 : from;
    if (e.key === "ArrowRight") i = (i + 1) % enabled.length;
    if (e.key === "ArrowLeft") i = (i - 1 + enabled.length) % enabled.length;
    if (e.key === "Home") i = 0;
    if (e.key === "End") i = enabled.length - 1;
    const next = enabled[i].id;
    setFocusId(next);
    ref.current?.querySelector<HTMLElement>(`[data-pill="${CSS.escape(next)}"]`)?.focus({ preventScroll: true });
    reveal(next, true);
    if (props.kind !== "toggle") props.onChange(next);
  }

  const role = kind === "tabs" ? "tablist" : kind === "radio" ? "radiogroup" : "group";
  return (
    <div
      ref={ref}
      role={role}
      aria-label={label}
      data-testid={testId}
      onScroll={measure}
      onKeyDown={onKey}
      className={cn("fc-pills", glide && "has-glide", size === "sm" && "is-sm", edges.start && "fade-start", edges.end && "fade-end", className)}
    >
      {glide ? (
        <span
          aria-hidden
          className={cn("fc-pill-glide", glideReady && "is-ready")}
          style={{ width: glide.w, height: glide.h, top: glide.y, left: 0, transform: `translate3d(${glide.x}px, 0, 0)` }}
        />
      ) : null}
      {options.map((o) => {
        const on = selected(o.id);
        const a11y =
          kind === "tabs" ? { role: "tab", "aria-selected": on } : kind === "radio" ? { role: "radio", "aria-checked": on } : { "aria-pressed": on };
        return (
          <button
            key={o.id}
            type="button"
            data-pill={o.id}
            {...a11y}
            tabIndex={o.id === tabStop ? 0 : -1}
            disabled={o.disabled}
            className={cn("fc-pill", on && "is-on")}
            onFocus={() => setFocusId(o.id)}
            onClick={() => {
              setFocusId(o.id);
              if (props.kind === "toggle") props.onToggle(o.id);
              else props.onChange(o.id);
            }}
          >
            {o.label}
            {o.count != null ? <span className={cn("fc-pill-count", o.countTone === "action" && "is-action")}>{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
