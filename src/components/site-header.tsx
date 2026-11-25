import { useEffect, useState, type ComponentType } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

function SignedOutControls() {
  return (
    <>
      <Link
        to="/login"
        className="hidden rounded-full px-3 py-1.5 text-[13px] text-muted hover:text-fg sm:inline"
      >
        Sign in
      </Link>
      <Button size="sm" className="rounded-full" asChild>
        <Link to="/account">Get started</Link>
      </Button>
    </>
  );
}

export function SiteHeader() {
  const [AuthControls, setAuthControls] = useState<ComponentType | null>(null);

  useEffect(() => {
    let hasStoredSession = false;
    try {
      hasStoredSession = window.localStorage.getItem("forecourt-auth") !== null;
    } catch {
      hasStoredSession = false;
    }
    if (!hasStoredSession) return;
    let active = true;
    void import("@/components/site-header-auth").then((mod) => {
      if (active) setAuthControls(() => mod.default);
    });
    return () => {
      active = false;
    };
  }, []);

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
            {AuthControls ? <AuthControls /> : <SignedOutControls />}
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
        </nav>
      </div>
    </header>
  );
}
