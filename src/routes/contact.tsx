import { createFileRoute, Link } from "@tanstack/react-router";
import { ContactForm } from "@/components/contact-form";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => ({
    meta: [
      { title: `Contact · ${SITE.name}` },
      {
        name: "description",
        content:
          "Ask about a trial, group pricing, or something that does not fit the packaged plans. We reply from hello@forecourt.me.",
      },
    ],
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
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted">
            Prefer packages first?{" "}
            <Link to="/pricing" className="text-fg underline-offset-4 hover:underline">
              See pricing
            </Link>
            .
          </p>
        </Reveal>

        <div className="relative mt-12">
          <ContactForm />
        </div>
      </section>
    </SiteShell>
  );
}
