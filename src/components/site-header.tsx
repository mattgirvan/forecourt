import { Link, useRouterState } from "@tanstack/react-router";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut, UserButton } from "@/lib/sb-session";
import { useWhoAmI } from "@/lib/who-am-i";
import { cn } from "@/lib/utils";
import { headerAccountLink } from "@/lib/staff-nav";
import { GetUpdatesButton } from "@/components/newsletter-reach";

const links = [
  { to: "/", label: "Product" },
  { to: "/how", label: "How it works" },
  { to: "/pricing", label: "Pricing" },
  { to: "/contact", label: "Contact" },
] as const;

function NavLink({
  to,
  hash,
  label,
  className,
}: {
  to: string;
  hash?: string;
  label: string;
  className?: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const on = !hash && pathname === to;

  return (
    <Link
      to={to}
      hash={hash}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-full px-3.5 text-[13px] text-muted transition-transform duration-150 hover:text-fg active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
        on && "bg-elevated text-fg",
        className,
      )}
    >
      {label}
    </Link>
  );
}

export function SiteHeader() {
  const { me } = useWhoAmI();
  // Staff land on the office, not the dealer account page.
  const accountLink = headerAccountLink(me?.team);

  return (
    <header className="sticky top-0 z-40">
      <div className="nav-veil" aria-hidden />
      <div className="relative px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="nav-glass mx-auto flex h-12 max-w-5xl items-center justify-between gap-2 rounded-full px-2 pl-3 sm:h-14 sm:px-3">
          <Link to="/" className="flex items-center gap-2 text-fg">
            <Mark className="size-6" />
            <span className="text-sm font-medium tracking-tight">Forecourt</span>
          </Link>
          <nav className="hidden items-center md:flex">
            {links.map((l) => (
              <NavLink key={l.label} to={l.to} label={l.label} />
            ))}
            <GetUpdatesButton />
          </nav>
          <div className="flex items-center gap-1">
            <SignedIn>
              <Button size="sm" variant="secondary" className="rounded-full" asChild>
                <Link to={accountLink.to} search={{}}>
                  {accountLink.label}
                </Link>
              </Button>
              <UserButton />
            </SignedIn>
            <SignedOut>
              <Link
                to="/login"
                className="hidden rounded-full px-3 py-1.5 text-[13px] text-muted hover:text-fg sm:inline"
              >
                Sign in
              </Link>
              <Button size="sm" className="rounded-full" asChild>
                <Link to="/account">Get started</Link>
              </Button>
            </SignedOut>
          </div>
        </div>
        {/* Mobile row: tabs sized to their labels, 44px tall, never scrolls sideways. Labels wrap before they overflow. */}
        <nav className="nav-glass mx-auto mt-2 flex max-w-5xl gap-0.5 rounded-full p-1 md:hidden">
          {links.map((l) => (
            <NavLink
              key={l.label}
              to={l.to}
              label={l.label}
              className="min-w-0 flex-auto px-2 text-center leading-tight"
            />
          ))}
          <GetUpdatesButton className="min-w-0 flex-auto px-2 text-center leading-tight" />
        </nav>
      </div>
    </header>
  );
}
