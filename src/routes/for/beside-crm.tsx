import { createFileRoute } from "@tanstack/react-router";
import { PhrasePage } from "@/components/for/phrase-page";
import { pageHead } from "@/lib/seo";

const TITLE = "Beside your CRM, not instead of it | Forecourt";
const DESCRIPTION =
  "Your CRM keeps the book. Forecourt keeps the floor moving. Stock book and deal paperwork stay where they are. The gaps the floor feels every day get a desk screen next to the system you already pay for.";

export const Route = createFileRoute("/for/beside-crm")({
  component: BesideCrmPage,
  head: () =>
    pageHead({
      title: TITLE,
      description: DESCRIPTION,
      path: "/for/beside-crm",
    }),
});

function BesideCrmPage() {
  return (
    <PhrasePage
      eyebrow="Beside your CRM"
      h1="Beside your CRM, not instead of it"
      lead="Your CRM keeps the book. Forecourt keeps the floor moving. Stock book and deal paperwork stay where they are. The gaps the floor feels every day get a desk screen next to the system you already pay for."
      points={[
        { title: "Universal smart key locator" },
        { title: "Car photo status" },
        { title: "Where the car is (factory, boat, compound, yard)" },
        { title: "Customer live order track and customer to-do list" },
        { title: "Staff to-dos, hosts and progressors, daily digests" },
      ]}
      ctaLabel="Open a desk with your name on forecourt.me"
      links={[
        { to: "/how", label: "How it works" },
        { to: "/pricing", label: "Pricing" },
      ]}
    />
  );
}
