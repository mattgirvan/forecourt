import { createFileRoute } from "@tanstack/react-router";
import { tokenRedirect } from "@/lib/server/newsletter-api";

export const Route = createFileRoute("/api/newsletter/confirm")({
  server: { handlers: { GET: ({ request }) => tokenRedirect(request, "c") } },
});
