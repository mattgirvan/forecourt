import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ContactPromo } from "@/components/contact-promo";
import { SeatMatrix } from "@/components/trust/seat-matrix";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { LEGAL } from "@/lib/legal";
import { SITE } from "@/lib/site";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/trust")({
  component: TrustPage,
  head: () =>
    pageHead({
      title: "Trust and how Forecourt works with your CRM | Forecourt",
      description:
        "Built for franchise and group desks. Your stock stays yours. Forecourt sits beside the CRM and DMS you already pay for.",
      path: "/trust",
    }),
});

function TrustPage() {
  return (
    <SiteShell>
      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <p className="text-[13px] font-medium text-muted">Trust</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Your rooftop. Your database.
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted">
            Plain English on how Forecourt keeps one dealer&apos;s desk apart from another&apos;s.
          </p>
        </Reveal>

        <div className="mt-12 space-y-4">
          <Section title="One rooftop, one database">
            <p>
              Your live desk and stock sit in their own Supabase project. We do not share the John Clark
              Aberdeen database (or any other dealer&apos;s) with you or with anyone else.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-elevated/50 px-4 py-3 text-sm">
                <div className="text-[11px] uppercase tracking-[0.12em] text-subtle">Dealer A</div>
                <div className="mt-1 font-medium">Own database</div>
              </div>
              <div className="rounded-2xl border border-line bg-elevated/50 px-4 py-3 text-sm">
                <div className="text-[11px] uppercase tracking-[0.12em] text-subtle">Dealer B</div>
                <div className="mt-1 font-medium">Own database</div>
              </div>
            </div>
          </Section>

          <Section title="Staff only see what their seat allows">
            <p>
              Seats are few on purpose. A showroom host is not an Administrator seat. The Forecourt team
              uses a separate staff door, not a seat inside your desk.{" "}
              <Link to="/pricing" className="underline-offset-4 hover:underline">
                See who sees what on Pricing
              </Link>
              .
            </p>
            <div className="mt-6">
              <SeatMatrix />
            </div>
          </Section>

          <Section title="Customer glass is invitation-only">
            <p>
              Buyers get a magic link. They only see their own order, not your stock book, not someone
              else&apos;s deal.
            </p>
          </Section>

          <Section title="What we never do">
            <ul className="list-disc space-y-2 pl-5">
              <li>Never put full card numbers in the desk.</li>
              <li>Never mix two dealers in one database.</li>
              <li>Never use your book to train a model or prospect another site.</li>
            </ul>
          </Section>

          <Section title="Who we are">
            <p>
              {LEGAL.who}. {LEGAL.jurisdiction}, {LEGAL.country}.{" "}
              <a href={`mailto:${SITE.email}`} className="underline-offset-4 hover:underline">
                {SITE.email}
              </a>
              .
            </p>
            {/* TODO(Atlas): company footing when Matt has Ltd */}
            <p className="mt-3 text-xs text-subtle">Company footing to follow if we incorporate.</p>
          </Section>
        </div>
      </article>

      <ContactPromo
        eyebrow="Still have a question"
        title="Happy to spell out how isolation works for your group."
        body="Send a short note. We reply from hello@forecourt.me."
      />
    </SiteShell>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[1.75rem] border border-line bg-surface p-6 sm:p-8">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}
