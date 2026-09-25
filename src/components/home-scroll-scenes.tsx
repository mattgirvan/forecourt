import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Anchor,
  Calendar,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Key,
  Mail,
  MessageSquare,
  PartyPopper,
  Plus,
  Ship,
  Sparkles,
  Truck,
  UserPlus,
  type LucideProps,
} from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Homepage feature scenes. Each scene is a tall track with a sticky stage; scroll
 * progress (0 to 1) through the track drives the graphic. One passive scroll
 * listener per scene, throttled to requestAnimationFrame, only while the scene
 * is near the viewport. Reduced motion jumps straight to the end state.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function useScrollScene<T extends HTMLElement>(onFrame: (p: number) => void) {
  const ref = useRef<T>(null);
  const frame = useRef(onFrame);
  frame.current = onFrame;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let visible = false;
    let listening = false;

    const measure = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      frame.current(span > 1 ? clamp01(-r.top / span) : 1);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    const onScroll = () => {
      if (visible) schedule();
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        schedule();
      },
      { rootMargin: "25% 0px" },
    );
    const start = () => {
      if (listening) return;
      listening = true;
      io.observe(el);
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
      schedule();
    };
    const stop = () => {
      if (!listening) return;
      listening = false;
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const sync = () => {
      if (mq.matches) {
        stop();
        frame.current(1);
      } else {
        start();
      }
    };
    sync();
    mq.addEventListener("change", sync);
    return () => {
      stop();
      mq.removeEventListener("change", sync);
    };
  }, []);

  return ref;
}

/** Point inside `stage` coordinates, biased into the target so the cursor tip lands on it. */
function pointIn(stage: DOMRect, el: Element | null, fx = 0.6, fy = 0.55) {
  if (!el) return { x: stage.width * 0.9, y: stage.height * 0.9 };
  const r = el.getBoundingClientRect();
  return { x: r.left - stage.left + r.width * fx, y: r.top - stage.top + r.height * fy };
}

function placeCursor(el: HTMLElement | null, x: number, y: number, opacity: number) {
  if (!el) return;
  el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  el.style.opacity = opacity.toFixed(3);
}

function FakeCursor({ innerRef, down }: { innerRef: React.Ref<HTMLDivElement>; down: boolean }) {
  return (
    <div ref={innerRef} className="scene-cursor" data-down={down ? "1" : "0"} aria-hidden>
      <span className="scene-cursor-ring" />
      <svg width="22" height="22" viewBox="0 0 22 22" className="scene-cursor-arrow">
        <path
          d="M2 1.5v16.2l4.3-4 3 6.6 2.7-1.2-3-6.5h6z"
          fill="#fff"
          stroke="#0b0f14"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function SceneCopy({
  eyebrow,
  title,
  line,
  id,
}: {
  eyebrow: string;
  title: string;
  line: string;
  id: string;
}) {
  return (
    <div className="scene-copy">
      <p className="text-[13px] font-medium tracking-wide text-accent">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-[1.9rem] font-semibold leading-[1.08] tracking-tight sm:mt-3 sm:text-5xl">
        {title}
      </h2>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted sm:mt-4 sm:text-base">{line}</p>
    </div>
  );
}

function SceneTrack({
  trackRef,
  id,
  length,
  copy,
  children,
}: {
  trackRef: React.Ref<HTMLElement>;
  id: string;
  length: "long" | "mid";
  copy: ReactNode;
  children: ReactNode;
}) {
  return (
    <section ref={trackRef} id={id} className="scene-track" data-len={length} aria-labelledby={`${id}-title`}>
      <div className="scene-sticky">
        <div className="mx-auto grid w-full max-w-5xl items-center gap-5 px-4 sm:gap-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          {copy}
          <div className="relative flex min-w-0 justify-center lg:justify-end">{children}</div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 1: team and roles                                             */
/* ------------------------------------------------------------------ */

const TEAM = [
  { name: "Callum Reid", note: "On the desk", role: "Management" },
  { name: "Aisha Khan", note: "Out on a test drive", role: "Sales" },
  { name: "Ross McLean", note: "Hit target again", role: "Sales", target: true },
  { name: "Megan Doyle", note: "Owns the kettle", role: "Admin" },
  { name: "Tom Fairbairn", note: "Under a Kodiaq", role: "Workshop" },
] as const;

const ROLE_OPTIONS = ["Sales", "Management", "Admin", "Workshop"] as const;

const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

function TeamScene() {
  // 0 moving, 1 pressed, 2 menu open, 3 hovering Management, 4 picked
  const [stage, setStage] = useState(4);
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const optionRef = useRef<HTMLDivElement>(null);

  const trackRef = useScrollScene<HTMLElement>((p) => {
    const next = p < 0.3 ? 0 : p < 0.36 ? 1 : p < 0.5 ? 2 : p < 0.6 ? 3 : 4;
    setStage(next);
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const from = { x: box.width * 0.88, y: box.height * 0.96 };
    const pill = pointIn(box, pillRef.current, 0.62, 0.6);
    const opt = pointIn(box, optionRef.current, 0.42, 0.6);
    const rest = { x: pill.x + 26, y: pill.y + 34 };
    let x: number;
    let y: number;
    if (p < 0.36) {
      const t = ease(seg(p, 0.05, 0.29));
      x = lerp(from.x, pill.x, t);
      y = lerp(from.y, pill.y, t);
    } else if (p < 0.6) {
      const t = ease(seg(p, 0.38, 0.49));
      x = lerp(pill.x, opt.x, t);
      y = lerp(pill.y, opt.y, t);
    } else {
      const t = ease(seg(p, 0.64, 0.78));
      x = lerp(opt.x, rest.x, t);
      y = lerp(opt.y, rest.y, t);
    }
    placeCursor(cursorRef.current, x, y, seg(p, 0.01, 0.07));
  });

  const open = stage === 2 || stage === 3;
  const picked = stage === 4;

  return (
    <SceneTrack
      trackRef={trackRef}
      id="scene-team"
      length="long"
      copy={
        <SceneCopy
          id="scene-team-title"
          eyebrow="Team"
          title="Manage your team and assign roles"
          line="Add your people and decide who sees what. A promotion takes one click, not a meeting."
        />
      }
    >
      <div
        ref={stageRef}
        className="desk-shell scene-card relative w-full max-w-[520px]"
        role="img"
        aria-label="Team list. Ross McLean's role is changed from Sales to Management."
      >
        <div aria-hidden>
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5">
            <div>
              <div className="text-[15px] font-semibold">Team</div>
              <div className="font-mono text-[11px] text-[var(--shell-text-faint)]">5 people · Northbridge Motors</div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] font-semibold text-[var(--shell-text-dim)]">
              <UserPlus size={13} /> Invite
            </span>
          </div>
          <div className="grid grid-cols-[1fr_auto] px-4 pt-3 pb-1 text-[10px] font-semibold tracking-[0.12em] text-[var(--shell-text-faint)] uppercase sm:px-5">
            <span>Name</span>
            <span className="w-[124px] sm:w-[140px]">Role</span>
          </div>
          <ul className="px-2 pb-3 sm:px-3">
            {TEAM.map((m) => {
              const isTarget = "target" in m && m.target;
              const role = isTarget ? (picked ? "Management" : "Sales") : m.role;
              return (
                <li
                  key={m.name}
                  className={cn(
                    "relative grid grid-cols-[1fr_auto] items-center gap-3 rounded-[14px] px-2 py-2.5 sm:px-2.5",
                    isTarget && "scene-team-target",
                    isTarget && picked && "is-picked",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-[var(--shell-text-dim)]">
                      {initialsOf(m.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-medium">{m.name}</div>
                      <div className="truncate text-[11.5px] text-[var(--shell-text-faint)]">{m.note}</div>
                    </div>
                  </div>
                  <div className="relative w-[124px] sm:w-[140px]">
                    <span
                      ref={isTarget ? pillRef : undefined}
                      className={cn(
                        "scene-select",
                        role === "Management" && "is-mgmt",
                        isTarget && stage === 1 && "is-pressed",
                        isTarget && open && "is-open",
                      )}
                    >
                      <span className="truncate">{role}</span>
                      <ChevronDown size={13} className="shrink-0 opacity-70" />
                    </span>
                    {isTarget && (
                      <div className={cn("scene-menu", open && "is-open")}>
                        {ROLE_OPTIONS.map((opt) => (
                          <div
                            key={opt}
                            ref={opt === "Management" ? optionRef : undefined}
                            className={cn(
                              "scene-menu-item",
                              opt === "Sales" && stage === 2 && "is-current",
                              opt === "Management" && stage === 3 && "is-hover",
                            )}
                          >
                            {opt}
                            {opt === "Sales" && stage === 2 ? <Check size={12} /> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <FakeCursor innerRef={cursorRef} down={stage === 1} />
      </div>
    </SceneTrack>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 2: stock location                                             */
/* ------------------------------------------------------------------ */

type Loc = "Bodyshop" | "Workshop" | "Prep Carpark" | "Forecourt 1st Row" | "Showroom" | "Not set";

const LOC_STYLE: Record<Loc, { bg: string; fg: string }> = {
  Bodyshop: { bg: "rgba(155,111,196,0.26)", fg: "#e2d4f2" },
  Workshop: { bg: "rgba(91,142,200,0.28)", fg: "#c9dcf0" },
  "Prep Carpark": { bg: "rgba(34,211,238,0.18)", fg: "#7ee8f6" },
  "Forecourt 1st Row": { bg: "rgba(251,146,60,0.22)", fg: "#fdab6c" },
  Showroom: { bg: "rgba(75,168,46,0.28)", fg: "#a8ec8c" },
  "Not set": { bg: "rgba(250,204,21,0.2)", fg: "#fde047" },
};

const MENU_LOCS: Loc[] = ["Bodyshop", "Workshop", "Prep Carpark", "Forecourt 1st Row", "Showroom"];

const STOCK: { model: string; trim: string; reg: string; loc: Loc; keys: string; fan: number }[] = [
  { model: "Octavia Estate", trim: "SE L", reg: "SV74 KDX", loc: "Showroom", keys: "Box 4", fan: -13 },
  { model: "Kodiaq", trim: "Sportline", reg: "SK24 OYH", loc: "Bodyshop", keys: "Box 9", fan: -10 },
  { model: "Enyaq", trim: "85 Edition", reg: "SY25 FWN", loc: "Workshop", keys: "Box 11", fan: -7 },
  { model: "Elroq", trim: "60 SE", reg: "SV75 UJR", loc: "Not set", keys: "Box 2", fan: -5 },
  { model: "Fabia", trim: "Colour Edition", reg: "SA73 PLE", loc: "Prep Carpark", keys: "Prep", fan: -3 },
  { model: "Karoq", trim: "SE Drive", reg: "SJ24 NRV", loc: "Forecourt 1st Row", keys: "Box 7", fan: -2 },
];

function LocPill({ loc, className, innerRef }: { loc: Loc; className?: string; innerRef?: React.Ref<HTMLSpanElement> }) {
  const s = LOC_STYLE[loc];
  return (
    <span ref={innerRef} className={cn("scene-loc", className)} style={{ background: s.bg, color: s.fg }}>
      <span className="scene-loc-dot" />
      <span className="truncate">{loc}</span>
    </span>
  );
}

function StockScene() {
  // 0 dealing rows, 1 cursor travelling, 2 pressed, 3 menu open, 4 hovering Showroom, 5 set
  const [stage, setStage] = useState(5);
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const optionRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);

  const trackRef = useScrollScene<HTMLElement>((p) => {
    rowRefs.current.forEach((row, i) => {
      if (!row) return;
      const a = 0.02 + i * 0.045;
      row.style.setProperty("--t", ease(seg(p, a, a + 0.12)).toFixed(4));
    });
    const next = p < 0.36 ? 0 : p < 0.5 ? 1 : p < 0.54 ? 2 : p < 0.62 ? 3 : p < 0.68 ? 4 : 5;
    setStage(next);
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const from = { x: box.width * 0.9, y: box.height * 0.98 };
    const pill = pointIn(box, pillRef.current, 0.55, 0.6);
    const opt = pointIn(box, optionRef.current, 0.4, 0.6);
    const rest = { x: pill.x + 30, y: pill.y + 36 };
    let x: number;
    let y: number;
    if (p < 0.54) {
      const t = ease(seg(p, 0.36, 0.49));
      x = lerp(from.x, pill.x, t);
      y = lerp(from.y, pill.y, t);
    } else if (p < 0.68) {
      const t = ease(seg(p, 0.55, 0.61));
      x = lerp(pill.x, opt.x, t);
      y = lerp(pill.y, opt.y, t);
    } else {
      const t = ease(seg(p, 0.7, 0.8));
      x = lerp(opt.x, rest.x, t);
      y = lerp(opt.y, rest.y, t);
    }
    placeCursor(cursorRef.current, x, y, seg(p, 0.33, 0.39));
  });

  const open = stage === 3 || stage === 4;
  const set = stage === 5;

  return (
    <SceneTrack
      trackRef={trackRef}
      id="scene-stock"
      length="long"
      copy={
        <SceneCopy
          id="scene-stock-title"
          eyebrow="Stock"
          title="Easily manage stock location and progress"
          line="Every car, where it is, and where the keys went. Fewer laps of the car park."
        />
      }
    >
      <div
        ref={stageRef}
        className="desk-shell scene-card relative w-full max-w-[540px]"
        role="img"
        aria-label="Stock list with a location and keys pill per car. The Elroq's location changes from Not set to Showroom."
      >
        <div aria-hidden>
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5">
            <div>
              <div className="text-[15px] font-semibold">Stock</div>
              <div className="font-mono text-[11px] text-[var(--shell-text-faint)]">{set ? "6 cars · all placed" : "6 cars · 1 without a home"}</div>
            </div>
            <span className="rounded-full bg-white/5 px-3 py-1.5 font-mono text-[11px] text-[var(--shell-text-dim)]">
              Newest first
            </span>
          </div>
          <ul className="scene-stock-list px-3 pt-1 pb-2 sm:px-4">
            {STOCK.map((car, i) => {
              const isTarget = car.loc === "Not set";
              const loc: Loc = isTarget && set ? "Showroom" : car.loc;
              return (
                <li
                  key={car.reg}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  className={cn("scene-row", isTarget && "scene-stock-target", isTarget && set && "is-set")}
                  style={{ ["--fan" as string]: `${car.fan}deg` }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium">
                      {car.model} <span className="text-[var(--shell-text-dim)] font-normal">{car.trim}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-[var(--shell-text-faint)]">{car.reg}</div>
                  </div>
                  <div className="relative flex shrink-0 items-center gap-1.5">
                    <LocPill
                      loc={loc}
                      innerRef={isTarget ? pillRef : undefined}
                      className={cn(isTarget && stage === 2 && "is-pressed", isTarget && open && "is-open")}
                    />
                    <span className="scene-keys">
                      <Key size={11} /> <span className="truncate">{car.keys}</span>
                    </span>
                    {isTarget && (
                      <div className={cn("scene-menu scene-menu-loc", open && "is-open")}>
                        {MENU_LOCS.map((l) => (
                          <div
                            key={l}
                            ref={l === "Showroom" ? optionRef : undefined}
                            className={cn("scene-menu-item", l === "Showroom" && stage === 4 && "is-hover")}
                          >
                            <span className="scene-loc-dot" style={{ color: LOC_STYLE[l].fg }} />
                            {l}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <FakeCursor innerRef={cursorRef} down={stage === 2} />
      </div>
    </SceneTrack>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 3: customer view                                              */
/* ------------------------------------------------------------------ */

const LOCATOR_LABEL = ["At International Port", "On Boat to UK", "UK Port"] as const;

/** Portal UnionJackIcon (App.jsx), same strokes. */
function UnionJackIcon({ size = 14 }: LucideProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="5" x2="22" y2="19" />
      <line x1="22" y1="5" x2="2" y2="19" />
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="2" y1="12" x2="22" y2="12" />
    </svg>
  );
}

/** Portal LOCATOR_ICON_MAP for the three sea legs. */
const STOP_ICONS = [Anchor, Ship, UnionJackIcon] as const;

/**
 * Portal Car Locator rail, three stops. Same pieces as CarLocatorTrack
 * (stage-disc with the stop icon when upcoming, a tick when done, arrived-pill for
 * the current stop, rail-label is-arrived). The current column sizes to its pill
 * like the portal, but widths are set in px so columns and the pill glide.
 */
function GlideRail({ index }: { index: number }) {
  const railRef = useRef<HTMLDivElement>(null);
  const measureRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [layout, setLayout] = useState<{ w: number; pills: number[] } | null>(null);

  useIsoLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const read = () => {
      const w = rail.clientWidth;
      const pills = measureRefs.current.map((el) => (el ? el.offsetWidth : 0));
      if (w > 0 && pills.every((n) => n > 0)) setLayout({ w, pills });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(rail);
    // Webfont swap changes pill widths.
    document.fonts?.ready.then(read).catch(() => {});
    return () => ro.disconnect();
  }, []);

  let basis: string[];
  let centre: string;
  if (layout) {
    const cur = Math.min(layout.pills[index] + 8, layout.w * 0.66);
    const other = (layout.w - cur) / (LOCATOR_LABEL.length - 1);
    basis = LOCATOR_LABEL.map((_, i) => `${(i === index ? cur : other).toFixed(2)}px`);
    centre = `${(other * index + cur / 2).toFixed(2)}px`;
  } else {
    basis = LOCATOR_LABEL.map((_, i) => (i === index ? "50%" : "25%"));
    centre = `${25 * index + 25}%`;
  }
  const PillIcon = STOP_ICONS[index];

  return (
    <div className="rail-scroll scene-rail-scroll">
      <div className="locator-rail scene-rail">
        <div className="locator-nodes" ref={railRef}>
          <div className="locator-track shell-glass-inset scene-rail-track" aria-hidden />
          {LOCATOR_LABEL.map((stop, i) => {
            const done = i < index;
            const current = i === index;
            const Icon = STOP_ICONS[i];
            return (
              <div key={stop} className="locator-node scene-rail-node" style={{ flex: `0 0 ${basis[i]}` }}>
                <div className="rail-mark">
                  {current ? (
                    <span className="scene-rail-slot" />
                  ) : done ? (
                    <span key="done" className="stage-disc scene-disc">
                      <Check size={14} strokeWidth={2.75} />
                    </span>
                  ) : (
                    <span key="todo" className="stage-disc is-faint scene-disc">
                      <Icon size={14} strokeWidth={2.75} />
                    </span>
                  )}
                </div>
                <div className={cn("rail-label", done && "is-done", current && "is-arrived")}>{current ? "\u00a0" : stop}</div>
              </div>
            );
          })}
          <span className="arrived-pill shell-glass-float scene-rail-bubble" style={{ left: centre }}>
            <PillIcon size={13} /> {LOCATOR_LABEL[index]}
          </span>
          {LOCATOR_LABEL.map((stop, i) => {
            const Icon = STOP_ICONS[i];
            return (
              <span
                key={stop}
                ref={(el) => {
                  measureRefs.current[i] = el;
                }}
                className="arrived-pill shell-glass-float scene-rail-measure"
                aria-hidden
              >
                <Icon size={13} /> {stop}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CustomerScene() {
  const [index, setIndex] = useState(2);
  const trackRef = useScrollScene<HTMLElement>((p) => {
    setIndex(p < 0.3 ? 0 : p < 0.62 ? 1 : 2);
  });

  return (
    <SceneTrack
      trackRef={trackRef}
      id="scene-customer"
      length="mid"
      copy={
        <SceneCopy
          id="scene-customer-title"
          eyebrow="Customer view"
          title="Customers automatically stay up to date"
          line="Their order moves when the car does. The phone rings less, and nobody has to ring the port."
        />
      }
    >
      <div
        className="desk-shell scene-card scene-customer-panel relative w-full max-w-[520px]"
        role="img"
        aria-label={`Customer view of a sample order. Car Locator shows ${LOCATOR_LABEL[index]}.`}
        style={{ ["--desk-glow" as string]: "rgba(75,168,46,0.38)" }}
      >
        <div className="scene-panel-glow" aria-hidden>
          <div className="desk-orb opacity-70" />
        </div>
        <div aria-hidden className="relative z-10 px-4 py-3.5 sm:px-5 sm:py-5">
          <div className="scene-compact-hide mb-2.5 text-lg font-medium">Welcome back, Jamie</div>
          <div className="shell-glass customer-header-card scene-compact-pad mb-3 rounded-[24px] p-5 sm:mb-4 sm:p-7">
            <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2">
              <div className="shell-eyebrow font-mono text-xs tracking-widest">ORD-2071 · Finance · New</div>
              <div
                className="rounded-[9px] px-2.5 py-0.5 font-mono text-xs font-bold tracking-widest"
                style={{ background: "var(--shell-accent)", color: "var(--shell-accent-ink)" }}
              >
                SV75 LRQ
              </div>
            </div>
            <div className="mb-1 flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                <Car size={18} color="var(--shell-text-faint)" />
              </span>
              <div className="text-[20px] leading-tight font-medium text-[#F6F5F1]">Elroq 85 Edition</div>
            </div>
            <div className="scene-compact-hide mb-1.5 font-mono text-[11.5px] text-[#7C8F84]">VIN: TMBJR7NY0TF048213</div>
            <div className="scene-compact-hide mb-4 text-sm text-[#9FB0A6]">Timiano Green</div>
            <div
              className="scene-short-hide flex items-center gap-3.5 rounded-[14px] px-4 py-2.5 sm:py-3"
              style={{ background: "rgba(185,139,78,0.14)", border: "1px solid rgba(185,139,78,0.35)" }}
            >
              <Calendar size={22} color="var(--brass)" className="shrink-0" />
              <div>
                <div className="text-[15px] font-semibold">9 Nov to 20 Nov</div>
                <div className="font-mono text-xs" style={{ color: "var(--brass)" }}>
                  Estimated arrival: exact date to follow
                </div>
              </div>
            </div>
          </div>

          <div className="shell-glass rounded-[24px] p-5">
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Truck size={15} className="shrink-0" />
                <div className="text-[13px] font-semibold whitespace-nowrap">Car Locator</div>
                <span key={index} className="scene-locator-label min-w-0 font-mono text-xs font-semibold" style={{ color: "var(--emerald)" }}>
                  {LOCATOR_LABEL[index]}
                </span>
              </div>
              <ChevronRight size={13} color="var(--mist)" className="shrink-0" style={{ transform: "rotate(90deg)" }} />
            </div>
            <div className="mt-4">
              <GlideRail index={index} />
            </div>
          </div>
        </div>
      </div>
    </SceneTrack>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 4: handover nudge                                             */
/* ------------------------------------------------------------------ */

const NUDGE_TASKS = ["ID Verification", "Signed Dealer Documents"] as const;

function NudgeScene() {
  // 0 quiet, 1 banner in, 2 pressed, 3 message sent, 4 customer replied, 5 all done
  const [stage, setStage] = useState(5);
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLSpanElement>(null);
  // Last on-screen CTA point: compact phones hide the button once sent.
  const ctaPoint = useRef<{ x: number; y: number } | null>(null);

  const trackRef = useScrollScene<HTMLElement>((p) => {
    setStage(p < 0.08 ? 0 : p < 0.32 ? 1 : p < 0.37 ? 2 : p < 0.52 ? 3 : p < 0.66 ? 4 : 5);
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const from = { x: box.width * 0.85, y: box.height * 0.98 };
    const ctaVisible = (ctaRef.current?.getBoundingClientRect().width ?? 0) > 0;
    if (ctaVisible) ctaPoint.current = pointIn(box, ctaRef.current, 0.5, 0.6);
    const cta = ctaPoint.current ?? pointIn(box, null);
    const rest = { x: cta.x - 40, y: cta.y + 70 };
    let x: number;
    let y: number;
    if (p < 0.37) {
      const t = ease(seg(p, 0.14, 0.31));
      x = lerp(from.x, cta.x, t);
      y = lerp(from.y, cta.y, t);
    } else {
      const t = ease(seg(p, 0.4, 0.52));
      x = lerp(cta.x, rest.x, t);
      y = lerp(cta.y, rest.y, t);
    }
    placeCursor(cursorRef.current, x, y, seg(p, 0.1, 0.16) * (1 - seg(p, 0.66, 0.74)));
  });

  const bannerIn = stage >= 1;
  const done = stage >= 5;
  const sent = stage >= 3;
  const replied = stage >= 4;

  return (
    <SceneTrack
      trackRef={trackRef}
      id="scene-nudge"
      length="long"
      copy={
        <SceneCopy
          id="scene-nudge-title"
          eyebrow="Nudges"
          title="A nudge before handover goes sideways"
          line="If a customer still has jobs to do the day before, the desk gets a prompt and a one-tap message. No awkward Saturday mornings."
        />
      }
    >
      <div
        ref={stageRef}
        className="desk-shell scene-card relative w-full max-w-[520px]"
        role="img"
        aria-label="Order screen. A banner warns that handover is tomorrow with two tasks outstanding. A message is sent, the customer replies, and both tasks tick off."
      >
        <div aria-hidden className="scene-nudge-body px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold">Priya Shah</div>
              <div className="text-[12px] text-[var(--shell-text-faint)]">
                Enyaq 85 Edition · <span className="whitespace-nowrap">SY25 PSH</span>
              </div>
            </div>
            <span className="scene-chip shrink-0">Handover Sat 10:00</span>
          </div>

          <div className={cn("scene-collapse", bannerIn && "is-open")}>
            <div>
              <div className={cn("dealer-nudge-banner scene-nudge", done && "is-done")}>
                {done ? (
                  <CheckCircle2 size={18} className="shrink-0" color="var(--emerald)" />
                ) : (
                  <AlertTriangle size={18} className="shrink-0" color="#F3B4A8" />
                )}
                <div className="dealer-nudge-banner__body">
                  {done
                    ? "All tasks done. Handover is good to go."
                    : "Handover is in 18 hours and Priya still has 2 outstanding tasks. Worth a nudge."}
                </div>
                {!done && (
                  <span ref={ctaRef} className={cn("dealer-nudge-banner__cta", stage === 2 && "is-pressed", sent && "is-sent")}>
                    Message customer
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="scene-nudge-grid mt-3 grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
            <div className="shell-glass rounded-[16px] p-3.5">
              <div className="scene-tasks-head mb-2.5 flex items-center justify-between text-[12.5px] font-semibold">
                Outstanding tasks
                <span className="font-mono text-[11px]" style={{ color: done ? "var(--emerald)" : "var(--mist)" }}>
                  {done ? "0 left" : "2 left"}
                </span>
              </div>
              <div className="scene-short-hide scene-compact-hide flex flex-col gap-1.5">
                {NUDGE_TASKS.map((t) => (
                  <div key={t} className="shell-glass-row flex items-center gap-2 rounded-[12px] px-2.5 py-2 text-[12.5px]">
                    {done ? (
                      <CheckCircle2 key="y" size={16} color="var(--emerald)" className="scene-pop-in shrink-0" />
                    ) : (
                      <Circle size={16} color="#C6CBC1" className="shrink-0" />
                    )}
                    <span className="truncate">{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="shell-glass rounded-[16px] p-3.5">
              <div className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold">
                <MessageSquare size={13} /> Messages
              </div>
              <div className="scene-msg-list flex min-h-[96px] flex-col justify-end gap-2">
                {!sent && <div className="text-[12px] text-[var(--shell-text-faint)]">Nothing new since Tuesday.</div>}
                {sent && (
                  <div className="scene-bubble is-mine">
                    Hi Priya, quick one before Saturday. Could you upload your ID and sign the documents? It is all in your customer view.
                  </div>
                )}
                {replied && <div className="scene-bubble">Done both. See you at 10!</div>}
              </div>
            </div>
          </div>
        </div>
        <FakeCursor innerRef={cursorRef} down={stage === 2} />
      </div>
    </SceneTrack>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 5: PX V5 chases on the to-do list + daily digest              */
/* ------------------------------------------------------------------ */

const V5_CHASES = [
  { name: "Hannah Wallace", px: "SF17 KLM", car: "Octavia Estate SE L", date: "12 Sep" },
  { name: "Gregor Munro", px: "SN19 XRD", car: "Kodiaq SE Drive", date: "16 Sep" },
  { name: "Leah Robertson", px: "SA66 TWN", car: "Fabia SE", date: "19 Sep" },
] as const;

// Tick order: middle, top, bottom, so the cursor actually travels.
const V5_ORDER = [1, 0, 2] as const;

function ChaseScene() {
  const [ticked, setTicked] = useState(3);
  const [pressed, setPressed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const tickRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const trackRef = useScrollScene<HTMLElement>((p) => {
    const k = p < 0.21 ? 0 : p < 0.39 ? 1 : p < 0.57 ? 2 : 3;
    setTicked(k);
    setPressed((p >= 0.17 && p < 0.21) || (p >= 0.35 && p < 0.39) || (p >= 0.53 && p < 0.57));
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const from = { x: box.width * 0.9, y: box.height * 0.95 };
    const pt = (n: number) => pointIn(box, tickRefs.current[V5_ORDER[n]], 0.55, 0.6);
    const legs: [number, number][] = [
      [0.06, 0.16],
      [0.24, 0.34],
      [0.42, 0.52],
    ];
    let x = from.x;
    let y = from.y;
    let prev = from;
    for (let i = 0; i < legs.length; i++) {
      const [a, b] = legs[i];
      const target = pt(i);
      if (p < a) break;
      const t = ease(seg(p, a, b));
      x = lerp(prev.x, target.x, t);
      y = lerp(prev.y, target.y, t);
      prev = target;
    }
    placeCursor(cursorRef.current, x, y, seg(p, 0.02, 0.07) * (1 - seg(p, 0.62, 0.7)));
  });

  const isTicked = (row: number) => V5_ORDER.indexOf(row as 0 | 1 | 2) < ticked;
  const waiting = 3 - ticked;

  return (
    <SceneTrack
      trackRef={trackRef}
      id="scene-chase"
      length="long"
      copy={
        <SceneCopy
          id="scene-chase-title"
          eyebrow="To-Do and daily digest"
          title="Chases stay put until someone ticks them off"
          line="PX V5s and promises sit on the to-do list and in the 8am digest. Tick it once and it stops asking."
        />
      }
    >
      <div
        ref={stageRef}
        className="relative w-full max-w-[520px]"
        role="img"
        aria-label="To-do list with three PX V5 chases. Each is ticked off in turn and the daily digest count drops to zero."
      >
        <div aria-hidden className="desk-shell scene-card px-4 py-4 sm:px-5">
          <div className="text-[17px] font-medium">To-Do List</div>
          <div className="mt-0.5 text-[12px] text-[var(--mist)]">Outstanding tasks and promises, earliest delivery first.</div>

          <div className="shell-glass mt-3.5 rounded-[18px] px-4 py-3.5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="text-[13px] font-semibold">PX V5s to collect</div>
              {waiting > 0 && <span className="scene-count">{waiting} waiting</span>}
            </div>
            <div className="scene-chase-list flex flex-col">
              {V5_CHASES.map((c, i) => {
                const t = isTicked(i);
                return (
                  <div key={c.px} className={cn("scene-collapse", !t && "is-open")}>
                    <div>
                      <div className="flex items-center gap-2.5 py-1.5">
                        <span
                          ref={(el) => {
                            tickRefs.current[i] = el;
                          }}
                          className="flex shrink-0"
                        >
                          {t ? <CheckCircle2 size={16} color="var(--emerald)" /> : <Circle size={16} color="var(--mist)" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold">{c.name}</div>
                          <div className="text-[11.5px] leading-snug text-[var(--mist)]">
                            Chase PX V5 · PX {c.px} · {c.car}
                          </div>
                        </div>
                        <div className="shrink-0 font-mono text-[11px] text-[var(--mist)]">{c.date}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className={cn("scene-collapse", waiting === 0 && "is-open")}>
                <div>
                  <div className="py-1.5 text-[12.5px] text-[var(--mist)]">No chases set. You're clear.</div>
                </div>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: "var(--emerald)" }}>
                <Plus size={14} /> Add customer
              </div>
            </div>
          </div>
        </div>

        <div aria-hidden className="desk-shell scene-digest">
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            <Mail size={13} /> Daily digest · 8:00am
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3 text-[12px] text-[var(--shell-text-dim)]">
            PX V5s to collect
            <span key={waiting} className={cn("scene-digest-num", waiting === 0 && "is-clear")}>
              {waiting}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[var(--shell-text-faint)]">
            {waiting === 0 ? "Nothing to chase. Put the kettle on." : "Stays here until ticked off."}
          </div>
        </div>
        <FakeCursor innerRef={cursorRef} down={pressed} />
      </div>
    </SceneTrack>
  );
}

/* ------------------------------------------------------------------ */
/* Scene: quote from a brief (portal Quotes, Fill story from brief)    */
/* ------------------------------------------------------------------ */

const QUOTE_BRIEF =
  "Family of four and a spaniel. Wants an SUV, around £350 a month. Likes the Kodiaq Edition X and Karoq Sportline.";
const QUOTE_HEADLINE = "Room for four, the dog and the weekend bags.";

/** Rows the fill seeds: two named in the brief, one picked from stock. Finance is never filled. */
const QUOTE_CARS = [
  {
    name: "Škoda Kodiaq Edition X",
    engine: "1.5 TSI e-TEC 150 PS DSG · 7 seats",
    tagline: "Seven seats, room for the dog.",
    monthly: "£367",
  },
  {
    name: "Škoda Karoq Sportline Edition",
    engine: "1.5 TSI 150 PS DSG",
    tagline: "Same big boot, easier to park.",
    monthly: "£338",
  },
  {
    name: "Škoda Enyaq 85 SE L",
    engine: "Electric · 286 PS · from stock",
    tagline: "Electric, and charged at home.",
    monthly: "£359",
  },
] as const;

/** Staff typing the monthly figures, one car at a time, well after the fill. */
const QUOTE_MOVE: [number, number][] = [
  [0.63, 0.69],
  [0.745, 0.785],
  [0.83, 0.87],
];
const QUOTE_PRESS: [number, number][] = [
  [0.69, 0.71],
  [0.785, 0.805],
  [0.87, 0.89],
];
const QUOTE_TYPE: [number, number][] = [
  [0.71, 0.745],
  [0.805, 0.83],
  [0.89, 0.93],
];

const typedSlice = (text: string, t: number) => text.slice(0, Math.round(text.length * clamp01(t)));

function Caret({ on }: { on: boolean }) {
  return on ? <span className="scene-caret" aria-hidden /> : null;
}

function QuoteScene() {
  const [brief, setBrief] = useState(1);
  // 0 brief being typed / cursor to Fill story, 1 pressed, 2 filling, 3 filled
  const [stage, setStage] = useState(3);
  const [story, setStory] = useState(1);
  const [prices, setPrices] = useState<number[]>([1, 1, 1]);
  // -1 nothing, 0 the Fill story button, 1 to 3 a monthly box
  const [press, setPress] = useState(-1);
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const moneyRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const trackRef = useScrollScene<HTMLElement>((p) => {
    setBrief(Math.round(seg(p, 0.03, 0.26) * 100) / 100);
    setStage(p < 0.37 ? 0 : p < 0.4 ? 1 : p < 0.46 ? 2 : 3);
    rowRefs.current.forEach((row, i) => {
      if (!row) return;
      const a = 0.46 + i * 0.045;
      row.style.setProperty("--t", ease(seg(p, a, a + 0.1)).toFixed(4));
    });
    setStory(Math.round(seg(p, 0.5, 0.62) * 100) / 100);
    const nextPrices = QUOTE_TYPE.map(([a, b]) => Math.round(seg(p, a, b) * 20) / 20);
    setPrices((prev) => (prev.every((v, i) => v === nextPrices[i]) ? prev : nextPrices));
    setPress(p >= 0.37 && p < 0.4 ? 0 : QUOTE_PRESS.findIndex(([a, b]) => p >= a && p < b) + 1 || -1);

    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const from = { x: box.width * 0.9, y: box.height * 0.97 };
    const fill = pointIn(box, fillRef.current, 0.5, 0.6);
    const money = (i: number) => pointIn(box, moneyRefs.current[i], 0.55, 0.6);
    let x: number;
    let y: number;
    let opacity: number;
    if (p < 0.55) {
      // Before the fill: to the Fill story button, then out of the way while it fills.
      const t = ease(seg(p, 0.29, 0.36));
      x = lerp(from.x, fill.x, t);
      y = lerp(from.y, fill.y, t);
      opacity = seg(p, 0.26, 0.3) * (1 - seg(p, 0.43, 0.48));
    } else {
      // The staff step: back in for the figures, one monthly box after another.
      let prev = from;
      x = from.x;
      y = from.y;
      for (let i = 0; i < QUOTE_MOVE.length; i++) {
        const [a, b] = QUOTE_MOVE[i];
        if (p < a) break;
        const target = money(i);
        const t = ease(seg(p, a, b));
        x = lerp(prev.x, target.x, t);
        y = lerp(prev.y, target.y, t);
        prev = target;
      }
      opacity = seg(p, 0.6, 0.64) * (1 - seg(p, 0.95, 0.99));
    }
    placeCursor(cursorRef.current, x, y, opacity);
  });

  const briefText = typedSlice(QUOTE_BRIEF, brief);
  const typingBrief = brief > 0 && brief < 1;
  const modalOpen = stage < 3;
  const filled = stage >= 3;
  const allPriced = prices.every((v) => v >= 1);
  const headlineText = typedSlice(QUOTE_HEADLINE, story);

  return (
    <SceneTrack
      trackRef={trackRef}
      id="scene-quote"
      length="long"
      copy={
        <SceneCopy
          id="scene-quote-title"
          eyebrow="Quotes"
          title="Turn a quick brief into a proper proposal"
          line="Type what the customer told you. The cars and the story fill themselves in. The figures are yours to type, same as always."
        />
      }
    >
      <div
        ref={stageRef}
        className="desk-shell scene-card relative w-full max-w-[540px]"
        role="img"
        aria-label="Proposal form. A short customer brief is typed and Fill story is pressed. Three Škoda vehicle rows and the proposal story fill in. A salesperson then types each monthly figure by hand."
      >
        <div aria-hidden className="scene-quote-body px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[15px] font-semibold">New proposal</div>
              <div className="truncate font-mono text-[11px] text-[var(--shell-text-faint)]">Laura Bennett · PCP<span className="hidden sm:inline"> · Aisha Khan</span></div>
            </div>
            <span className="scene-quote-ghost shrink-0">
              <Sparkles size={13} />
              <span className="hidden sm:inline">Fill story from brief</span>
              <span className="sm:hidden">From brief</span>
            </span>
          </div>

          <div className="mt-3">
            <div className="scene-quote-label">Hero headline</div>
            <div className="scene-quote-field scene-quote-headline">
              {headlineText}
              <Caret on={story > 0 && story < 1} />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="scene-quote-label !mb-0">Vehicles ({filled ? QUOTE_CARS.length : 0})</div>
            <div className={cn("scene-quote-finance", allPriced && filled && "is-done")}>
              {allPriced && filled ? (
                <>
                  <Check size={11} strokeWidth={3} /> Figures typed by Aisha
                </>
              ) : prices[0] > 0 ? (
                "Aisha typing figures"
              ) : (
                "Finance: staff typed only"
              )}
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-2">
            {QUOTE_CARS.map((car, i) => {
              const typed = typedSlice(car.monthly, prices[i]);
              const typing = prices[i] > 0 && prices[i] < 1;
              const done = prices[i] >= 1;
              const isPressed = press === i + 1;
              return (
                <div
                  key={car.name}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  className="scene-quote-car"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold">{car.name}</div>
                    <div className="truncate text-[11px] text-[var(--shell-text-faint)]">{car.engine}</div>
                    <div className="scene-quote-tagline truncate text-[11.5px] text-[var(--shell-text-dim)]">
                      {typedSlice(car.tagline, seg(story, 0.25 + i * 0.2, 0.55 + i * 0.15))}
                      {"\u00a0"}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <div className="scene-quote-label !mb-1 text-right">Monthly</div>
                    <span
                      ref={(el) => {
                        moneyRefs.current[i] = el;
                      }}
                      className={cn(
                        "scene-quote-money",
                        isPressed && "is-pressed",
                        (typing || isPressed) && "is-focus",
                        done && "is-typed",
                      )}
                    >
                      {typed ? typed : <span className="text-[var(--shell-text-faint)]">£</span>}
                      <Caret on={typing} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div aria-hidden className={cn("scene-quote-modal", modalOpen && "is-open")}>
          <div className="scene-quote-dialog">
            <div className="text-[15px] font-bold">Fill story from brief</div>
            <div className="scene-compact-hide mt-1 text-[12px] leading-snug text-[var(--shell-text-faint)]">
              Stock cars seed the rows. The brief writes the story. Finance on the form is left alone.
            </div>
            <div className="mt-2.5">
              <div className="scene-quote-label">Stock cars (optional)</div>
              <span className="scene-quote-chip">
                <Car size={12} /> Enyaq 85 SE L · SY25 KTE
              </span>
            </div>
            <div className="mt-2.5">
              <div className="scene-quote-label">Customer brief</div>
              <div className="scene-quote-field scene-quote-brief">
                {briefText ? (
                  briefText
                ) : (
                  <span className="text-[var(--shell-text-faint)]">Customer situation, must-haves, rival quote, timeline</span>
                )}
                <Caret on={typingBrief} />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <span className="scene-quote-cancel">Cancel</span>
              <span ref={fillRef} className={cn("scene-quote-go", stage === 1 && "is-pressed")}>
                {stage === 2 ? "Filling…" : "Fill story"}
              </span>
            </div>
          </div>
        </div>
        <FakeCursor innerRef={cursorRef} down={press >= 0} />
      </div>
    </SceneTrack>
  );
}

/* ------------------------------------------------------------------ */
/* Scene: sales overview (portal Overview, Delivered month)            */
/* ------------------------------------------------------------------ */

const UNITS_TARGET = 24;
const REPS = ["Ross McLean", "Aisha Khan", "Niamh Scott", "Dev Patel"] as const;

/** One entry per month, newest first. Each rep total sums to `total`. */
const DELIVERED: { total: number; bev: number; reps: [number, number, number, number] }[] = [
  { total: 26, bev: 7, reps: [9, 8, 5, 4] },
  { total: 11, bev: 3, reps: [3, 4, 2, 2] },
  { total: 18, bev: 5, reps: [6, 5, 4, 3] },
  { total: 24, bev: 6, reps: [7, 6, 6, 5] },
];
const REP_MAX = Math.max(...DELIVERED.flatMap((m) => m.reps));
/** Portal shows this month and the previous 11; the menu shows the first six. */
const MONTH_MENU = 6;
const MONTH_STEPS = 3;
const MONTH_CYCLE = 0.19;
const MONTH_START = 0.04;

function monthLabel(base: Date, offset: number) {
  const d = new Date(base.getFullYear(), base.getMonth() - offset, 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// Portal toneForPercent: red to 70%, amber to 99%, green at target.
function toneFor(count: number) {
  const pct = (count / UNITS_TARGET) * 100;
  return pct >= 100 ? "green" : pct >= 71 ? "amber" : "red";
}

function useCountUp(target: number) {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = ease(clamp01((now - start) / 460));
      const v = Math.round(lerp(from, target, t));
      shownRef.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

function CountUp({ value }: { value: number }) {
  return <>{useCountUp(value)}</>;
}

function OverviewScene() {
  // Month index into DELIVERED (0 = this month). End state steps back three months.
  const [month, setMonth] = useState(MONTH_STEPS);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(-1);
  const [pressed, setPressed] = useState(false);
  // Labels follow the real calendar once mounted; the server renders this month.
  const [base, setBase] = useState(() => new Date(2026, 8, 1));
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSpanElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const now = new Date();
    setBase(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

  const trackRef = useScrollScene<HTMLElement>((p) => {
    // Three cycles: click the Delivered month select, hover the month before, pick it.
    let m = 0;
    let isOpen = false;
    let hov = -1;
    let down = false;
    for (let k = 0; k < MONTH_STEPS; k++) {
      const b = MONTH_START + k * MONTH_CYCLE;
      if (p >= b + 0.16) m = k + 1;
      if ((p >= b + 0.07 && p < b + 0.09) || (p >= b + 0.145 && p < b + 0.16)) down = true;
      if (p >= b + 0.09 && p < b + 0.16) {
        isOpen = true;
        if (p >= b + 0.135) hov = k + 1;
      }
    }
    setMonth(m);
    setOpen(isOpen);
    setHover(hov);
    setPressed(down);

    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const from = { x: box.width * 0.88, y: box.height * 0.97 };
    const sel = pointIn(box, selectRef.current, 0.55, 0.6);
    const opt = (i: number) => pointIn(box, optionRefs.current[i], 0.45, 0.6);
    let prev = from;
    let x = from.x;
    let y = from.y;
    for (let k = 0; k < MONTH_STEPS; k++) {
      const b = MONTH_START + k * MONTH_CYCLE;
      if (p < b) break;
      let t = ease(seg(p, b, b + 0.065));
      x = lerp(prev.x, sel.x, t);
      y = lerp(prev.y, sel.y, t);
      if (p >= b + 0.1) {
        const o = opt(k + 1);
        t = ease(seg(p, b + 0.1, b + 0.135));
        x = lerp(sel.x, o.x, t);
        y = lerp(sel.y, o.y, t);
        prev = o;
      }
    }
    const lastPick = MONTH_START + (MONTH_STEPS - 1) * MONTH_CYCLE + 0.16;
    if (p >= lastPick) {
      const rest = { x: prev.x - 30, y: prev.y + 90 };
      const t = ease(seg(p, lastPick + 0.02, lastPick + 0.12));
      x = lerp(prev.x, rest.x, t);
      y = lerp(prev.y, rest.y, t);
    }
    placeCursor(cursorRef.current, x, y, seg(p, 0.01, 0.05) * (1 - seg(p, 0.8, 0.88)));
  });

  const data = DELIVERED[month];
  const label = monthLabel(base, month);
  const tone = toneFor(data.total);

  return (
    <SceneTrack
      trackRef={trackRef}
      id="scene-overview"
      length="long"
      copy={
        <SceneCopy
          id="scene-overview-title"
          eyebrow="Overview"
          title="See how every month went, and who sold what"
          line="Pick a month and the deliveries add themselves up, per salesperson. Commission night gets a lot shorter."
        />
      }
    >
      <div
        ref={stageRef}
        className="desk-shell scene-card relative w-full max-w-[520px]"
        role="img"
        aria-label={`Overview, Delivered tab. ${data.total} of ${UNITS_TARGET} cars delivered in ${label}, split by salesperson. The month picker steps back through recent months.`}
      >
        <div aria-hidden className="scene-overview-body px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[17px] font-medium">Overview</div>
              <div className="scene-compact-hide hidden truncate text-[12px] text-[var(--mist)] sm:block">
                For your commission figures.
              </div>
            </div>
            <span className="scene-seg shell-glass-inset shrink-0">
              <span>Table</span>
              <span className="scene-hide-xs">Calendar</span>
              <span className="is-on">Delivered</span>
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="scene-select scene-select-sm !w-auto">
              <span className="truncate">All</span>
              <ChevronDown size={13} className="shrink-0 opacity-70" />
            </span>
            <div className="relative">
              <span
                ref={selectRef}
                className={cn("scene-select scene-select-sm scene-month-select", pressed && !open && "is-pressed", open && "is-open")}
              >
                <span key={label} className="scene-month-label truncate">
                  {label}
                </span>
                <ChevronDown size={13} className="shrink-0 opacity-70" />
              </span>
              <div className={cn("scene-menu scene-menu-month", open && "is-open")}>
                {Array.from({ length: MONTH_MENU }, (_, i) => (
                  <div
                    key={i}
                    ref={(el) => {
                      optionRefs.current[i] = el;
                    }}
                    className={cn("scene-menu-item", i === month && "is-current", i === hover && "is-hover")}
                  >
                    {monthLabel(base, i)}
                    {i === month && hover !== i ? <Check size={12} /> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={cn("scene-tile mt-3", `is-${tone}`)}>
            <span className="scene-tile-icon">
              <PartyPopper size={16} />
            </span>
            <div className="min-w-0">
              <div className="font-mono text-[19px] leading-none font-bold tabular-nums text-white">
                <CountUp value={data.total} />/{UNITS_TARGET}
              </div>
              <div className="scene-tile-sub mt-0.5 truncate text-[11px]">Delivered in {label}</div>
            </div>
          </div>

          <div className="mt-2.5 text-[12px] text-[var(--shell-text-dim)]">
            <strong className="text-white tabular-nums">
              <CountUp value={data.total} />
            </strong>{" "}
            deals counted · <strong className="text-white tabular-nums"><CountUp value={data.bev} /></strong> BEV
          </div>

          <div className="shell-glass mt-2.5 rounded-[16px] px-3.5 py-2.5">
            <div className="scene-quote-label !mb-1.5">By salesperson</div>
            <ul className="flex flex-col gap-1.5">
              {REPS.map((rep, i) => (
                <li key={rep} className="scene-rep">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-[var(--shell-text-dim)]">
                    {initialsOf(rep)}
                  </span>
                  <span className="w-[84px] shrink-0 truncate text-[12.5px] sm:w-[100px]">{rep}</span>
                  <span className="scene-bar">
                    <span style={{ width: `${(data.reps[i] / REP_MAX) * 100}%` }} />
                  </span>
                  <span className="w-5 shrink-0 text-right font-mono text-[12.5px] font-bold tabular-nums">
                    <CountUp value={data.reps[i]} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <FakeCursor innerRef={cursorRef} down={pressed} />
      </div>
    </SceneTrack>
  );
}

export function HomeScrollScenes() {
  return (
    <div className="scroll-scenes" id="showcase">
      <TeamScene />
      <StockScene />
      <QuoteScene />
      <CustomerScene />
      <NudgeScene />
      <ChaseScene />
      <OverviewScene />
    </div>
  );
}
