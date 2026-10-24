/**
 * Daily migration check (PR 8). Moves every downgrade whose period end has
 * passed on to "Price changed" and sends that email once. Called by pg_cron
 * (forecourt-golive/group/08-migration-cron.sql) with
 * Authorization: Bearer MIGRATION_CRON_SECRET. Safe to run any number of
 * times: the stage write only wins once and email_log dedupes the email.
 */
import { timingSafeEqual } from "node:crypto";
import { openMigrations } from "@/lib/server/migration-store";
import { catchUp } from "@/lib/server/migration-catchup";
import { sbAdmin } from "@/lib/server/staff-actor";
import { jsonResponse } from "@/lib/server/build-api";

export function cronAuthorised(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const want = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header ?? "");
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function handleMigrationCron(request: Request): Promise<Response> {
  const secret = process.env.MIGRATION_CRON_SECRET;
  if (!secret) return jsonResponse({ error: "MIGRATION_CRON_SECRET is not set, so nothing ran." }, 503);
  if (!cronAuthorised(request.headers.get("authorization"), secret)) return jsonResponse({ error: "Not allowed." }, 401);
  const sb = sbAdmin();
  if (!sb) return jsonResponse({ error: "No service role on the server, so nothing ran." }, 503);
  const rows = await openMigrations(sb);
  let moved = 0;
  for (const r of rows) {
    const after = await catchUp(sb, r);
    if (after.migration_stage !== r.migration_stage) moved++;
  }
  return jsonResponse({ checked: rows.length, moved });
}
