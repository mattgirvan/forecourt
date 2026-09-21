import { createFileRoute } from "@tanstack/react-router";
import { PhrasePage } from "@/components/for/phrase-page";
import { pageHead } from "@/lib/seo";

const TITLE = "Dealership key locator beside your CRM | Forecourt";
const DESCRIPTION =
  "Stop shouting across the showroom for keys. Forecourt adds a universal smart key locator next to the CRM you already run.";

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
      ctaLabel="Try a named desk on forecourt.me"
      links={[
        { to: "/for/beside-crm", label: "Beside your CRM" },
        { to: "/how", label: "How it works" },
      ]}
    />
  );
}
