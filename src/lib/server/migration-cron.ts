/**
 * Daily migration check (PR 8). Moves every downgrade whose period end has
 * passed on to "Price changed" and sends that email once. Called by pg_cron
 * (forecourt-golive/group/08-migration-cron.sql) with
 * Authorization: Bearer <secret>. The secret is generated inside the database
 * and kept in Supabase Vault (name migration_cron_secret); the route checks it
 * with the service-role-only RPC public.migration_cron_secret_matches, so no
 * Vercel env var is needed. MIGRATION_CRON_SECRET in env is an optional
 * fallback only. Fails closed on any RPC error. Safe to run any number of
 * times: the stage write only wins once and email_log dedupes the email.
 */
import { finishDueScheduledChanges } from "@/lib/server/plan-change-schedule";
import { timingSafeEqual } from "node:crypto";
import { openMigrations } from "@/lib/server/migration-store";
import { catchUp } from "@/lib/server/migration-catchup";
import { sbAdmin } from "@/lib/server/staff-actor";
import { jsonResponse } from "@/lib/server/build-api";

/** Optional env fallback: constant-time compare against MIGRATION_CRON_SECRET. */
export function cronAuthorised(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const want = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header ?? "");
  return got.length === want.length && timingSafeEqual(got, want);
}

/** The token after "Bearer ", or null. */
export function bearerToken(header: string | null): string | null {
  const m = /^Bearer ([^\s]+)$/.exec(header ?? "");
  return m ? m[1] : null;
}

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

/** Vault check through the service-role RPC. Any error or non-true answer is a no. */
export async function vaultAuthorised(sb: Rpc, header: string | null): Promise<boolean> {
  const token = bearerToken(header);
  if (!token) return false;
  try {
    const { data, error } = await sb.rpc("migration_cron_secret_matches", { candidate: token });
    if (error) {
      console.error("[cron migrations] secret check failed");
      return false;
    }
    return data === true;
  } catch {
    console.error("[cron migrations] secret check threw");
    return false;
  }
}

export async function handleMigrationCron(request: Request): Promise<Response> {
  const sb = sbAdmin();
  if (!sb) return jsonResponse({ error: "No service role on the server, so nothing ran." }, 503);
  const header = request.headers.get("authorization");
  const ok = cronAuthorised(header, process.env.MIGRATION_CRON_SECRET) || (await vaultAuthorised(sb, header));
  if (!ok) return jsonResponse({ error: "Not allowed." }, 401);
  // Backup for the webhook: land booked plan changes whose period end has passed.
  const landed = await finishDueScheduledChanges(sb);
  const rows = await openMigrations(sb);
  let moved = 0;
  for (const r of rows) {
    const after = await catchUp(sb, r);
    if (after.migration_stage !== r.migration_stage) moved++;
  }
  return jsonResponse({ checked: rows.length, moved, landed });
}
