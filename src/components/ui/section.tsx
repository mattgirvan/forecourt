import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export type SectionRail = "blue" | "teal" | "violet" | "slate";

/**
 * A section card: frosted panel, header strip (colour rail, title, count chip,
 * right-hand actions), then a body. Cards stack 18px apart.
 */
export function Section({
  title,
  eyebrow,
  rail = "blue",
  count,
  countTone = "neutral",
  actions,
  children,
  className,
  bodyClassName,
  flush = false,
  testId,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  rail?: SectionRail;
  count?: number | string | null;
  countTone?: "neutral" | "action";
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Body without padding, for content that brings its own. */
  flush?: boolean;
  testId?: string;
}) {
  return (
    <section className={cn("fc-section", className)} data-testid={testId}>
      <header className="fc-section-head">
        <span className={cn("fc-section-rail", `is-${rail}`)} aria-hidden="true" />
        <div className="fc-section-titles">
          {eyebrow ? <div className="fc-section-eyebrow">{eyebrow}</div> : null}
          <h2 className="fc-section-title">{title}</h2>
        </div>
        {count != null && count !== "" ? (
          <span className={cn("fc-chip", countTone === "action" && "is-action")}>{count}</span>
        ) : null}
        {actions ? <div className="fc-section-actions">{actions}</div> : null}
      </header>
      {children != null ? <div className={cn(!flush && "fc-section-body", bodyClassName)}>{children}</div> : null}
    </section>
  );
}

/** A stack of sections with 18px between them. */
export function SectionStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("fc-section-stack", className)}>{children}</div>;
}

/** A list of row tiles, 8px apart. */
export function Rows({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "ul" }) {
  const C = as;
  return <C className={cn("fc-rows", className)}>{children}</C>;
}

/**
 * A row tile. tone="action" adds the amber edge and wash, for rows that need
 * someone to do something. Everything else stays neutral.
 */
export function Row({
  tone = "default",
  lead,
  title,
  sub,
  trailing,
  children,
  className,
  as = "div",
  testId,
}: {
  tone?: "default" | "action";
  lead?: ReactNode;
  title?: ReactNode;
  sub?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  className?: string;
  as?: "div" | "li";
  testId?: string;
}) {
  const C = as;
  return (
    <C className={cn("fc-row", tone === "action" && "is-action", className)} data-testid={testId}>
      {lead ? <div className="fc-row-lead">{lead}</div> : null}
      {title != null || sub != null ? (
        <div className="fc-row-main">
          {title != null ? <div className="fc-row-title">{title}</div> : null}
          {sub != null ? <div className="fc-row-sub">{sub}</div> : null}
        </div>
      ) : null}
      {children}
      {trailing ? <div className="fc-row-trail">{trailing}</div> : null}
    </C>
  );
}

/** Small status chip. Amber only for action, green for done, paid and Live, grey otherwise. */
export function Chip({ tone = "neutral", children }: { tone?: "neutral" | "action" | "live" | "progress"; children: ReactNode }) {
  return <span className={cn("fc-chip", tone !== "neutral" && `is-${tone}`)}>{children}</span>;
}

export type MenuItem = { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean };

/** The "..." menu: a 44px trigger opening a solid menu. */
export function OverflowMenu({ label, items, className }: { label: string; items: MenuItem[]; className?: string }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn("fc-dots-btn", className)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <span className="fc-dots" aria-hidden="true">
            <b />
            <b />
            <b />
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={12} className="fc-menu" onClick={(e) => e.stopPropagation()}>
          {items.map((it) => (
            <DropdownMenu.Item
              key={it.label}
              disabled={it.disabled}
              className={cn("fc-menu-item", it.danger && "is-danger")}
              onSelect={() => it.onSelect()}
            >
              {it.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
