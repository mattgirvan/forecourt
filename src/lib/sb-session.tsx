import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { getSb, supabaseReady } from "./sb";
import type { User } from "@supabase/supabase-js";

const SIGN_IN_PATH = "/login";

export function useSbUser() {
  const [user, setUser] = useState<User | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    if (!supabaseReady()) {
      setPending(false);
      return;
    }
    const sb = getSb();
    void sb.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setPending(false);
    });
    const { data } = sb.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return { user, pending };
}

export function SignedIn({ children }: { children: ReactNode }) {
  const { user, pending } = useSbUser();
  if (pending || !user) return null;
  return <>{children}</>;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { user, pending } = useSbUser();
  if (pending || user) return null;
  return <>{children}</>;
}

export function SignInGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user, pending } = useSbUser();
  if (pending) return null;
  if (user) return <>{children}</>;
  return <>{fallback ?? <Navigate to={SIGN_IN_PATH} />}</>;
}

export function UserButton() {
  const { user } = useSbUser();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const label = user.email ?? "Account";
  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[12rem] truncate text-sm text-muted sm:inline">{label}</span>
      <button
        type="button"
        disabled={busy}
        className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline disabled:opacity-50"
        onClick={() => {
          setBusy(true);
          void getSb().auth.signOut().finally(() => setBusy(false));
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

export function useSbAccessToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!supabaseReady()) return;
    const sb = getSb();
    void sb.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
    const { data } = sb.auth.onAuthStateChange((_e, session) => {
      setToken(session?.access_token ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return token;
}
