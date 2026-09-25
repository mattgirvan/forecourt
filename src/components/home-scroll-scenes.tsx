import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Calendar, Car, Check, CheckCircle2, ChevronDown, Circle, Key, Mail, MessageSquare, Plus, Truck, UserPlus } from "lucide-react";
import { PhoneFrame } from "@/components/home-customer-view";
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
        <div className="mx-auto grid w-full max-w-5xl items-center gap-6 px-4 sm:gap-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
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
    const next = p < 0.42 ? 0 : p < 0.48 ? 1 : p < 0.66 ? 2 : p < 0.74 ? 3 : 4;
    setStage(next);
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const from = { x: box.width * 0.88, y: box.height * 0.96 };
    const pill = pointIn(box, pillRef.current, 0.62, 0.6);
    const opt = pointIn(box, optionRef.current, 0.42, 0.6);
    const rest = { x: pill.x + 26, y: pill.y + 34 };
    let x: number;
    let y: number;
    if (p < 0.48) {
      const t = ease(seg(p, 0.1, 0.4));
      x = lerp(from.x, pill.x, t);
      y = lerp(from.y, pill.y, t);
    } else if (p < 0.74) {
      const t = ease(seg(p, 0.5, 0.64));
      x = lerp(pill.x, opt.x, t);
      y = lerp(pill.y, opt.y, t);
    } else {
      const t = ease(seg(p, 0.78, 0.92));
      x = lerp(opt.x, rest.x, t);
      y = lerp(opt.y, rest.y, t);
    }
    placeCursor(cursorRef.current, x, y, seg(p, 0.04, 0.12));
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
      const a = 0.03 + i * 0.065;
      row.style.setProperty("--t", ease(seg(p, a, a + 0.17)).toFixed(4));
    });
    const next = p < 0.52 ? 0 : p < 0.68 ? 1 : p < 0.73 ? 2 : p < 0.81 ? 3 : p < 0.87 ? 4 : 5;
    setStage(next);
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const from = { x: box.width * 0.9, y: box.height * 0.98 };
    const pill = pointIn(box, pillRef.current, 0.55, 0.6);
    const opt = pointIn(box, optionRef.current, 0.4, 0.6);
    const rest = { x: pill.x + 30, y: pill.y + 36 };
    let x: number;
    let y: number;
    if (p < 0.73) {
      const t = ease(seg(p, 0.53, 0.67));
      x = lerp(from.x, pill.x, t);
      y = lerp(from.y, pill.y, t);
    } else if (p < 0.87) {
      const t = ease(seg(p, 0.74, 0.8));
      x = lerp(pill.x, opt.x, t);
      y = lerp(pill.y, opt.y, t);
    } else {
      const t = ease(seg(p, 0.89, 0.97));
      x = lerp(opt.x, rest.x, t);
      y = lerp(opt.y, rest.y, t);
    }
    placeCursor(cursorRef.current, x, y, seg(p, 0.5, 0.56));
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

const STOPS = ["International Port", "On Boat", "UK Port"] as const;

/**
 * Portal locator rail, three stops. Same classes as the real Car Locator
 * (stage-disc, now-pill, rail-label); the current column sizes to its pill like the
 * portal, but widths are set in px so columns and the pill glide instead of jumping.
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
    const cur = Math.min(layout.pills[index] + 10, layout.w * 0.62);
    const other = (layout.w - cur) / (STOPS.length - 1);
    basis = STOPS.map((_, i) => `${(i === index ? cur : other).toFixed(2)}px`);
    centre = `${(other * index + cur / 2).toFixed(2)}px`;
  } else {
    basis = STOPS.map((_, i) => (i === index ? "40%" : "30%"));
    centre = `${30 * index + 20}%`;
  }

  return (
    <div className="rail-scroll scene-rail-scroll">
      <div className="progress-rail scene-rail" ref={railRef}>
        <div className="progress-nodes">
          <div className="progress-track shell-glass-inset scene-rail-track" aria-hidden />
          {STOPS.map((stop, i) => {
            const done = i < index;
            const current = i === index;
            return (
              <div key={stop} className="progress-node scene-rail-node" style={{ flex: `0 0 ${basis[i]}` }}>
                <div className="rail-mark">
                  {current ? (
                    <span className="scene-rail-slot" />
                  ) : (
                    <span key={done ? "done" : "todo"} className={cn("stage-disc scene-disc", !done && "is-faint")}>
                      {done ? <Check size={13} strokeWidth={2.75} /> : null}
                    </span>
                  )}
                </div>
                <div className={cn("rail-label", done && "is-done", current && "is-now")}>{current ? " " : stop}</div>
              </div>
            );
          })}
          <span className="now-pill scene-rail-bubble" style={{ left: centre }}>
            <Car size={13} /> {STOPS[index]}
          </span>
          {STOPS.map((stop, i) => (
            <span
              key={stop}
              ref={(el) => {
                measureRefs.current[i] = el;
              }}
              className="now-pill scene-rail-measure"
              aria-hidden
            >
              <Car size={13} /> {stop}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const LOCATOR_LABEL = ["At International Port", "On Boat to UK", "UK Port"] as const;

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
        className="scene-phone"
        role="img"
        aria-label={`Customer view of a sample order. Car Locator shows ${LOCATOR_LABEL[index]}.`}
      >
        <div aria-hidden>
          <PhoneFrame accent="#4ba82e" glow="rgba(75,168,46,0.38)" screenClassName="scene-phone-screen" caption="Customer view. Sample order, dummy details.">
            <div className="mx-auto max-w-[1200px] px-5 py-7 pb-24">
              <div className="mb-3.5 text-lg font-medium">Welcome back, Jamie</div>
              <div className="shell-glass customer-header-card mb-5 rounded-[24px] p-7">
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
                  <span className="flex size-11 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <Car size={18} color="var(--shell-text-faint)" />
                  </span>
                  <div className="text-[20px] leading-tight font-medium text-[#F6F5F1]">Elroq 85 Edition</div>
                </div>
                <div className="mb-1.5 font-mono text-[11.5px] text-[#7C8F84]">VIN: TMBJR7NY0TF048213</div>
                <div className="mb-4 text-sm text-[#9FB0A6]">Timiano Green</div>
                <div
                  className="flex items-center gap-3.5 rounded-[14px] px-4 py-3.5"
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

              <div className="shell-glass mb-5 rounded-[24px] p-5">
                <div className="flex w-full items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <Truck size={15} className="shrink-0" />
                    <div className="text-[13px] font-semibold whitespace-nowrap">Car Locator</div>
                    <span key={index} className="scene-locator-label truncate font-mono text-xs font-semibold" style={{ color: "var(--emerald)" }}>
                      {LOCATOR_LABEL[index]}
                    </span>
                  </div>
                </div>
                <div className="mt-4">
                  <GlideRail index={index} />
                </div>
              </div>
            </div>
          </PhoneFrame>
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

  const trackRef = useScrollScene<HTMLElement>((p) => {
    setStage(p < 0.12 ? 0 : p < 0.42 ? 1 : p < 0.47 ? 2 : p < 0.64 ? 3 : p < 0.8 ? 4 : 5);
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const from = { x: box.width * 0.85, y: box.height * 0.98 };
    const cta = pointIn(box, ctaRef.current, 0.5, 0.6);
    const rest = { x: cta.x - 40, y: cta.y + 70 };
    let x: number;
    let y: number;
    if (p < 0.47) {
      const t = ease(seg(p, 0.24, 0.4));
      x = lerp(from.x, cta.x, t);
      y = lerp(from.y, cta.y, t);
    } else {
      const t = ease(seg(p, 0.52, 0.66));
      x = lerp(cta.x, rest.x, t);
      y = lerp(cta.y, rest.y, t);
    }
    placeCursor(cursorRef.current, x, y, seg(p, 0.18, 0.24) * (1 - seg(p, 0.8, 0.88)));
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
        <div aria-hidden className="px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold">Priya Shah</div>
              <div className="truncate text-[12px] text-[var(--shell-text-faint)]">Enyaq 85 Edition · SY25 PSH</div>
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
                  <span ref={ctaRef} className={cn("dealer-nudge-banner__cta", stage === 2 && "is-pressed")}>
                    Message customer
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
            <div className="shell-glass rounded-[16px] p-3.5">
              <div className="mb-2.5 flex items-center justify-between text-[12.5px] font-semibold">
                Outstanding tasks
                <span className="font-mono text-[11px]" style={{ color: done ? "var(--emerald)" : "var(--mist)" }}>
                  {done ? "0 left" : "2 left"}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
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
              <div className="flex min-h-[112px] flex-col justify-end gap-2">
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
    const k = p < 0.27 ? 0 : p < 0.5 ? 1 : p < 0.72 ? 2 : 3;
    setTicked(k);
    setPressed((p >= 0.23 && p < 0.27) || (p >= 0.46 && p < 0.5) || (p >= 0.68 && p < 0.72));
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const from = { x: box.width * 0.9, y: box.height * 0.95 };
    const pt = (n: number) => pointIn(box, tickRefs.current[V5_ORDER[n]], 0.55, 0.6);
    const legs: [number, number][] = [
      [0.1, 0.21],
      [0.31, 0.44],
      [0.54, 0.66],
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
    placeCursor(cursorRef.current, x, y, seg(p, 0.06, 0.12) * (1 - seg(p, 0.8, 0.9)));
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
              <span className={cn("scene-count", waiting === 0 && "is-clear")}>
                {waiting === 0 ? "All in" : `${waiting} waiting`}
              </span>
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
                          <div className="truncate text-[13px] font-semibold">{c.name}</div>
                          <div className="truncate text-[11.5px] text-[var(--mist)]">
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

export function HomeScrollScenes() {
  return (
    <div className="scroll-scenes" id="showcase">
      <TeamScene />
      <StockScene />
      <CustomerScene />
      <NudgeScene />
      <ChaseScene />
    </div>
  );
}
