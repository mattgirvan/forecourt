import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut, UserButton } from "@/lib/sb-session";
import { useWhoAmI } from "@/lib/who-am-i";
import { headerAccountLink } from "@/lib/staff-nav";

export function SiteHeaderAuthFallback() {
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

export default function SiteHeaderAuth() {
  const { me } = useWhoAmI();
  // Staff land on the office, not the dealer account page.
  const accountLink = headerAccountLink(me?.team);

  return (
    <>
      <SignedIn>
        <Button size="sm" variant="secondary" className="rounded-full" asChild>
          <Link to={accountLink.to} search={{}}>
            {accountLink.label}
          </Link>
        </Button>
        <UserButton />
      </SignedIn>
      <SignedOut>
        <SiteHeaderAuthFallback />
      </SignedOut>
    </>
  );
}
