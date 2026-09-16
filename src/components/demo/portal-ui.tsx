import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SlidingPillTrack({
  value,
  children,
  className,
  style,
}: {
  value: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ left: 0, top: 0, width: 0, height: 0, ready: false });

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const measure = () => {
      const activeBtn = track.querySelector(`[data-pill-value="${value}"]`);
      if (!(activeBtn instanceof HTMLElement)) {
        setThumb((prev) => ({ ...prev, width: 0, height: 0, ready: false }));
        return;
      }
      setThumb({
        left: activeBtn.offsetLeft,
        top: activeBtn.offsetTop,
        width: activeBtn.offsetWidth,
        height: activeBtn.offsetHeight,
        ready: true,
      });
    };

    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro) {
      ro.observe(track);
      const activeBtn = track.querySelector(`[data-pill-value="${value}"]`);
      if (activeBtn) ro.observe(activeBtn);
    }
    window.addEventListener("resize", measure);
    track.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      track.removeEventListener("scroll", measure);
    };
  }, [value, children]);

  return (
    <div ref={trackRef} className={className} style={{ position: "relative", ...style }}>
      <div
        className="sliding-pill-thumb shell-glass-float"
        aria-hidden
        style={{
          left: thumb.left,
          top: thumb.top,
          width: thumb.width,
          height: thumb.height,
          opacity: thumb.ready && thumb.width > 0 ? 1 : 0,
        }}
      />
      {children}
    </div>
  );
}

export function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <SlidingPillTrack
      value={value}
      className="shell-glass-inset"
      style={{ display: "inline-flex", borderRadius: 999, padding: 4, gap: 2 }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          data-pill-value={opt.value}
          onClick={() => onChange(opt.value)}
          className="relative z-[1] rounded-full border-0 bg-transparent px-[18px] py-[7px] text-[12.5px] font-semibold transition-colors duration-200"
          style={{ color: value === opt.value ? "var(--shell-accent-ink)" : "var(--shell-text-faint)" }}
        >
          {opt.label}
        </button>
      ))}
    </SlidingPillTrack>
  );
}

export function ChipRow({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <SlidingPillTrack
      value={value}
      style={{ display: "flex", gap: 8, flexWrap: "nowrap", overflowX: "auto" }}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            data-pill-value={opt.value}
            onClick={() => onChange(opt.value)}
            className="relative z-[1] shrink-0 rounded-full border-0 bg-transparent px-3.5 py-2 text-[12.5px] font-semibold"
            style={{ color: active ? "var(--shell-accent-ink)" : "var(--shell-text-dim)" }}
          >
            {opt.label}
          </button>
        );
      })}
    </SlidingPillTrack>
  );
}

export function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="shell-glass-inset relative h-6 w-[42px] shrink-0 rounded-full border-0 p-0"
      style={{
        background: checked ? "color-mix(in srgb, var(--emerald) 55%, transparent)" : "var(--shell-inset-bg)",
      }}
    >
      <span
        className="shell-glass-float absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white"
        style={{ left: checked ? 21 : 3, transition: "left 0.3s cubic-bezier(.2,.8,.3,1.3)" }}
      />
    </button>
  );
}

export function GlassModal({
  open,
  onClose,
  children,
  maxWidth = 480,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    if (!open) return;
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="glass-modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(11,15,20,0.55)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="shell-glass glass-modal-card"
        style={{
          position: "relative",
          width: "100%",
          maxWidth,
          maxHeight: "88vh",
          overflowY: "auto",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <div style={{ position: "relative", zIndex: 2, padding: 22 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function InfoBubble({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onOutside, true);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("click", onOutside, true);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex size-5 items-center justify-center rounded-full border text-[11px] font-bold"
        style={{ borderColor: "var(--shell-glass-border)", background: "var(--shell-glass-bg)", color: "var(--shell-text-dim)" }}
      >
        i
      </button>
      <div
        className="shell-glass absolute top-[calc(100%+8px)] left-0 z-80 w-[220px] rounded-[16px] px-3 py-2.5 text-xs leading-relaxed"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0) scale(1)" : "translateY(-6px) scale(0.94)",
          pointerEvents: open ? "auto" : "none",
          transformOrigin: "top left",
          transition: "opacity .18s ease, transform .18s cubic-bezier(.2,.8,.3,1.4)",
          color: "var(--shell-text)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

export function SectionHeader({
  icon: Icon,
  tint,
  title,
  subtitle,
  right,
}: {
  icon: LucideIcon;
  tint: { bg: string; fg: string };
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <div
          className="flex size-[30px] shrink-0 items-center justify-center rounded-[13px]"
          style={{ background: tint.bg, color: tint.fg }}
        >
          <Icon size={15} />
        </div>
        <div>
          <div className="text-[13px] font-semibold text-white">{title}</div>
          {subtitle && <div className="mt-px text-[11.5px] text-white/75">{subtitle}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold tracking-wide text-[var(--shell-text-faint)] uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}

export function portalInputClass(className?: string) {
  return cn(
    "h-10 w-full rounded-[10px] border px-3 text-[13px] text-white outline-none",
    className,
  );
}

export const portalInputStyle: CSSProperties = {
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.16)",
  color: "#fff",
};
