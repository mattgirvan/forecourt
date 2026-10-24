import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.2,0.8,0.3,1.4)] active:scale-[0.96] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
  {
    variants: {
      variant: {
        default: "bg-fg text-accent-fg hover:opacity-90",
        secondary:
          "bg-transparent text-fg border border-line-strong hover:bg-elevated",
        action: "fc-amber-btn bg-[var(--fc-amber)] text-[var(--fc-amber-ink)] font-semibold hover:opacity-90",
        ghost: "text-muted hover:text-fg hover:bg-elevated",
        danger: "bg-bad/15 text-bad border border-bad/30 hover:bg-bad/25",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3 text-[13px]",
        lg: "h-12 px-6",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
