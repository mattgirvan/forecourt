import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-sm border border-line bg-elevated px-3 text-sm text-fg placeholder:text-subtle outline-none transition-colors focus:border-line-strong focus:ring-2 focus:ring-accent/30",
        className,
      )}
      {...props}
    />
  );
}
