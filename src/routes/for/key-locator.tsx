import { createFileRoute } from "@tanstack/react-router";
import { PhrasePage } from "@/components/for/phrase-page";
import { pageHead } from "@/lib/seo";

const TITLE = "Car dealer key locator beside your CRM | Forecourt";
const DESCRIPTION =
  "Car dealer key locator beside your CRM for UK motor trade showrooms. Track keys in the cabinet, with PDI, or on the floor.";

export const Route = createFileRoute("/for/key-locator")({
  component: KeyLocatorPage,
  head: () =>
    pageHead({
      title: TITLE,
      description: DESCRIPTION,
      path: "/for/key-locator",
    }),
});

function KeyLocatorPage() {
  return (
    <PhrasePage
      eyebrow="Key locator"
      h1="Keys without the showroom shout"
      lead="Cabinet. With PDI. Unknown. That unknown is where half an hour goes. Forecourt puts key location on the desk beside your CRM so the host is not hunting."
      points={[
        {
          title: "On the desk, not across the floor",
          line: "Cabinet, with PDI, or unknown. The host should not have to shout across the showroom.",
        },
        {
          title: "Beside the CRM you already run",
          line: "Stock book stays in your CRM. Key location lives on the floor screen next to it.",
        },
      ]}
      ctaLabel="Book a call"
      links={[
        { to: "/for/beside-crm", label: "Beside your CRM" },
        { to: "/how", label: "How it works" },
      ]}
    />
  );
}
