import { createFileRoute } from "@tanstack/react-router";
import {
  executeSendToBuild,
  jsonResponse,
  readJsonBody,
} from "@/lib/server/build-api";

/**
 * Send to build — route server handler so GH_TEMPLATE_TOKEN is visible the
 * same way Stripe webhook secrets are. Do not run scaffold via createServerFn.
 */
export const Route = createFileRoute("/api/build/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await readJsonBody<{ token?: string; tenantId?: number }>(request);
          const token = typeof body.token === "string" ? body.token : "";
          const tenantId = Number(body.tenantId);
          if (!token) return jsonResponse({ error: "Sign in again." }, 401);
          if (!Number.isFinite(tenantId) || tenantId <= 0) {
            return jsonResponse({ error: "No order." }, 400);
          }
          const result = await executeSendToBuild(token, tenantId);
          return jsonResponse(result);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Could not send.";
          const status =
            message === "Sign in again." || message.startsWith("Only staff")
              ? 403
              : message.includes("not configured") || message.includes("Desk scaffold is not configured")
                ? 503
                : 400;
          return jsonResponse({ error: message }, status);
        }
      },
    },
  },
});
