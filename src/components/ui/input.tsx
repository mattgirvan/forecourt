import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-full border border-line bg-elevated px-4 text-base text-fg placeholder:text-subtle sm:text-sm outline-none transition-colors focus:border-line-strong focus:ring-2 focus:ring-accent/30",
        className,
      )}
      {...props}
    />
  );
}
