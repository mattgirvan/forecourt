import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSb, consumeAuthFromUrl, magicRedirect, supabaseReady } from "@/lib/sb";
import { UNVERIFIED_EMAIL_MESSAGE } from "@/lib/auth/verified-email";
import {
  oauthReturnError,
  oauthReturnPath,
  otpSendMessage,
  otpVerifyMessage,
  passkeySignInMessage,
  stripOauthError,
} from "@/lib/auth/signin-options";
import { useSignInOptions } from "@/lib/auth/use-signin-options";
import { whoAmI } from "@/lib/server/portal";
import { pageHead } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/login")({
  head: () =>
    pageHead({
      title: "Sign in | Forecourt",
      description:
        "Sign in to your Forecourt account with a passkey, Google, or a one-time email code.",
      path: "/login",
      noindex: true,
    }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fromLink, setFromLink] = useState(false);
  const options = useSignInOptions();
  const { slots } = options;
  const showPasskey = options.passkey === "ready" && slots.passkey === "show";
  const showGoogle = options.google && slots.google === "show";
  // Keep the space for a button we are still checking, so the email box does
  // not jump down when the buttons arrive (or someone mis-taps it).
  const showExtras = !sent && !fromLink && (slots.passkey !== "hide" || slots.google !== "hide");

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
    } catch (e) {
      // An account whose email is not proven (for example a Google login
      // Google did not verify) is refused on the server and in the database
      // (verified-email.ts, signin-verified-guard.sql). Sign it out here so
      // the page is honest.
      if (e instanceof Error && e.message.includes(UNVERIFIED_EMAIL_MESSAGE)) {
        await getSb().auth.signOut();
        setFromLink(false);
        setNotice(UNVERIFIED_EMAIL_MESSAGE);
        setBusy(false);
        return;
      }
      /* dealer */
    }
    await navigate({ to: "/account" });
  }

  useEffect(() => {
    if (!supabaseReady()) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      // Back from Google with an error (cancelled, provider off, expired).
      const oauthError = oauthReturnError(window.location.href);
      if (oauthError) {
        setNotice(oauthError);
        window.history.replaceState({}, "", stripOauthError(window.location.href));
      }
      const linked = Boolean(new URLSearchParams(window.location.search).get("token_hash"));
      const ok = await consumeAuthFromUrl();
      if (cancelled) return;
      if (ok) {
        if (linked) setFromLink(true);
        await afterAuth();
        return;
      }
      if (linked) setNotice("That link was used or has expired. Ask for a new code.");
      const { data } = await getSb().auth.getSession();
      if (data.session) await afterAuth();
      setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
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
        setNotice(otpSendMessage(error));
        return;
      }
      setSent(true);
      setNotice(null);
    } catch (err) {
      setNotice(otpSendMessage(err as Error));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithPasskey() {
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await getSb().auth.signInWithPasskey();
      if (error) {
        const message = passkeySignInMessage(error);
        if (message) setNotice(message);
        return;
      }
      await afterAuth();
    } catch (err) {
      const message = passkeySignInMessage(err as Error);
      if (message) setNotice(message);
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    setNotice(null);
    // PKCE: supabase-js keeps the code verifier in this browser, Google
    // returns to Supabase's callback, Supabase sends us back to /login?code=,
    // and the client swaps the code for a session on load (detectSessionInUrl).
    const { error } = await getSb().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: oauthReturnPath(window.location.origin) },
    });
    if (error) {
      setNotice("Google sign-in did not start. Use an email code, or try again.");
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
        setNotice(otpVerifyMessage(error));
        return;
      }
      await afterAuth();
    } catch (err) {
      setNotice(otpVerifyMessage(err as Error));
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
            {fromLink
              ? "Signing you in…"
              : sent
                ? `Code sent to ${email}. Type it here.`
                : "Dealers see their package. Staff sign in with hello@forecourt.me."}
          </p>
        </div>
        {showExtras && (
          <div
            className="space-y-3"
            data-testid="signin-extras"
            aria-busy={!showPasskey && !showGoogle}
          >
            {slots.passkey !== "hide" && (
              <Button
                type="button"
                variant="secondary"
                className={showPasskey ? "w-full" : "invisible w-full"}
                aria-hidden={showPasskey ? undefined : true}
                tabIndex={showPasskey ? undefined : -1}
                disabled={busy || !showPasskey}
                onClick={() => void signInWithPasskey()}
              >
                <KeyIcon />
                Sign in with a passkey
              </Button>
            )}
            {slots.google !== "hide" && (
              <Button
                type="button"
                variant="secondary"
                className={showGoogle ? "w-full" : "invisible w-full"}
                aria-hidden={showGoogle ? undefined : true}
                tabIndex={showGoogle ? undefined : -1}
                disabled={busy || !showGoogle}
                onClick={() => void signInWithGoogle()}
              >
                <GoogleIcon />
                Continue with Google
              </Button>
            )}
            <div
              className={`flex items-center gap-3 pt-1 text-xs text-muted${showPasskey || showGoogle ? "" : " invisible"}`}
              aria-hidden={showPasskey || showGoogle ? undefined : true}
            >
              <span className="h-px flex-1 bg-line" />
              Or get an email code
              <span className="h-px flex-1 bg-line" />
            </div>
          </div>
        )}
        {!sent ? (
          <form className="space-y-3" onSubmit={(e) => void send(e)}>
            <label htmlFor="signin-email" className="sr-only">
              Email
            </label>
            <Input
              id="signin-email"
              name="email"
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
            <label htmlFor="signin-code" className="sr-only">
              Code from the email
            </label>
            <Input
              id="signin-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              placeholder="Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
            <Button
              type="submit"
              className="w-full"
              disabled={busy || code.replace(/\s/g, "").length < 6}
            >
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
        {/* Always in the page, so screen readers hear each new notice or error. */}
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="min-h-5 text-sm text-muted"
          data-testid="signin-notice"
        >
          {notice ?? ""}
        </p>
      </div>
    </main>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M17 6l3 3M14 9l2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"
      />
    </svg>
  );
}
