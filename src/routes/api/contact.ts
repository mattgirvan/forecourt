import { createFileRoute } from "@tanstack/react-router";
import { handleContactPost } from "@/lib/server/contact-api";
import { jsonResponse } from "@/lib/server/build-api";

/**
 * Public contact / enquiry. Same route-handler path as Stripe webhook and
 * /api/build/* so RESEND_API_KEY and SUPABASE_SERVICE_ROLE_KEY are readable.
 */
export const Route = createFileRoute("/api/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleContactPost(request);
        } catch (e) {
          console.error("[contact] unhandled", e instanceof Error ? e.message : e);
          return jsonResponse(
            { error: "Could not send your enquiry just now. Email hello@forecourt.me or try again." },
            500,
          );
        }
      },
    },
  },
});
