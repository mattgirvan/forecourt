import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSb, magicRedirect, supabaseReady } from "@/lib/sb";
import { whoAmI } from "@/lib/server/portal";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function afterAuth() {
    const { data } = await getSb().auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      await navigate({ to: "/account" });
      return;
    }
    try {
      const me = await whoAmI({ data: { token } });
      if (me.team) {
        await navigate({ to: "/office", search: {} });
        return;
      }
    } catch {
      /* dealer */
    }
    await navigate({ to: "/account" });
  }

  useEffect(() => {
    if (!supabaseReady()) return;
    void getSb()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) void afterAuth();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!supabaseReady()) {
      setNotice("Sign-in is not connected on this site yet.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await getSb().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: magicRedirect(), shouldCreateUser: true },
      });
      if (error) {
        setNotice(error.message);
        return;
      }
      setSent(true);
      setNotice(null);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await getSb().auth.verifyOtp({
        email,
        token: code.replace(/\s/g, ""),
        type: "email",
      });
      if (error) {
        setNotice(error.message);
        return;
      }
      await afterAuth();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 text-fg">
      <div className="w-full max-w-sm space-y-8">
        <Link to="/" className="flex items-center gap-2 text-fg">
          <Mark />
          <span className="font-mono text-[11px] uppercase tracking-[0.2em]">{SITE.name}</span>
        </Link>
        <div>
          <h1 className="font-display text-4xl tracking-tight">Your account.</h1>
          <p className="mt-2 text-sm text-muted">
            {sent ? `Code sent to ${email}` : "Dealers see their package. Staff see the office."}
          </p>
        </div>
        {!sent ? (
          <form className="space-y-3" onSubmit={(e) => void send(e)}>
            <Input
              type="email"
              required
              autoComplete="email"
              placeholder="you@dealership.co.uk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={busy || !email}>
              {busy ? "Sending…" : "Send code"}
            </Button>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={(e) => void confirm(e)}>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              placeholder="Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={busy || code.replace(/\s/g, "").length < 6}>
              {busy ? "Signing in…" : "Continue"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs text-muted underline-offset-4 hover:underline"
              onClick={() => {
                setSent(false);
                setCode("");
                setNotice(null);
              }}
            >
              Use another email
            </button>
          </form>
        )}
        {notice && <p className="text-sm text-muted">{notice}</p>}
      </div>
    </main>
  );
}
