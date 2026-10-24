import { createFileRoute } from "@tanstack/react-router";
import { subscribePost } from "@/lib/server/newsletter-api";

export const Route = createFileRoute("/api/newsletter/subscribe")({
  server: { handlers: { POST: ({ request }) => subscribePost(request) } },
});
