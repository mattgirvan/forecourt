import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CONTACT_ROLES,
  CONTACT_SITES,
  CONTACT_TOPICS,
  contactBodySchema,
} from "@/lib/contact";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

const fieldClass =
  "flex h-11 w-full rounded-2xl border border-line bg-elevated px-4 text-sm text-fg outline-none transition-colors focus:border-line-strong focus:ring-2 focus:ring-accent/30";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dealership, setDealership] = useState("");
  const [role, setRole] = useState("");
  const [sites, setSites] = useState("");
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = contactBodySchema.safeParse({
      name,
      email,
      phone,
      dealership,
      role,
      sites,
      topic,
      message,
      website,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || body.error) {
        setError(body.error ?? "Could not send. Try again, or email " + SITE.email + ".");
        return;
      }
      setDone(true);
    } catch {
      setError("Could not reach the server. Email " + SITE.email + " instead.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div
        id="form"
        className="rounded-[1.75rem] border border-line bg-surface p-7 sm:p-9"
      >
        <p className="text-[13px] font-medium text-muted">Sent</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Thanks. We have it.</h2>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
          A note lands at {SITE.email}. We will reply to {email || "your work email"} when we can.
        </p>
      </div>
    );
  }

  return (
    <form
      id="form"
      onSubmit={onSubmit}
      className="relative rounded-[1.75rem] border border-line bg-surface p-7 sm:p-9"
      noValidate
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" htmlFor="contact-name" required>
          <Input
            id="contact-name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        <Field label="Work email" htmlFor="contact-email" required>
          <Input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Phone" htmlFor="contact-phone" hint="Optional">
          <Input
            id="contact-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label="Dealership / group" htmlFor="contact-dealership" required>
          <Input
            id="contact-dealership"
            name="dealership"
            autoComplete="organization"
            value={dealership}
            onChange={(e) => setDealership(e.target.value)}
            required
          />
        </Field>
        <Field label="Role" htmlFor="contact-role" required>
          <select
            id="contact-role"
            name="role"
            className={fieldClass}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
          >
            <option value="">Pick one</option>
            {CONTACT_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sites" htmlFor="contact-sites" required>
          <select
            id="contact-sites"
            name="sites"
            className={fieldClass}
            value={sites}
            onChange={(e) => setSites(e.target.value)}
            required
          >
            <option value="">Pick one</option>
            {CONTACT_SITES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="What this is about" htmlFor="contact-topic" required>
            <select
              id="contact-topic"
              name="topic"
              className={fieldClass}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              required
            >
              <option value="">Pick one</option>
              {CONTACT_TOPICS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Message" htmlFor="contact-message" required>
            <textarea
              id="contact-message"
              name="message"
              rows={5}
              className={cn(fieldClass, "h-auto resize-y rounded-2xl py-3")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </Field>
        </div>
      </div>

      {/* Honeypot: hidden from people, visible to naive bots. */}
      <div className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error ? <p className="mt-5 text-sm text-bad">{error}</p> : null}

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy} className="cta-amber rounded-full">
          {busy ? "Sending…" : "Send enquiry"}
        </Button>
        <p className="text-xs text-subtle">
          Or write {SITE.email} if the form is stuck.
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {required ? " *" : ""}
        </Label>
        {hint ? <span className="text-[11px] text-subtle">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}
