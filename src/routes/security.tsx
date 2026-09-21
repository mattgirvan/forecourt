import { createFileRoute, redirect } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/security")({
  beforeLoad: () => {
    throw redirect({ to: "/trust" });
  },
  head: () =>
    pageHead({
      title: "Security at Forecourt | Forecourt",
      description:
        "How Forecourt protects dealership data while staff run the floor desk beside your CRM.",
      path: "/security",
    }),
  component: () => null,
});
