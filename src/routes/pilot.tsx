import { createFileRoute, Link } from "@tanstack/react-router";

import { useMemo, useState, type ReactNode } from "react";

import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/pilot")({ component: PilotPage });

const problems = [
  "Locator is tribal knowledge",
  "GP appears at month-end",
  "Customers chase the exec",
  "Used and new live in different sheets",
  "Handover checklist is six places or none",
];

type Form = {
  name: string;
  role: string;
  dealer: string;
  sites: string;
  email: string;
  problem: string;
  metric: string;
};

const empty: Form = {
  name: "",
  role: "Principal",
  dealer: "",
  sites: "1",
  email: "",
  problem: problems[0],
  metric: "Every live deal has a locator stage and a GP figure before month-end.",
};

export function PilotPage() {
  const [form, setForm] = useState<Form>(empty);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);

  const briefing = useMemo(() => {
    return [
      "FORECOURT — 60-day site trial",
      "",
      `From: ${form.name || "—"} (${form.role})`,
      `Dealer: ${form.dealer || "—"}`,
      `Sites: ${form.sites}`,
      `Email: ${form.email || "—"}`,
      `Worst month-end: ${form.problem}`,
      `Success metric: ${form.metric}`,
      "",
      "Ask: one site, 60 days, their brand on the glass.",
      "If the metric is true at day 60, the product stays.",
    ].join("\n");
  }, [form]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <SiteShell>
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">The ask</p>
          <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">
            A 60-day site trial.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted">
            One success number. Their brand on the glass. The briefing is still useful. The paid
            path is the account: sign in, drop the brand pack, pay £1,500 for one site. Franchise
            and group skip this — they start on a 12-month contract. Or write{" "}
            <a href="mailto:hello@forecourt.me" className="text-fg underline-offset-2 hover:underline">
              hello@forecourt.me
            </a>
            .
          </p>
          <Button className="mt-6" asChild>
            <Link to="/account" search={{ plan: "site", billing: "trial" }}>
              Pay the trial instead
            </Link>
          </Button>


          {sent ? (
            <div className="mt-10 rounded-lg border border-line bg-surface p-6">
              <h2 className="font-display text-2xl">Briefing ready.</h2>
              <pre className="mt-4 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted">
                {briefing}
              </pre>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(briefing);
                    setCopied(true);
                  }}
                >
                  {copied ? "Copied" : "Copy briefing"}
                </Button>
                <Button variant="secondary" type="button" onClick={() => setSent(false)}>
                  Edit
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="mt-10 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
              }}
            >
              <Field label="Name" htmlFor="name">
                <Input id="name" required value={form.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="Role" htmlFor="role">
                <Input id="role" value={form.role} onChange={(e) => set("role", e.target.value)} />
              </Field>
              <Field label="Dealer / group" htmlFor="dealer">
                <Input
                  id="dealer"
                  required
                  value={form.dealer}
                  onChange={(e) => set("dealer", e.target.value)}
                />
              </Field>
              <Field label="Number of sites" htmlFor="sites">
                <Input id="sites" value={form.sites} onChange={(e) => set("sites", e.target.value)} />
              </Field>
              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </Field>
              <div>
                <Label htmlFor="problem">Worst month-end problem</Label>
                <select
                  id="problem"
                  value={form.problem}
                  onChange={(e) => set("problem", e.target.value)}
                  className="mt-1.5 flex h-11 w-full rounded-sm border border-line bg-elevated px-3 text-sm text-fg outline-none focus:border-line-strong focus:ring-2 focus:ring-accent/30"
                >
                  {problems.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              <Field label="Success metric" htmlFor="metric">
                <Input id="metric" value={form.metric} onChange={(e) => set("metric", e.target.value)} />
              </Field>
              <Button type="submit">Generate briefing</Button>
            </form>
          )}
        </div>

        <aside className="rounded-lg border border-line bg-surface p-6">
          <h2 className="font-display text-2xl">Do not sell until this is done</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The live franchised build is a product prototype. This site is the packaging layer:
            brand-agnostic desk, tenant switcher, commercial story, site trial.
          </p>
          <ul className="mt-6 space-y-4 text-sm text-muted">
            <li>
              <span className="text-fg">Brand in config.</span> Logos and dealer copy must not live
              in the app file.
            </li>
            <li>
              <span className="text-fg">Split the desk.</span> Overview, dealer, and customer are
              separate surfaces.
            </li>
            <li>
              <span className="text-fg">Ingest is an adapter.</span> Core is upsert-by-VIN from any
              source.
            </li>
            <li>
              <span className="text-fg">One database per client</span> until RLS-by-tenant exists.
            </li>
            <li>
              <span className="text-fg">Legal.</span> Manufacturer marks cannot ship. Credentials
              stay on the client’s account.
            </li>
          </ul>
        </aside>
      </div>
    </SiteShell>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;

}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
