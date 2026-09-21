import { createFileRoute, redirect } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/pilot")({
  beforeLoad: () => {
    throw redirect({ to: "/pricing" });
  },
  head: () =>
    pageHead({
      title: "Start a Forecourt pilot on one site | Forecourt",
      description:
        "Put your dealership name on a working desk. Sixty day site trial options and a path to go live beside your CRM.",
      path: "/pilot",
    }),
  component: () => null,
});
