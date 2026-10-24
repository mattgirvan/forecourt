import { createFileRoute } from "@tanstack/react-router";
import { NewsletterResult, statusFrom, type ResultCopy } from "@/components/newsletter-result";
import { pageHead } from "@/lib/seo";

const COPY: Record<string, ResultCopy> = {
  ok: {
    eyebrow: "Newsletter",
    title: "You are unsubscribed.",
    body: "You will not get any more Forecourt newsletters. Changed your mind? Sign up again from the footer.",
  },
  unavailable: {
    eyebrow: "Newsletter",
    title: "We could not do that automatically.",
    body: "Email hello@forecourt.me with the word unsubscribe and we will take you off by hand.",
  },
  error: {
    eyebrow: "Newsletter",
    title: "We could not unsubscribe you just now.",
    body: "Try the link again in a few minutes, or email hello@forecourt.me and we will do it by hand.",
  },
  invalid: {
    eyebrow: "Newsletter",
    title: "That link does not look right.",
    body: "Open it straight from the email, or email hello@forecourt.me and we will take you off by hand.",
  },
};

export const Route = createFileRoute("/newsletter/unsubscribed")({
  validateSearch: (s: Record<string, unknown>) => ({ status: statusFrom(s) }),
  component: Page,
  head: () => pageHead({ title: "Unsubscribe | Forecourt", description: "Unsubscribe from Forecourt emails.", path: "/newsletter/unsubscribed", noindex: true }),
});

function Page() {
  const { status } = Route.useSearch();
  return <NewsletterResult copy={COPY[status] ?? COPY.invalid} />;
}
