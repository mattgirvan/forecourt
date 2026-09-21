import { createFileRoute } from "@tanstack/react-router";
import { PhrasePage } from "@/components/for/phrase-page";
import { pageHead } from "@/lib/seo";

const TITLE = "Car photo status for dealership stock | Forecourt";
const DESCRIPTION =
  "Know if a car is on the ramp, in the studio, or done. Forecourt photo status stops stock waiting on a WhatsApp thread.";

export const Route = createFileRoute("/for/photo-status")({
  component: PhotoStatusPage,
  head: () =>
    pageHead({
      title: TITLE,
      description: DESCRIPTION,
      path: "/for/photo-status",
    }),
});

function PhotoStatusPage() {
  return (
    <PhrasePage
      eyebrow="Photo status"
      h1="Photo status the floor can trust"
      lead="Listing waiting on a WhatsApp photo thread again? Forecourt shows photo status on the floor, on the ramp, in the studio, done, so stock does not stall."
      points={[
        {
          title: "On the ramp, in the studio, done",
          line: "The floor sees photo status without opening a chat thread.",
        },
        {
          title: "Beside your CRM",
          line: "Your stock book stays where it is. Photo progress sits on the desk next to it.",
        },
      ]}
      ctaLabel="See it on a desk at forecourt.me"
      links={[
        { to: "/for/beside-crm", label: "Beside your CRM" },
        { to: "/pricing", label: "Pricing" },
      ]}
    />
  );
}
