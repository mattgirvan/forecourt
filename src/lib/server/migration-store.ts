/**
 * Migration tracker storage (PR 8). Takes a Supabase client, never throws.
 * Every write goes to plan_changes.migration_* columns from
 * group/08-migration-tracker.sql. Until that SQL is run the writes fail
 * quietly and callers fall back to the PR 5 behaviour (no tracker, the old
 * plan changed email).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { advance, trackerFor, type MigrationRow, type MigrationStage } from "@/lib/migration";

export const MIGRATION_COLS = "id, tenant_id, from_plan, to_plan, status, direction, setup_diff_pence, new_monthly_pence, migration_stage, stage_times, effective_at, migration_cancelled_at, created_at";
export type StoredMigration = MigrationRow & { tenant_id: number; direction: string; setup_diff_pence: number; new_monthly_pence: number };

/** Move a plan change to `stage`. Returns false when the columns are missing or the write failed. */
export async function setMigrationStage(sb: SupabaseClient, row: StoredMigration, stage: MigrationStage, extra: Record<string, unknown> = {}): Promise<boolean> {
  try {
    const at = new Date().toISOString();
    // Only moves on from the stage this row was read at, so two runs (page view and the
    // daily check) cannot both win and both send the email.
    const q = sb.from("plan_changes").update({ ...advance(row, stage, at), ...extra }).eq("id", row.id);
    const { data, error } = await (row.migration_stage ? q.eq("migration_stage", row.migration_stage) : q.is("migration_stage", null)).select("id");
    return !error && (data ?? []).length > 0;
  } catch {
    return false;
  }
}

export async function readMigration(sb: SupabaseClient, changeId: number): Promise<StoredMigration | null> {
  try {
    const { data, error } = await sb.from("plan_changes").select(MIGRATION_COLS).eq("id", changeId).maybeSingle();
    return error ? null : ((data as StoredMigration | null) ?? null);
  } catch {
    return null;
  }
}

/** The account's open migration, newest first; null when there is none or the SQL is not run yet. */
export async function openMigrationFor(sb: SupabaseClient, tenantId: number): Promise<StoredMigration | null> {
  try {
    const { data, error } = await sb
      .from("plan_changes")
      .select(MIGRATION_COLS)
      .eq("tenant_id", tenantId)
      .not("migration_stage", "is", null)
      .neq("migration_stage", "complete")
      .is("migration_cancelled_at", null)
      .in("status", ["pending_payment", "paid", "requested", "applied", "scheduled"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return null;
    const row = ((data ?? [])[0] as StoredMigration | undefined) ?? null;
    return row && trackerFor(row)?.open ? row : null;
  } catch {
    return null;
  }
}

export async function openMigrations(sb: SupabaseClient): Promise<StoredMigration[]> {
  try {
    const { data, error } = await sb
      .from("plan_changes")
      .select(MIGRATION_COLS)
      .not("migration_stage", "is", null)
      .neq("migration_stage", "complete")
      .is("migration_cancelled_at", null)
      .in("status", ["pending_payment", "paid", "requested", "applied", "scheduled"])
      .order("created_at", { ascending: false });
    return error ? [] : ((data ?? []) as StoredMigration[]);
  } catch {
    return [];
  }
}
