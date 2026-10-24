/**
 * Booked plan changes (price drops and equal price swaps) landing at period
 * end. Called from the Stripe webhook (customer.subscription.updated) and from
 * the daily migration cron as a backup. Never throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePlan, type PlanId } from "@/lib/catalog";
import { clampSiteCount } from "@/lib/plan-shape";
import { finishScheduledChange, type FinishDeps, type ScheduledRow } from "@/lib/server/plan-change-sync";

export function finishDeps(sb: SupabaseClient): FinishDeps {
  return {
    claim: async (id) => {
      const { data, error } = await sb.from("plan_changes").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", id).eq("status", "scheduled").select("id");
      return !error && (data ?? []).length > 0;
    },
    setPlan: async (tenantId, to: PlanId) => {
      const { data: t } = await sb.from("tenants").select("site_count").eq("id", tenantId).maybeSingle();
      await sb
        .from("tenants")
        .update({ plan: to, site_count: clampSiteCount(to, (t?.site_count as number | null) ?? 1), ...(to === "site" ? { term_months: null } : {}) })
        .eq("id", tenantId);
      try {
        await sb.from("build_events").insert({ tenant_id: tenantId, kind: "note", title: "Account type changed", body: `Booked change landed at period end. Plan is now ${to}.`, visibility: "internal", actor_email: "stripe" });
      } catch {
        /* best effort */
      }
    },
  };
}

const COLS = "id, tenant_id, to_plan, status, effective_at";

/** Every booked change that is due. Used by the cron. */
export async function finishDueScheduledChanges(sb: SupabaseClient, now = new Date()): Promise<number> {
  try {
    const { data, error } = await sb.from("plan_changes").select(COLS).eq("status", "scheduled").lte("effective_at", now.toISOString());
    if (error) return 0;
    let n = 0;
    const deps = finishDeps(sb);
    for (const r of (data ?? []) as ScheduledRow[]) if ((await finishScheduledChange(deps, r, now, normalizePlan)) === "finished") n++;
    return n;
  } catch {
    return 0;
  }
}

/** Webhook: the subscription changed. Lands its account's booked change if due. */
export async function finishForSubscription(sb: SupabaseClient, subscriptionId: string, now = new Date()): Promise<{ status: number; body: string }> {
  try {
    const { data: t } = await sb.from("tenants").select("id").eq("stripe_subscription_id", subscriptionId).maybeSingle();
    if (!t) return { status: 200, body: "no account for subscription" };
    const { data } = await sb.from("plan_changes").select(COLS).eq("tenant_id", t.id).eq("status", "scheduled");
    const deps = finishDeps(sb);
    let n = 0;
    for (const r of (data ?? []) as ScheduledRow[]) if ((await finishScheduledChange(deps, r, now, normalizePlan)) === "finished") n++;
    return { status: 200, body: n ? "booked plan change landed" : "nothing due" };
  } catch {
    return { status: 500, body: "booked plan change check failed" };
  }
}
