import { cn } from "@/lib/utils";

/** One shimmering block. Shape it with width and height classes. */
export function SkeletonBar({ className }: { className?: string }) {
  return <span aria-hidden className={cn("fc-skel", className)} />;
}

/**
 * Shaped placeholder cards with a slow shimmer, shown while a screen loads
 * instead of a line of "Loading" text. `kind` picks the shape.
 */
export function SkeletonCards({ kind = "cards", count = 3, label = "Loading", className }: { kind?: "cards" | "build" | "page"; count?: number; label?: string; className?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className={cn("fc-section-stack", className)} data-testid="skeleton">
      {kind === "page" ? (
        <div className="space-y-3 pb-2">
          <SkeletonBar className="h-3 w-24" />
          <SkeletonBar className="h-8 w-60 max-w-full" />
          <SkeletonBar className="h-3 w-80 max-w-full" />
        </div>
      ) : null}
      {kind === "build" ? (
        <div className="fc-skel-card">
          <div className="flex items-center justify-between gap-3">
            <SkeletonBar className="h-4 w-32" />
            <SkeletonBar className="h-6 w-20 rounded-full" />
          </div>
          <div className="mt-5 grid grid-cols-6 gap-1">
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonBar key={i} className="h-1 rounded-full" />
            ))}
          </div>
          <SkeletonBar className="mt-4 h-3 w-3/4" />
        </div>
      ) : null}
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="fc-skel-card">
          <SkeletonBar className="h-4 w-28" />
          <div className="mt-5 space-y-2">
            <SkeletonBar className="h-12 w-full rounded-2xl" />
            <SkeletonBar className="h-12 w-full rounded-2xl" />
          </div>
        </div>
      ))}
    </div>
  );
}
