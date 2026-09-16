import { cn } from "@/lib/utils";

/** Three cars on a canopy line. The bays shorten as they drop — gaps read as an F. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-6 text-fg", className)}
    >
      <path
        d="M2 4.2h20"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.7"
      />
      <g fill="currentColor">
        <rect x="11.4" y="5.35" width="7.2" height="1.7" rx="0.7" opacity="0.95" />
        <rect x="2" y="6.5" width="18" height="4.35" rx="1.25" />
        <circle cx="5.1" cy="10.95" r="0.85" />
        <circle cx="16.9" cy="10.95" r="0.85" />
      </g>
      <g fill="currentColor" opacity="0.62">
        <rect x="7.4" y="12.15" width="5.4" height="1.55" rx="0.65" />
        <rect x="2" y="13.2" width="12.4" height="4.35" rx="1.25" />
        <circle cx="5.1" cy="17.65" r="0.85" />
        <circle cx="11.5" cy="17.65" r="0.85" />
      </g>
      <g fill="currentColor" opacity="0.92">
        <rect x="4.1" y="18.85" width="3.8" height="1.4" rx="0.6" />
        <rect x="2" y="19.8" width="8" height="3.9" rx="1.2" />
        <circle cx="4.3" cy="23.8" r="0.8" />
        <circle cx="8.3" cy="23.8" r="0.8" />
      </g>
    </svg>
  );
}
