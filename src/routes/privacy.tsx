import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteShell } from "@/components/site-shell";
import { LEGAL } from "@/lib/legal";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });

function PrivacyPage() {
  return (
    <SiteShell>
      <article className="legal-copy mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="text-[13px] font-medium text-muted">Privacy</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">What we hold, and why.</h1>
        <p className="mt-4 text-sm text-muted">Last updated 16 September 2026. UK GDPR.</p>

        <h2>Who we are</h2>
        <p>
          {LEGAL.who} is the controller for this website ({SITE.domain}) and for the accounts of people who
          buy Forecourt. Inbox <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
        </p>
        <p>
          For a live desk, <strong>you</strong> (the dealership) are the controller of your staff and your
          customers. We are the processor. That relationship is in the <Link to="/dpa">data addendum</Link>.
        </p>

        <h2>What this site collects</h2>
        <ul>
          <li>Email, when you sign in (a code, not a password).</li>
          <li>Dealership name, legal name, phone, domain, people you name, notes you leave.</li>
          <li>Payment details via Stripe. We do not see full card numbers.</li>
          <li>Messages you send us on your account.</li>
          <li>Technical logs Vercel keeps to run the site.</li>
        </ul>
        <p>We do not sell this. We do not run advertising cookies. Sign-in cookies are strictly necessary.</p>

        <h2>The demo</h2>
        <p>
          The clickable demo is fiction (invented names, regs, and VINs) so you can see the desk. It is
          not live stock and it is not affiliated with the manufacturer whose colours you pick.
        </p>

        <h2>Lawful basis</h2>
        <p>
          Contract, for anyone who starts a package. Legitimate interests, for answering a message from a
          dealer who has not paid yet. Legal obligation, for invoices.
        </p>

        <h2>Who else sees it</h2>
        <ul>
          <li>Stripe: payments.</li>
          <li>Supabase: the account database, in a project we control.</li>
          <li>Vercel: hosting.</li>
          <li>Resend / our mailbox: sign-in codes, contact enquiries, and mail from hello@forecourt.me.</li>
        </ul>
        <p>A live desk is a separate database. Other dealers cannot read it. We do not put your book on a shared server with someone else.</p>

        <h2>How long</h2>
        <p>
          Account and invoices: for the life of the contract and then as long as tax law needs. Messages and
          notes: for the life of the account. Sign-in codes: minutes. When a trial dies and you do not
          convert, we take the desk down and delete that copy, except the invoice.
        </p>

        <h2>Your rights</h2>
        <p>
          Access, correction, deletion, restriction, objection, portability, and a complaint to the{" "}
          <a href="https://ico.org.uk" target="_blank" rel="noreferrer">
            ICO
          </a>
          . Email {LEGAL.email}. We will need to check it is you.
        </p>

        <h2>Children</h2>
        <p>Not for anyone under 18. A dealership is a business.</p>
      </article>
    </SiteShell>
  );
}
