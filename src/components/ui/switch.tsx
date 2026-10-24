import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** An on/off switch with its label. The whole row is the tap target (44px or more). */
export function Switch({
  on,
  onChange,
  label,
  hint,
  className,
  testId,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={cn("fc-switch", on && "is-on", className)}
      onClick={() => onChange(!on)}
      data-testid={testId}
    >
      <span className="fc-switch-track" aria-hidden="true">
        <span className="fc-switch-thumb" />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-sm font-semibold text-fg">{label}</span>
        {hint ? (
          <span className="block text-[12.5px] text-[var(--fc-text-faint)]">{hint}</span>
        ) : null}
      </span>
    </button>
  );
}
