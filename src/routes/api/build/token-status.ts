import { createFileRoute } from "@tanstack/react-router";
import {
  getTokenStatusForStaff,
  jsonResponse,
  readJsonBody,
} from "@/lib/server/build-api";

/**
 * Staff Token chip + diagnostic — TanStack *route* server handler (same
 * bundling path as /api/stripe/webhook), NOT createServerFn.
 */
export const Route = createFileRoute("/api/build/token-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await readJsonBody<{ token?: string }>(request);
          const token = typeof body.token === "string" ? body.token : "";
          if (!token) return jsonResponse({ error: "Sign in again." }, 401);
          const status = await getTokenStatusForStaff(token);
          return jsonResponse(status);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Could not check token.";
          const status = message === "Staff only." || message === "Sign in again." ? 403 : 500;
          return jsonResponse({ error: message }, status);
        }
      },
    },
  },
});
