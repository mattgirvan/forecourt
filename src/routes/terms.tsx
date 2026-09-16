import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteShell } from "@/components/site-shell";
import { LEGAL } from "@/lib/legal";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/terms")({ component: TermsPage });

function TermsPage() {
  return (
    <SiteShell>
      <article className="legal-copy mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="text-[13px] font-medium text-muted">Terms</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">How we work together.</h1>
        <p className="mt-4 text-sm text-muted">Last updated 16 September 2026. These terms are for businesses, not consumers.</p>

        <h2>Who you are buying from</h2>
        <p>
          You contract with {LEGAL.who}, in {LEGAL.jurisdiction}, {LEGAL.country}. Inbox{" "}
          <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. If Forecourt becomes a limited company, the
          same terms apply to that company and we will say so on the invoice.
        </p>

        <h2>Who this is for</h2>
        <p>
          Forecourt is sold to motor dealers and motor groups acting in the course of business. It is not a
          consumer product. The Consumer Contracts Regulations cooling-off period does not apply.
        </p>

        <h2>What you buy</h2>
        <p>
          A licence to use a Forecourt desk for the package you pay for — site, franchise, or group — plus
          the setup work to put your name, colours, stock ingest, and staff logins on it. We own the
          software. You own your data, your logo, and your customer records. Manufacturer names and logos
          stay with their owners. We are not affiliated with Škoda, Audi, Volkswagen, or any other franchise.
        </p>

        <h2>Packages</h2>
        <ul>
          <li>
            <strong>Site, 60-day trial</strong> — a paid pilot for one dealership. £1,500. Sales and
            management seats. If you convert to a site subscription inside 60 days, that £1,500 comes off
            setup. If you do not, the desk comes down. No refund once we have started standing it up.
          </li>
          <li>
            <strong>Site subscription</strong> — setup + monthly, month to month after any trial.
          </li>
          <li>
            <strong>Franchise and group</strong> — setup + monthly, <strong>12-month minimum</strong>. No
            trial. If you end it early, the remaining months are still due, unless we agree otherwise in
            writing.
          </li>
        </ul>
        <p>{LEGAL.vat}</p>

        <h2>How an order starts</h2>
        <p>
          You pay. The order files itself. We collect a brand pack (name, colours, people, domain, how cars
          come in). We clone our template — never another dealer’s desk — onto a private database and a
          private site. You preview. Then it goes live on your domain. Dates we give you are estimates, not
          guarantees.
        </p>

        <h2>Your responsibilities</h2>
        <p>
          You warrant you have the right to give us logos, staff names, manufacturer credentials, and
          customer data. You keep manufacturer portal logins in your name, not ours. You are the controller
          of your customers’ personal data. We process it only to run your desk — see the{" "}
          <Link to="/dpa">data addendum</Link>.
        </p>

        <h2>Isolation</h2>
        <p>
          One paying dealer, one database. We do not mix stock or deals with another rooftop. A group
          contract is still our software and your data, not a shared book with a different group.
        </p>

        <h2>Acceptable use</h2>
        <p>
          The desk is for running your dealership. No scraping other dealers, no stuffing it with data you
          have no right to hold, no resale of the software.
        </p>

        <h2>Liability</h2>
        <p>
          We are not your DMS, your accountant, or your manufacturer. GP figures are what your staff enter
          or what an ingest provides. We do not promise a particular sale, inspection pass, or compliance
          outcome. Our liability in any year is capped at the fees you paid us in the twelve months before
          the claim, except for death, personal injury, or fraud, which the law does not let us cap. We are
          not liable for lost deals, lost profit, or manufacturer portal downtime.
        </p>

        <h2>Ending it</h2>
        <p>
          Month-to-month: 30 days’ notice after any minimum term. 12-month: remaining months due. When it
          ends we will export what we reasonably can and then delete our copy of your desk, except records
          we must keep for tax. Stripe keeps its own payment records.
        </p>

        <h2>Law</h2>
        <p>
          Scots law. Courts of Scotland. If a court strikes one clause, the rest still holds. These terms
          plus the order on your account are the whole agreement.
        </p>
        <p className="text-sm text-muted">
          This is how we intend to trade. It is not a substitute for a solicitor reading a franchise
          contract. Questions: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
        </p>
      </article>
    </SiteShell>
  );
}
