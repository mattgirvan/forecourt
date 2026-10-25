import { useEffect, useRef, useState, type ReactNode } from "react";
import { clamp01, TOTAL_STEPS } from "./kit";
import { StepSetup } from "./step-setup";
import { StepLoop } from "./step-loop";
import { StepTickets } from "./step-tickets";
import { StepChanges } from "./step-changes";
import { StepSite } from "./step-site";
import { StepBilling } from "./step-billing";
import { cn } from "@/lib/utils";

type Step = { n: number; label: string; node: ReactNode };

/** Steps in page order. Each later slice adds its own entry. */
const STEPS: Step[] = [
  { n: 1, label: "Getting set up", node: <StepSetup /> },
  { n: 2, label: "Kept in the loop", node: <StepLoop /> },
  { n: 3, label: "Change requests", node: <StepChanges /> },
  { n: 4, label: "Raising tickets", node: <StepTickets /> },
  { n: 5, label: "Billing and invoices", node: <StepBilling /> },
  { n: 6, label: "Opening a new site", node: <StepSite /> },
];

export function HowSteps() {
  const layoutRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(STEPS[0].n);

  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout) return;
    let raf = 0;
    const header = document.querySelector("header");
    const measure = () => {
      raf = 0;
      if (header) layout.style.setProperty("--hiw-top", `${header.getBoundingClientRect().height}px`);
      const vh = window.innerHeight;
      const r = layout.getBoundingClientRect();
      layout.style.setProperty("--hiw-prog", clamp01((vh * 0.45 - r.top) / Math.max(1, r.height)).toFixed(4));
      let cur = STEPS[0].n;
      for (const s of STEPS) {
        const el = document.getElementById(`step-${s.n}`);
        if (el && el.getBoundingClientRect().top <= vh * 0.45) cur = s.n;
      }
      setActive((prev) => (prev === cur ? prev : cur));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const activeIndex = Math.max(0, STEPS.findIndex((s) => s.n === active));
  const activeLabel = STEPS[activeIndex]?.label ?? "";

  return (
    <div ref={layoutRef} className="hiw-layout" style={{ ["--hiw-active" as string]: activeIndex }}>
      <nav className="hiw-rail" aria-label="How it works steps">
        <span className="hiw-rail-pill" aria-hidden />
        <ol>
          {STEPS.map((s) => (
            <li key={s.n}>
              <a href={`#step-${s.n}`} className={cn(s.n === active && "is-active")} aria-current={s.n === active ? "step" : undefined}>
                <span className="hiw-rail-num">{s.n}</span>
                <span className="hiw-rail-label">{s.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="hiw-progress" aria-hidden>
        <span className="hiw-progress-text">
          Step {active} of {TOTAL_STEPS}
        </span>
        <span className="hiw-progress-label">{activeLabel}</span>
        <span className="hiw-progress-bar">
          <span />
        </span>
      </div>

      <div className="hiw-steps">
        {STEPS.map((s) => (
          <div key={s.n}>{s.node}</div>
        ))}
      </div>
    </div>
  );
}
