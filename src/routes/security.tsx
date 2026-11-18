import { createFileRoute, redirect } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/security")({
  beforeLoad: () => {
    throw redirect({ to: "/trust", statusCode: 301 });
  },
  head: () =>
    pageHead({
      title: "Security | Forecourt.me",
      description:
        "How Forecourt.me protects dealership data while staff run the floor desk beside your CRM.",
      path: "/security",
    }),
  component: () => null,
});
