import { createFileRoute } from "@tanstack/react-router";
import { NewsletterResult, statusFrom, type ResultCopy } from "@/components/newsletter-result";
import { pageHead } from "@/lib/seo";

const COPY: Record<string, ResultCopy> = {
  ok: {
    eyebrow: "Newsletter",
    title: "You are subscribed.",
    body: "Thanks for confirming. Every email has an unsubscribe link, so you can leave any time.",
  },
  expired: {
    eyebrow: "Newsletter",
    title: "That link has expired.",
    body: "Confirm links last 48 hours. Sign up again from the footer and we will send a fresh one.",
  },
  unavailable: {
    eyebrow: "Newsletter",
    title: "Sign-up is not open just yet.",
    body: "Nothing went wrong on your side. Email hello@forecourt.me and we will add you by hand.",
  },
  error: {
    eyebrow: "Newsletter",
    title: "We could not confirm that just now.",
    body: "Try the link again in a few minutes. If it keeps failing, email hello@forecourt.me.",
  },
  invalid: {
    eyebrow: "Newsletter",
    title: "That link does not look right.",
    body: "It may be incomplete. Open it straight from the email, or sign up again from the footer.",
  },
};

export const Route = createFileRoute("/newsletter/confirmed")({
  validateSearch: (s: Record<string, unknown>) => ({ status: statusFrom(s) }),
  component: Page,
  head: () => pageHead({ title: "Newsletter | Forecourt", description: "Confirm your Forecourt newsletter subscription.", path: "/newsletter/confirmed", noindex: true }),
});

function Page() {
  const { status } = Route.useSearch();
  return <NewsletterResult copy={COPY[status] ?? COPY.invalid} />;
}
