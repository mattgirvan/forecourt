import { createFileRoute } from "@tanstack/react-router";
import { PhrasePage } from "@/components/for/phrase-page";
import { pageHead } from "@/lib/seo";

const TITLE = "Customer live order tracking for car dealerships | Forecourt";
const DESCRIPTION =
  "Let the customer open their order and see it live. Fewer chasing calls. Forecourt sits beside your CRM for UK motor trade desks.";

export const Route = createFileRoute("/for/customer-live-track")({
  component: CustomerLiveTrackPage,
  head: () =>
    pageHead({
      title: TITLE,
      description: DESCRIPTION,
      path: "/for/customer-live-track",
    }),
});

function CustomerLiveTrackPage() {
  return (
    <PhrasePage
      eyebrow="Customer live track"
      h1="Any update on my car, answered without the switchboard"
      lead="If the customer can open their order and see it live, the sales exec stops being a switchboard. That is a gap a CRM was never built for. Forecourt sits beside it."
      points={[
        {
          title: "Customer opens their own order",
          line: "They see the car and progress without calling the showroom.",
        },
        {
          title: "Fewer chasing calls",
          line: "The exec is not reading status codes aloud all day.",
        },
        {
          title: "Beside your CRM",
          line: "Deal paperwork stays in the CRM. Live track sits on the floor desk next to it.",
        },
      ]}
      ctaLabel="Open a desk with your name on forecourt.me"
      links={[
        { to: "/for/beside-crm", label: "Beside your CRM" },
        { to: "/contact", label: "Contact" },
      ]}
    />
  );
}
