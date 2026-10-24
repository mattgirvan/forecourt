import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one status chip. Colour rules:
 * action (amber) only where someone has to do something now,
 * live (green) for Live, Paid and done,
 * progress (grey with a ring) for work under way, neutral (grey) for everything else.
 */
export type ChipTone = "neutral" | "action" | "live" | "progress";

export function Chip({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  // A chip with no text reads as an empty grey pill: render nothing instead.
  if (isEmptyChipText(children)) return null;
  return (
    <span
      className={cn("fc-chip", tone !== "neutral" && `is-${tone}`, className)}
      title={title}
      data-tone={tone}
    >
      {children}
    </span>
  );
}

/** True when a chip would show no visible text (null, false, or only spaces). */
export function isEmptyChipText(children: ReactNode): boolean {
  if (children == null || typeof children === "boolean") return true;
  if (typeof children === "string") return children.trim() === "";
  if (Array.isArray(children)) return children.every((c) => isEmptyChipText(c as ReactNode));
  return false;
}
