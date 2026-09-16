import { Link, useRouterState } from "@tanstack/react-router";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "Product" },
  { to: "/demo", label: "Desk" },
  { to: "/how", label: "How it ships" },
  { to: "/pricing", label: "Commercial" },
] as const;

export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 text-fg">
          <Mark />
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.22em]">
            Forecourt
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                "rounded-sm px-3 py-2 text-sm text-muted transition-colors hover:text-fg",
                pathname === l.to && "text-fg",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <SignedIn>
            <Link to="/account" className="hidden text-sm text-muted hover:text-fg sm:inline">
              Account
            </Link>
            <UserButton />
          </SignedIn>
          <SignedOut>
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          </SignedOut>
          <Button size="sm" asChild>
            <Link to="/account">60-day pilot</Link>
          </Button>
        </div>

      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-line px-4 py-1 md:hidden">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={cn(
              "shrink-0 rounded-sm px-3 py-2 text-sm text-muted",
              pathname === l.to && "text-fg",
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
