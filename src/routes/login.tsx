import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSb, magicRedirect, supabaseReady } from "@/lib/sb";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabaseReady()) return;
    void getSb()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) void navigate({ to: "/account" });
      });
  }, [navigate]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!supabaseReady()) {
      setNotice("Supabase anon key is not on this deploy yet.");
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
      setNotice("Code is in the email. Type it here — stay in this window. Do not tap the link if you opened Forecourt from the home screen.");
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
      await navigate({ to: "/account" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 text-fg">
      <div className="w-full max-w-sm space-y-6">
        <Link to="/" className="flex items-center gap-2 text-fg">
          <Mark />
          <span className="font-mono text-[11px] uppercase tracking-[0.2em]">{SITE.name}</span>
        </Link>
        <div>
          <h1 className="font-display text-3xl tracking-tight">Sign in to your instance.</h1>
          <p className="mt-2 text-sm text-muted">
            A code, in this window. The home-screen app and Mail are different Safari boxes — tapping
            the link opens a new one and drops the session.
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
              {busy ? "Sending…" : "Email me a code"}
            </Button>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={(e) => void confirm(e)}>
            <p className="text-sm text-muted">Sent to {email}</p>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              placeholder="8-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={busy || code.replace(/\s/g, "").length < 6}>
              {busy ? "Signing in…" : "Sign in"}
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
              Use a different email
            </button>
          </form>
        )}
        {notice && <p className="text-sm text-muted">{notice}</p>}
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
          Inbox for us: {SITE.email}
        </p>
      </div>
    </main>
  );
}
