import { createFileRoute } from "@tanstack/react-router";
import { env } from "@/lib/env.server";
import { jsonResponse } from "@/lib/server/build-api";
import { actor } from "@/lib/server/staff-actor";
import { bearerToken } from "@/lib/server/migration-cron";
import { newsletterConfig } from "@/lib/server/newsletter-api";
import { createMonthlyDraft, sequenceEnabled } from "@/lib/server/newsletter-sequence";

/**
 * Owner only. POST { slots: { MONTH: "November", ... }, name?: string } with
 * Authorization: Bearer <the owner's signed-in access token>. Creates the
 * monthly newsletter as a Resend Broadcast DRAFT. Never sends or schedules.
 */
export const Route = createFileRoute("/api/newsletter/monthly-draft")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = bearerToken(request.headers.get("authorization"));
        if (!token) return jsonResponse({ error: "Not allowed." }, 401);
        try {
          const who = await actor(token);
          if (!who.team || who.role !== "owner") return jsonResponse({ error: "Owner only." }, 403);
        } catch {
          return jsonResponse({ error: "Not allowed." }, 401);
        }
        let body: { slots?: Record<string, string>; name?: string };
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Send JSON with a slots object." }, 400);
        }
        try {
          const r = await createMonthlyDraft(
            { enabled: sequenceEnabled(env("NEWSLETTER_SEQUENCE_ENABLED")), config: newsletterConfig(), fetch: (u, i) => fetch(u, i) },
            body.slots ?? {},
            typeof body.name === "string" ? body.name.slice(0, 120) : undefined,
          );
          return jsonResponse(r, r.ok ? 200 : r.status);
        } catch (e) {
          console.error("[newsletter draft] unhandled", e instanceof Error ? e.message : e);
          return jsonResponse({ error: "Could not create the draft." }, 500);
        }
      },
    },
  },
});
