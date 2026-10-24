import { createFileRoute } from "@tanstack/react-router";
import { tokenRedirect, unsubscribeOneClick } from "@/lib/server/newsletter-api";

export const Route = createFileRoute("/api/newsletter/unsubscribe")({
  server: {
    handlers: {
      GET: ({ request }) => tokenRedirect(request, "u"),
      POST: ({ request }) => unsubscribeOneClick(request),
    },
  },
});
