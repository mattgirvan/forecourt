import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteShell } from "@/components/site-shell";
import { LEGAL } from "@/lib/legal";

export const Route = createFileRoute("/dpa")({ component: DpaPage });

function DpaPage() {
  return (
    <SiteShell>
      <article className="legal-copy mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="text-[13px] font-medium text-muted">Data processing</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">When we hold your customers.</h1>
        <p className="mt-4 text-sm text-muted">
          Last updated 16 September 2026. This is the addendum that sits on the{" "}
          <Link to="/terms">terms</Link> the day a desk goes live.
        </p>

        <h2>Roles</h2>
        <p>
          You are the controller. {LEGAL.who} is the processor. That is UK GDPR Article 28. We only process
          personal data on your desk to provide Forecourt (stock, deals, locator, customer glass, staff
          logins) and to keep it up.
        </p>

        <h2>What</h2>
        <p>
          Staff names, emails, roles. Customer names, contact details, deal notes, finance flags, vehicle
          identifiers you put in. Whatever your people type, and whatever an ingest drops in. We do not want
          special-category data. Do not put medical or Motability adaptation detail in a free-text field if
          you can help it.
        </p>

        <h2>Instructions</h2>
        <p>
          Your instruction is: run the desk, take backups we need to restore it, delete it when the contract
          ends. We will not use your book to train a model, prospect another dealer, or mix it with another
          site.
        </p>

        <h2>People</h2>
        <p>
          Only Forecourt staff who are working your order. They sign in through the office. Operators cannot
          add other staff. You can ask us who has access.
        </p>

        <h2>Sub-processors</h2>
        <p>Supabase (database and auth for that desk), Vercel (hosting), Stripe (your Forecourt invoice, not your customer’s finance). We will tell you if that list grows in a way that touches personal data.</p>

        <h2>Where</h2>
        <p>
          We prefer the UK or EEA. If a sub-processor is outside, we use the approved UK addendum / EU
          standard contractual clauses. Ask and we will say which region your desk is in.
        </p>

        <h2>Security</h2>
        <p>
          Separate database per desk. Sign-in by code. Encryption in transit. We do not share Aberdeen’s
          project, or anyone else’s, with you.
        </p>

        <h2>Breach</h2>
        <p>If we know of a personal-data breach on your desk we will tell you without undue delay, with what we know.</p>

        <h2>Help</h2>
        <p>
          We will help with access requests and ICO questions that relate to the desk, within reason, at our
          then-current time. Huge forensic dumps are a project, not a button.
        </p>

        <h2>End</h2>
        <p>
          On request at the end of the contract we will export what the product can export, then delete the
          desk, unless the law says keep a slice (invoices). Backups roll off on their normal cycle.
        </p>
      </article>
    </SiteShell>
  );
}
