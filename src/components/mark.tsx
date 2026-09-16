import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-6 text-fg", className)}
    >
      <rect x="2" y="14" width="9" height="8" rx="1" fill="currentColor" opacity="0.92" />
      <rect x="13" y="8" width="9" height="14" rx="1" fill="currentColor" opacity="0.55" />
      <path d="M2 6h20" stroke="currentColor" strokeWidth="1.4" opacity="0.85" />
    </svg>
  );
}
