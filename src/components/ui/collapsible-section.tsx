import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectionRail } from "@/components/ui/section";
import { collapseKey, collapseLabel, initialOpen, storedValue } from "@/lib/collapse-state";

function readOpen(id: string): boolean {
  if (typeof window === "undefined") return true;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(collapseKey(id));
  } catch {
    stored = null;
  }
  return initialOpen(stored, window.innerWidth);
}

/**
 * A section card whose whole header row is a button (44px minimum) that shows
 * or hides the body. Collapsed by default under 768px, open on desktop, and
 * the choice is remembered per section id in localStorage.
 *
 * Motion: the body is shown or hidden at once (no height animation), and its
 * inner content fades and slides in with transform and opacity only. Nothing
 * above the section moves. Reduced motion turns the fade off.
 */
export function CollapsibleSection({
  id,
  title,
  count,
  rail = "blue",
  children,
  className,
  testId,
}: {
  /** Stable id, used for the storage key and aria-controls. */
  id: string;
  title: string;
  count?: number | null;
  rail?: SectionRail;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const bodyId = `${useId()}-body`;
  const [open, setOpen] = useState<boolean>(() => readOpen(id));
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setOpen(readOpen(id));
  }, [id]);

  function toggle() {
    const next = !open;
    setOpen(next);
    setAnimate(next);
    try {
      window.localStorage.setItem(collapseKey(id), storedValue(next));
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }

  return (
    <section className={cn("fc-section", !open && "is-collapsed", className)} data-testid={testId}>
      <h2 className="fc-collapse-heading">
        <button
          type="button"
          className="fc-section-head fc-collapse-head"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
        >
          <span className={cn("fc-section-rail", `is-${rail}`)} aria-hidden="true" />
          <span className="fc-section-title">{title}</span>
          {count != null ? (
            <span className="fc-chip" aria-hidden="true">
              {count}
            </span>
          ) : null}
          <span className="sr-only">{collapseLabel("", count).trim()}</span>
          <ChevronDown className="fc-collapse-chevron" aria-hidden="true" />
        </button>
      </h2>
      <div id={bodyId} className="fc-section-body" hidden={!open}>
        <div className={cn(animate && open && "fc-collapse-in")}>{children}</div>
      </div>
    </section>
  );
}
