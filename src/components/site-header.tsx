import { Link, useRouterState } from "@tanstack/react-router";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { deskSearch } from "@/lib/brands";
import { useDemo } from "@/lib/demo-store";
import { SignedIn, SignedOut, UserButton } from "@/lib/sb-session";
import { useWhoAmI } from "@/lib/who-am-i";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "Product" },
  { to: "/demo", label: "Try it", desk: true },
  { to: "/how", label: "How it works" },
  { to: "/pricing", label: "Pricing" },
] as const;

function NavLink({
  to,
  label,
  desk,
  className,
}: {
  to: string;
  label: string;
  desk?: boolean;
  className?: string;
}) {
  const company = useDemo((s) => s.company);
  const brandId = useDemo((s) => s.brandId);
  const site = useDemo((s) => s.site);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const on = pathname === to || (to === "/" && pathname === "/");

  return (
    <Link
      to={to}
      search={desk ? deskSearch({ company, brandId, site }) : undefined}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-[13px] text-muted transition-colors hover:text-fg",
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
  const team = Boolean(me?.team);

  return (
    <header className="sticky top-3 z-40 px-3 sm:top-4">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between gap-2 rounded-full border border-line bg-bg/70 px-2 pl-3 shadow-soft backdrop-blur-xl sm:h-14 sm:px-3">
        <Link to="/" className="flex items-center gap-2 text-fg">
          <Mark className="size-6" />
          <span className="text-sm font-medium tracking-tight">Forecourt</span>
        </Link>
        <nav className="hidden items-center md:flex">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} label={l.label} desk={"desk" in l && l.desk} />
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <SignedIn>
            {team && (
              <Link
                to="/office"
                search={{}}
                className="hidden rounded-full px-3 py-1.5 text-[13px] text-muted hover:text-fg sm:inline"
              >
                Office
              </Link>
            )}
            <Button size="sm" variant="secondary" className="rounded-full" asChild>
              <Link to="/account">Account</Link>
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
      <nav className="mx-auto mt-2 flex max-w-5xl gap-1 overflow-x-auto px-1 md:hidden">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} label={l.label} desk={"desk" in l && l.desk} className="shrink-0" />
        ))}
      </nav>
    </header>
  );
}
