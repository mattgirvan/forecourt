import { createFileRoute, Link } from "@tanstack/react-router";
import { ContactForm } from "@/components/contact-form";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { SITE } from "@/lib/site";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () =>
    pageHead({
      title: "Contact Forecourt | Car dealer and motor trade",
      description:
        "Ask about a UK car dealer trial, motor trade group pricing, or sitting beside your CRM. Replies from hello@forecourt.me.",
      path: "/contact",
    }),
});

function ContactPage() {
  return (
    <SiteShell>
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal className="text-center">
          <p className="text-[13px] font-medium text-muted">Contact</p>
          <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Plans can be fuzzy. Tell us what you need.
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted">
            Trial questions, franchise or group pricing, special requirements, or an integration
            note. This does not open a desk. It just starts a conversation at {SITE.email}.
          </p>
          <p className="mx-auto mt-3 max-w-lg text-base leading-relaxed text-muted">
            Or call{" "}
            <a href={`tel:${SITE.phoneE164}`} className="text-fg underline-offset-4 hover:underline">
              {SITE.phone}
            </a>
            .
          </p>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted">
            Prefer packages first?{" "}
            <Link to="/pricing" className="text-fg underline-offset-4 hover:underline">
              See pricing
            </Link>
            .
          </p>
          <p className="mx-auto mt-4 text-[13px] text-subtle">Scotland / UK</p>
        </Reveal>

        <div className="relative mt-12">
          <ContactForm />
        </div>
      </section>
    </SiteShell>
  );
}
