/**
 * Office: Apply or Reject a plan change ticket (plan change flow PR 4).
 * Apply is for the Forecourt team; Reject (with its refund) is owner only.
 * The flow lives in plan-change-ticket.ts; this file only wires the database
 * and Stripe in.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { clampSiteCount } from "@/lib/plan-shape";
import { PLANS } from "@/lib/catalog";
import { readMigration, setMigrationStage } from "@/lib/server/migration-store";
import { actor, sbAdmin } from "@/lib/server/staff-actor";
import { applyTicket, gbp, officeFileLink, rejectTicket, type TicketChange } from "@/lib/server/plan-change-ticket";
import { readTicketChange } from "@/lib/server/plan-change-ticket-store";
import { appliedStage, notify } from "@/lib/server/plan-change-notify";
import { planMove } from "@/lib/plan-change-rules";

export type PlanChangeTicketView = {
  changeId: number;
  status: string;
  from: string;
  to: string;
  setupPaid: string | null;
  newMonthly: string;
  monthlyStarts: "on_go_live" | "period_end" | "never";
  effectiveAt: string | null;
  goLiveAt: string | null;
  syncOn: boolean;
  canApply: boolean;
  canReject: boolean;
  isOwner: boolean;
  /** Waiting on customer: pending_payment with a setup difference. Staff have no action. */
  waiting?: boolean;
  setupDue?: string | null;
  fileLink?: string;
};

async function team(token: string) {
  const who = await actor(token);
  if (!who.team) throw new Error("Office is for the Forecourt team.");
  const sb = sbAdmin();
  if (!sb) throw new Error("Plan changes need the server key, which is not set here.");
  return { who, sb };
}

async function liveSites(sb: SupabaseClient, tenantId: number, fallback: number | null) {
  const { data, error } = await sb.from("tenant_sites").select("status").eq("tenant_id", tenantId);
  const n = error ? 0 : (data ?? []).filter((r) => r.status === "live").length;
  return Math.max(1, n || fallback || 1);
}

async function byItem(sb: SupabaseClient, itemId: number): Promise<TicketChange & { go_live_at?: string | null }> {
  const { data } = await sb.from("plan_changes").select("id").eq("support_item_id", itemId).maybeSingle();
  const c = data ? await readTicketChange(sb, data.id as number) : null;
  if (!c) throw new Error("No plan change is linked to this ticket.");
  return c;
}

async function ticketUpdate(sb: SupabaseClient, c: TicketChange, status: string, body: string, email: string | null | undefined) {
  if (!c.support_item_id) return;
  try {
    await sb.from("support_items").update({ status, needs_reply: false, updated_at: new Date().toISOString() }).eq("id", c.support_item_id);
    await sb.from("support_messages").insert({ item_id: c.support_item_id, tenant_id: c.tenant_id, from_team: true, internal: true, author_email: email ?? "", body });
  } catch {
    /* the change is saved; the ticket note is best effort */
  }
}

export const getPlanChangeTicket = createServerFn({ method: "POST" })
  .validator((d: { token: string; itemId: number }) => d)
  .handler(async ({ data }): Promise<PlanChangeTicketView> => {
    const { who, sb } = await team(data.token);
    const c = await byItem(sb, data.itemId);
    const { planChangeMode } = await import("@/lib/server/plan-change-server");
    const open = ["paid", "requested", "scheduled"].includes(c.status) && !c.go_live_at;
    return {
      changeId: c.id,
      status: c.status,
      from: PLANS[c.from_plan].name,
      to: PLANS[c.to_plan].name,
      setupPaid: c.status === "paid" || c.payment_intent_id ? gbp(c.setup_diff_pence) : null,
      newMonthly: gbp(c.new_monthly_pence),
      monthlyStarts: c.direction === "up" || c.direction === "upgrade" ? "on_go_live" : "period_end",
      effectiveAt: c.effective_at ?? null,
      goLiveAt: c.go_live_at ?? null,
      syncOn: planChangeMode() === "live",
      canApply: open,
      canReject: ["paid", "requested", "scheduled"].includes(c.status),
      isOwner: who.role === "owner",
      waiting: c.status === "pending_payment" && c.setup_diff_pence > 0,
      setupDue: c.status === "pending_payment" && c.setup_diff_pence > 0 ? gbp(c.setup_diff_pence) : null,
      fileLink: officeFileLink(c.tenant_id),
    };
  });

export const applyPlanChangeTicket = createServerFn({ method: "POST" })
  .validator((d: { token: string; changeId: number }) => d)
  .handler(async ({ data }) => {
    const { who, sb } = await team(data.token);
    const c = await readTicketChange(sb, data.changeId);
    if (!c) throw new Error("No plan change with that id.");
    const { data: t } = await sb.from("tenants").select("id, site_count, stripe_subscription_id").eq("id", c.tenant_id).maybeSingle();
    if (!t) throw new Error("No dealership on this file.");
    const { planChangeDeps, planChangeMode, stripeForPlanChange } = await import("@/lib/server/plan-change-server");
    const { applyPlanChange } = await import("@/lib/server/plan-change-sync");
    const syncOn = planChangeMode() === "live";
    const stripe = syncOn ? await stripeForPlanChange() : null;
    const live = await liveSites(sb, c.tenant_id, t.site_count as number | null);
    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    if (stripe && t.stripe_subscription_id) {
      try {
        const sub = (await stripe.subscriptions.retrieve(t.stripe_subscription_id as string)) as unknown as { current_period_start?: number; current_period_end?: number; items: { data: { current_period_start?: number; current_period_end?: number }[] } };
        const s = sub.current_period_start ?? sub.items.data[0]?.current_period_start;
        const e = sub.current_period_end ?? sub.items.data[0]?.current_period_end;
        periodStart = s ? new Date(s * 1000).toISOString() : null;
        periodEnd = e ? new Date(e * 1000).toISOString() : null;
      } catch {
        /* the part month line just leaves the amount out */
      }
    }
    const r = await applyTicket(
      {
        syncOn,
        now: () => new Date(),
        live,
        subscriptionId: (t.stripe_subscription_id as string | null) ?? null,
        periodStart,
        periodEnd,
        stripeApply: async (key) => applyPlanChange(planChangeDeps(stripe), { subscriptionId: (t.stripe_subscription_id as string | null) ?? null, from: c.from_plan, to: c.to_plan, live, key }),
        claim: async (from, patch) => {
          const { data: rows, error } = await sb.from("plan_changes").update(patch).eq("id", c.id).eq("status", from).is("go_live_at", null).select("id");
          if (error) throw new Error(error.message);
          return (rows ?? []).length > 0;
        },
        switchPlan: async () => {
          await sb
            .from("tenants")
            .update({ plan: c.to_plan, site_count: clampSiteCount(c.to_plan, t.site_count as number | null), ...(c.to_plan === "site" ? { term_months: null } : {}) })
            .eq("id", c.tenant_id);
        },
        advanceTracker: async () => {
          const mig = await readMigration(sb, c.id);
          if (mig) await setMigrationStage(sb, mig, "switched");
        },
        ticketStatus: (status, body) => ticketUpdate(sb, c, status, body, who.email),
      },
      c,
    );
    if (!r.ok) throw new Error(r.message);
    // PR 5: customer email. A rise is live now; a drop or equal swap starts at period end.
    {
      const { sendAccountEventEmail } = await import("@/lib/server/journey-email");
      const move = planMove({ from: c.from_plan, to: c.to_plan, live });
      const stage = appliedStage(move.monthlyStarts);
      const { data: fresh } = await sb.from("plan_changes").select("effective_at, go_live_at").eq("id", c.id).maybeSingle();
      await notify(sendAccountEventEmail, c.tenant_id, {
        changeId: c.id,
        from: c.from_plan,
        to: c.to_plan,
        stage,
        newMonthlyPence: move.newMonthlyPence,
        goLiveAt: (fresh?.go_live_at as string | null) ?? new Date().toISOString(),
        periodEnd: (fresh?.effective_at as string | null) ?? c.effective_at ?? periodEnd,
      });
    }
    await audit(sb, c.tenant_id, "Plan change applied", `${r.message}${r.manualPrice ? ` ${r.manualPrice}` : ""} By ${who.email ?? "Office"}.`, who.email);
    return r;
  });

export const rejectPlanChangeTicket = createServerFn({ method: "POST" })
  .validator((d: { token: string; changeId: number; reason?: string }) => d)
  .handler(async ({ data }) => {
    const { who, sb } = await team(data.token);
    const c = await readTicketChange(sb, data.changeId);
    if (!c) throw new Error("No plan change with that id.");
    const { planChangeDeps, planChangeMode, stripeForPlanChange } = await import("@/lib/server/plan-change-server");
    const { releasePlanChangeSchedule } = await import("@/lib/server/plan-change-sync");
    // The refund is a payment we took, so it never waits on PLAN_CHANGE_SYNC.
    const stripe = await stripeForPlanChange();
    const r = await rejectTicket(
      {
        role: who.role ?? null,
        refund: stripe ? async (pi, key) => ({ id: (await stripe.refunds.create({ payment_intent: pi }, { idempotencyKey: key })).id }) : null,
        releaseSchedule: async (id) => releasePlanChangeSchedule(planChangeDeps(planChangeMode() === "live" ? stripe : null), id, c.id),
        claim: async (from, patch) => {
          const { data: rows, error } = await sb.from("plan_changes").update(patch).eq("id", c.id).eq("status", from).select("id");
          if (error) throw new Error(error.message);
          return (rows ?? []).length > 0;
        },
        closeTracker: async () => {
          try {
            await sb.from("plan_changes").update({ migration_cancelled_at: new Date().toISOString() }).eq("id", c.id);
          } catch {
            /* tracker SQL not run */
          }
        },
        ticketStatus: (status, body) => ticketUpdate(sb, c, status, body, who.email),
      },
      c,
      data.reason ?? "",
    );
    if (!r.ok) throw new Error(r.message);
    {
      const { sendAccountEventEmail } = await import("@/lib/server/journey-email");
      const refunded = c.status === "paid" && c.setup_diff_pence > 0;
      await notify(sendAccountEventEmail, c.tenant_id, { changeId: c.id, from: c.from_plan, to: c.to_plan, stage: "rejected", setupPence: c.setup_diff_pence, refunded });
    }
    await audit(sb, c.tenant_id, "Plan change rejected", `${r.message} By ${who.email ?? "Office"}.`, who.email);
    return r;
  });

async function audit(sb: SupabaseClient, tenantId: number, title: string, body: string, email: string | null | undefined) {
  try {
    await sb.from("build_events").insert({ tenant_id: tenantId, kind: "note", title, body, visibility: "internal", actor_email: email ?? "office" });
  } catch {
    /* best effort */
  }
}
