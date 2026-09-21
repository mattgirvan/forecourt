import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const DOORS = [
  {
    id: "website",
    title: "This website",
    line: "Learn about Forecourt and try the demo desk.",
    for: "Anyone looking.",
    href: "/" as const,
  },
  {
    id: "account",
    title: "Your account",
    line: "Billing, build progress, people, and support.",
    for: "Dealer principal / office.",
    href: "/account" as const,
  },
  {
    id: "desk",
    title: "Your desk",
    line: "Day-to-day sales OS on your own web address.",
    for: "Staff with a seat.",
    href: null,
  },
  {
    id: "glass",
    title: "Customer glass",
    line: "\"Where's my car?\" — buyers only see their own order.",
    for: "Invited customers.",
    href: null,
  },
] as const;

/** Five doors: four customer-facing + Forecourt team as a footnote, never a fifth customer door. */
export function DoorsMap({
  here,
  compact,
}: {
  here?: (typeof DOORS)[number]["id"];
  compact?: boolean;
}) {
  return (
    <div className={cn(compact ? "space-y-3" : "space-y-5")}>
      <div className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4")}>
        {DOORS.map((d) => {
          const on = here === d.id;
          const inner = (
            <>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold tracking-tight">{d.title}</h3>
                {on ? (
                  <span className="rounded-full border border-[color-mix(in_srgb,var(--shell-accent)_42%,transparent)] bg-[color-mix(in_srgb,var(--shell-accent)_22%,rgba(255,255,255,0.08))] px-2 py-0.5 text-[10px] font-medium text-[var(--shell-accent)]">
                    You are here
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{d.line}</p>
              <p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-subtle">For {d.for}</p>
            </>
          );
          const cls = cn(
            "rounded-[1.5rem] border p-5 text-left bg-surface",
            on ? "border-[color-mix(in_srgb,var(--shell-accent)_50%,var(--color-line))]" : "border-line",
          );
          return d.href ? (
            <Link key={d.id} to={d.href} className={cls}>
              {inner}
            </Link>
          ) : (
            <article key={d.id} className={cls}>
              {inner}
            </article>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-subtle">
        Forecourt team uses a separate staff door (the office). That is not an Administrator seat — Administrator is a seat inside your desk.
      </p>
    </div>
  );
}

export function DoorsOneLiner() {
  return (
    <p className="text-sm leading-relaxed text-muted">
      Five doors, not one login: this website, your account, your desk, customer glass, and our staff office.{" "}
      <Link to="/how" className="text-fg underline-offset-4 hover:underline">
        See the map
      </Link>
      .
    </p>
  );
}
