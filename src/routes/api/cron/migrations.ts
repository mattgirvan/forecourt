import { createFileRoute } from "@tanstack/react-router";
import { handleMigrationCron } from "@/lib/server/migration-cron";
import { jsonResponse } from "@/lib/server/build-api";

/** Daily migration check, called by pg_cron. See src/lib/server/migration-cron.ts. */
export const Route = createFileRoute("/api/cron/migrations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleMigrationCron(request);
        } catch (e) {
          console.error("[cron migrations] unhandled", e instanceof Error ? e.message : e);
          return jsonResponse({ error: "Migration check failed." }, 500);
        }
      },
    },
  },
});
