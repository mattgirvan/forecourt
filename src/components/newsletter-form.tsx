import { Link } from "@tanstack/react-router";
import { useId, useState, type FormEvent } from "react";

/**
 * Newsletter sign-up. Double opt-in: this only asks for a confirmation email.
 * Consent box starts unticked and is required (PECR, UK GDPR).
 */
export function NewsletterForm({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!consent) {
      setNote({ ok: false, text: "Tick the box to say you want the emails." });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent, company }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      const ok = Boolean(res.ok && data?.ok);
      setNote({
        ok,
        text: data?.message ?? (ok ? "Check your inbox." : "Could not sign you up just now. Try again in a bit."),
      });
      if (ok) {
        setEmail("");
        setConsent(false);
      }
    } catch {
      setNote({ ok: false, text: "Could not reach us just now. Try again in a bit." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate={false} className="nl-form w-full min-w-0" aria-describedby={`${id}-note`}>
      <div className={compact ? "flex flex-col gap-2" : "flex flex-col gap-2 sm:flex-row"}>
        <label htmlFor={`${id}-email`} className="sr-only">
          Work email
        </label>
        <input
          id={`${id}-email`}
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          placeholder="you@dealership.co.uk"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-11 w-full min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-[15px] text-fg placeholder:text-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30"
        />
        <button
          type="submit"
          disabled={busy}
          className="nl-btn cta-amber min-h-11 shrink-0 rounded-full border px-5 text-[15px] font-medium disabled:opacity-60"
        >
          {busy ? "Sending" : "Sign up"}
        </button>
      </div>
      <div aria-hidden="true" className="nl-hp">
        <label htmlFor={`${id}-company`}>Company</label>
        <input
          id={`${id}-company`}
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>
      <label htmlFor={`${id}-consent`} className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-muted">
        <input
          id={`${id}-consent`}
          type="checkbox"
          name="consent"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-current"
        />
        <span>
          Yes, email me Forecourt product news and updates. We will send a link to confirm first. Unsubscribe any
          time from any email. See our{" "}
          <Link to="/privacy" className="text-fg underline underline-offset-4">
            privacy notice
          </Link>
          .
        </span>
      </label>
      <p id={`${id}-note`} role="status" aria-live="polite" className={`nl-note mt-2 min-h-5 text-[13px] ${note ? "is-on" : ""} ${note && !note.ok ? "text-fg" : "text-muted"}`}>
        {note?.text ?? ""}
      </p>
    </form>
  );
}
