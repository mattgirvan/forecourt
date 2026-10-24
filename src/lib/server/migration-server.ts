/**
 * Migration tracker, server side (PR 8). Customers see their own account's
 * open migration, the Forecourt team sees all of them in Office and moves the
 * Forecourt steps on (set up or trimmed, complete) or cancels.
 *
 * Cancel only closes the tracker and puts the account back to Live. It does
 * not undo the plan, Stripe or any payment. An upgrade still waiting for
 * payment is also marked cancelled so a new one can be requested.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { normalizePlan } from "@/lib/catalog";
import { migrationEvent } from "@/lib/account-events";
import { officeCanMark, trackerFor, type MigrationStage, type Tracker } from "@/lib/migration";
import { openMigrationFor, openMigrations, setMigrationStage, type StoredMigration } from "@/lib/server/migration-store";
import { sendAccountEventEmail } from "@/lib/server/journey-email";
import { actor, sbAdmin } from "@/lib/server/staff-actor";
import { catchUp } from "@/lib/server/migration-catchup";

export const getMigration = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }): Promise<Tracker | null> => {
    const who = await actor(data.token);
    // RLS decides whether this caller can see the account at all.
    const { data: t } = await who.sb.from("tenants").select("id").eq("id", data.tenantId).maybeSingle();
    if (!t) return null;
    const sb = sbAdmin();
    if (!sb) return null;
    const row = await openMigrationFor(sb, data.tenantId);
    return row ? trackerFor(await catchUp(sb, row)) : null;
  });

export type OfficeMigration = Tracker & { tenantId: number; tenantName: string };

export const listOfficeMigrations = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }): Promise<OfficeMigration[]> => {
    const who = await actor(data.token);
    if (!who.team) throw new Error("Office is for the Forecourt team.");
    const sb = sbAdmin();
    if (!sb) return [];
    const rows = await openMigrations(sb);
    if (!rows.length) return [];
    const { data: ts } = await sb.from("tenants").select("id, name").in("id", [...new Set(rows.map((r) => r.tenant_id))]);
    const names = new Map((ts ?? []).map((x) => [x.id as number, (x.name as string) || "Unnamed"]));
    const out: OfficeMigration[] = [];
    for (const r of rows) {
      const t = trackerFor(await catchUp(sb, r));
      if (t?.open) out.push({ ...t, tenantId: r.tenant_id, tenantName: names.get(r.tenant_id) ?? "Unnamed" });
    }
    return out;
  });

export const markMigration = createServerFn({ method: "POST" })
  .validator((d: { token: string; changeId: number; action: "setup" | "complete" | "cancel" }) => d)
  .handler(async ({ data }): Promise<{ message: string }> => {
    const who = await actor(data.token);
    if (!who.team) throw new Error("Office is for the Forecourt team.");
    const sb = sbAdmin();
    if (!sb) throw new Error("Migrations need the server key, which is not set here.");
    const { data: row } = await sb.from("plan_changes").select("*").eq("id", data.changeId).maybeSingle();
    const r = row as StoredMigration | null;
    const t = r ? trackerFor(r) : null;
    if (!r || !t || !t.open) throw new Error("No open migration with that id.");
    const base = { tenantId: r.tenant_id, from: normalizePlan(r.from_plan), to: normalizePlan(r.to_plan), changeId: r.id, upgrade: t.rise };
    if (data.action === "cancel") {
      const at = new Date().toISOString();
      const patch: Record<string, unknown> = { migration_cancelled_at: at };
      if (r.status === "pending_payment") patch.status = "cancelled";
      // PR 2: a booked change is cancelled by releasing its Stripe schedule.
      const scheduleId = (row as { stripe_schedule_id?: string | null }).stripe_schedule_id ?? null;
      if (r.status === "scheduled") {
        if (scheduleId) {
          const { planChangeDeps, planChangeMode, stripeForPlanChange } = await import("@/lib/server/plan-change-server");
          const { releasePlanChangeSchedule } = await import("@/lib/server/plan-change-sync");
          const stripe = planChangeMode() === "live" ? await stripeForPlanChange() : null;
          const rel = await releasePlanChangeSchedule(planChangeDeps(stripe), scheduleId, r.id);
          if (!rel.released) throw new Error(`Could not release the Stripe schedule (${rel.reason}). Nothing was cancelled.`);
        }
        patch.status = "cancelled";
      }
      const { error } = await sb.from("plan_changes").update(patch).eq("id", r.id);
      if (error) throw new Error(error.message);
      if (r.status === "pending_payment") {
        const { closeWaitingTicketFor } = await import("@/lib/server/plan-change-ticket-store");
        await closeWaitingTicketFor(sb, r.id, "cancelled");
      }
      await sendAccountEventEmail({ tenantId: r.tenant_id, ...migrationEvent({ ...base, stage: "cancelled" }) });
      await audit(sb, r.tenant_id, "Migration cancelled", `Tracker closed by ${who.email ?? "Office"}. ${r.status === "scheduled" ? "The booked change was released." : "The plan and Stripe were not changed."}`, who.email);
      return { message: "Cancelled. The account is back to Live. The plan and Stripe were not changed." };
    }
    const target = data.action as MigrationStage;
    if (!officeCanMark(t.scenario, t.stage, target, t.steps)) throw new Error("That step is not next, or is not one Office marks.");
    if (!(await setMigrationStage(sb, r, target))) throw new Error("Could not save the step. Has 08-migration-tracker.sql been run?");
    if (target === "complete") await sendAccountEventEmail({ tenantId: r.tenant_id, ...migrationEvent({ ...base, stage: "complete" }) });
    const step = t.steps.find((s) => s.stage === target)!;
    await audit(sb, r.tenant_id, `Migration: ${step.title}`, `Marked by ${who.email ?? "Office"}.`, who.email);
    return { message: target === "complete" ? "Complete. The account is back to Live." : `${step.title}: done.` };
  });

async function audit(sb: SupabaseClient, tenantId: number, title: string, body: string, email: string | null | undefined) {
  try {
    await sb.from("build_events").insert({ tenant_id: tenantId, kind: "note", title, body, visibility: "internal", actor_email: email ?? "office" });
  } catch {
    /* best effort */
  }
}
