import { createFileRoute } from "@tanstack/react-router";
import { handleNewsletterCron } from "@/lib/server/newsletter-cron";
import { jsonResponse } from "@/lib/server/build-api";

/** Daily launch sequence run. See src/lib/server/newsletter-cron.ts. */
async function run(request: Request) {
  try {
    return await handleNewsletterCron(request);
  } catch (e) {
    console.error("[cron newsletter] unhandled", e instanceof Error ? e.message : e);
    return jsonResponse({ error: "Newsletter run failed." }, 500);
  }
}

export const Route = createFileRoute("/api/cron/newsletter")({
  server: { handlers: { GET: ({ request }) => run(request), POST: ({ request }) => run(request) } },
});
