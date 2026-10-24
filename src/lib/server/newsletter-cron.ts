/**
 * Daily newsletter launch sequence run. GET from Vercel Cron (vercel.json),
 * which sends Authorization: Bearer <CRON_SECRET>. Also accepts the same
 * secrets as /api/cron/migrations (MIGRATION_CRON_SECRET, or the Vault
 * secret checked by migration_cron_secret_matches), so it can be run by hand
 * or by pg_cron. Anything else gets 401, before the flag is even read.
 * Does nothing unless NEWSLETTER_SEQUENCE_ENABLED is exactly "true".
 */
import { env } from "@/lib/env.server";
import { jsonResponse } from "@/lib/server/build-api";
import { sbAdmin } from "@/lib/server/staff-actor";
import { cronAuthorised, vaultAuthorised } from "@/lib/server/migration-cron";
import { newsletterConfig } from "@/lib/server/newsletter-api";
import { runSequence, sequenceEnabled } from "@/lib/server/newsletter-sequence";
import { supabaseSequenceStore } from "@/lib/server/newsletter-sequence-store";

export async function handleNewsletterCron(request: Request): Promise<Response> {
  const sb = sbAdmin();
  if (!sb) return jsonResponse({ error: "No service role on the server, so nothing ran." }, 503);
  const header = request.headers.get("authorization");
  const ok =
    cronAuthorised(header, env("CRON_SECRET")) ||
    cronAuthorised(header, env("MIGRATION_CRON_SECRET")) ||
    (await vaultAuthorised(sb, header));
  if (!ok) return jsonResponse({ error: "Not allowed." }, 401);
  const result = await runSequence({
    enabled: sequenceEnabled(env("NEWSLETTER_SEQUENCE_ENABLED")),
    config: newsletterConfig(),
    fetch: (u, i) => fetch(u, i),
    store: supabaseSequenceStore(sb),
  });
  return jsonResponse(result, result.ok ? 200 : 503);
}
