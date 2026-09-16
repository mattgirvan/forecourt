import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSb, magicRedirect, supabaseReady } from "@/lib/sb";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        options: { emailRedirectTo: magicRedirect() },
      });
      setNotice(error ? error.message : `Check ${email} for the link.`);
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
            Magic link. This is how a principal starts a paid pilot — not a public form.
          </p>
        </div>
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
            {busy ? "Sending…" : "Email me a link"}
          </Button>
        </form>
        {notice && <p className="text-sm text-muted">{notice}</p>}
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
          Inbox for us: {SITE.email}
        </p>
      </div>
    </main>
  );
}
