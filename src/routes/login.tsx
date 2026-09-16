import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 text-fg">
      <div className="w-full max-w-sm space-y-6">
        <Link to="/" className="flex items-center gap-2 text-fg">
          <Mark />
          <span className="font-mono text-[11px] uppercase tracking-[0.2em]">Forecourt</span>
        </Link>
        <div>
          <h1 className="font-display text-3xl tracking-tight">Sign in to your desk.</h1>
          <p className="mt-2 text-sm text-muted">
            Google or X. This is how a principal starts a paid pilot — not a public form.
          </p>
        </div>
        {authEnabled ? (
          <div className="space-y-2">
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => signIn(p.providerId, { callbackURL: "/account" })}
              >
                Continue with {p.label}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Sign-in is disabled.</p>
        )}
      </div>
    </main>
  );
}
