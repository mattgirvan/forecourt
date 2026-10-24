import type { SupabaseClient } from "@supabase/supabase-js";
import { migrationEvent } from "@/lib/account-events";
import { priceDue, trackerFor } from "@/lib/migration";
import { setMigrationStage, type StoredMigration } from "@/lib/server/migration-store";
import { sendAccountEventEmail } from "@/lib/server/journey-email";

/** Downgrade price step: moves on by itself once the period end has passed. */
export async function catchUp(sb: SupabaseClient, row: StoredMigration): Promise<StoredMigration> {
  const t = trackerFor(row);
  if (!t || !priceDue(t)) return row;
  if (!(await setMigrationStage(sb, row, "priced"))) return row;
  await sendAccountEventEmail({
    tenantId: row.tenant_id,
    ...migrationEvent({ changeId: row.id, from: t.from, to: t.to, stage: "priced", upgrade: false, newMonthlyPence: Number(row.new_monthly_pence) || 0 }),
  });
  return { ...row, migration_stage: "priced", stage_times: { ...(row.stage_times ?? {}), priced: new Date().toISOString() } };
}

