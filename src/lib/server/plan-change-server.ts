/**
 * Account type change, server side. Customers (live accounts only) and the
 * Forecourt team can preview and request a change.
 *
 * Stripe is only touched when PLAN_CHANGE_SYNC is exactly "on". Anything else
 * is a dry run: the preview works, nothing is charged and the plan stays put.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { normalizePlan, type PlanId } from "@/lib/catalog";
import { clampSiteCount } from "@/lib/plan-shape";
import { SITE } from "@/lib/site";
import { currentMonthlyPence, type StripePriceItem } from "@/lib/current-price";
import {
  PLAN_CHANGE_NOT_RECORDED,
  planChangeDryRunMessage,
  planChangeOfficeRecordedMessage,
  planChangeRecordedMessage,
  quotePlanChange,
  type PlanChangeOutcome,
  type PlanChangeQuote,
} from "@/lib/plan-change";
import { applyPlanChange, planChangeMessage, upgradeCheckoutParams, type PlanChangeDeps, type ScheduleLike } from "@/lib/server/plan-change-sync";
import { siteBillingModeFrom, type SiteSubLike } from "@/lib/server/site-billing-sync";
import { migrationEvent, planChangedEvent } from "@/lib/account-events";
import { readMigration, setMigrationStage } from "@/lib/server/migration-store";
import { sendAccountEventEmail } from "@/lib/server/journey-email";
import { actor, planChangeSyncFlag, sbAdmin, stripeSecret } from "@/lib/server/staff-actor";

type TenantRow = { id: number; plan: string; status: string | null; site_count: number | null; stripe_subscription_id: string | null; stripe_customer_id: string | null; email: string | null };

export function planChangeMode() {
  return siteBillingModeFrom(planChangeSyncFlag());
}

async function stripeClient() {
  const secret = stripeSecret();
  if (!secret) return null;
  const Stripe = (await import("stripe")).default;
  return new Stripe(secret);
}

/** Stripe client for plan change work (null without a key). */
export const stripeForPlanChange = stripeClient;

type StripeLike = NonNullable<Awaited<ReturnType<typeof stripeClient>>>;

export function planChangeDeps(stripe: StripeLike | null): PlanChangeDeps {
  return {
    subscriptions: stripe
      ? {
          retrieve: async (id) => (await stripe.subscriptions.retrieve(id)) as unknown as SiteSubLike,
          update: (id, params, options) => stripe.subscriptions.update(id, params as never, options),
        }
      : null,
    schedules: stripe
      ? {
          create: async (params, options) => (await stripe.subscriptionSchedules.create(params, options)) as unknown as ScheduleLike,
          update: (id, params, options) => stripe.subscriptionSchedules.update(id, params as never, options),
          release: (id, options) => stripe.subscriptionSchedules.release(id, {}, options),
        }
      : null,
    productFor: async (plan) => {
      if (!stripe) throw new Error("stripe not configured");
      const found = await stripe.products.search({ query: `metadata['forecourt_plan']:'${plan}' AND active:'true'`, limit: 1 });
      if (found.data[0]) return found.data[0].id;
      const name = plan === "group" ? "Forecourt Group (per site)" : plan === "franchise" ? "Forecourt Franchise" : "Forecourt Site";
      const made = await stripe.products.create({ name, metadata: { forecourt_plan: plan } }, { idempotencyKey: `forecourt-plan-product:${plan}` });
      return made.id;
    },
  };
}

async function liveCount(sb: SupabaseClient, t: TenantRow) {
  const { data, error } = await sb.from("tenant_sites").select("status").eq("tenant_id", t.id);
  if (!error && data?.length) return Math.max(1, data.filter((r) => r.status === "live").length);
  return Math.max(1, t.site_count ?? 1);
}

/** Customer sees own live account only; team sees any. */
async function loadForCaller(token: string, tenantId: number) {
  const who = await actor(token);
  const admin = sbAdmin();
  const { data } = await who.sb.from("tenants").select("id, plan, status, site_count, stripe_subscription_id, stripe_customer_id, email").eq("id", tenantId).maybeSingle();
  const t = data as TenantRow | null;
  if (!t) throw new Error("Account not found.");
  if (!who.team && t.status !== "live") throw new Error("You can change your account type once your desk is live.");
  return { who, admin, t };
}

async function quoteFor(sb: SupabaseClient, t: TenantRow, to: PlanId, stripe: StripeLike | null): Promise<PlanChangeQuote> {
  let start: number | null = null;
  let end: number | null = null;
  if (stripe && t.stripe_subscription_id) {
    try {
      const sub = (await stripe.subscriptions.retrieve(t.stripe_subscription_id)) as unknown as {
        current_period_start?: number;
        current_period_end?: number;
        items?: { data?: { current_period_start?: number; current_period_end?: number }[] };
      };
      start = sub.current_period_start ?? sub.items?.data?.[0]?.current_period_start ?? null;
      end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
    } catch {
      /* preview without the period */
    }
  }
  return quotePlanChange({
    from: normalizePlan(t.plan),
    to,
    live: await liveCount(sb, t),
    periodStart: start,
    periodEnd: end,
    currentMonthlyPence: currentMonthlyPence(await currentItem(t), normalizePlan(t.plan), t.site_count),
  });
}

/**
 * The Stripe price item, read only, exactly as the account header reads it
 * (liveBillingSummary), so the sheet and the header show the same price.
 * Not tied to PLAN_CHANGE_SYNC: it never writes.
 */
async function currentItem(t: TenantRow): Promise<StripePriceItem> {
  if (!t.stripe_subscription_id) return null;
  try {
    const stripe = await stripeClient();
    if (!stripe) return null;
    const sub = await stripe.subscriptions.retrieve(t.stripe_subscription_id);
    const item = sub.items?.data?.[0];
    return { unitPence: item?.price?.unit_amount ?? null, quantity: item?.quantity ?? 1 };
  } catch {
    return null;
  }
}

export const previewPlanChange = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number; to: PlanId }) => d)
  .handler(async ({ data }) => {
    const { admin, t, who } = await loadForCaller(data.token, data.tenantId);
    const stripe = planChangeMode() === "live" ? await stripeClient() : null;
    return { quote: await quoteFor(admin ?? (who.sb as SupabaseClient), t, data.to, stripe), mode: planChangeMode() };
  });

export const requestPlanChange = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number; to: PlanId; from: "account" | "office" }) => d)
  .handler(async ({ data }) => {
    const { admin, t, who } = await loadForCaller(data.token, data.tenantId);
    if (!admin) throw new Error("Plan changes need the server key, which is not set here.");
    const mode = planChangeMode();
    const stripe = mode === "live" ? await stripeClient() : null;
    const q = await quoteFor(admin, t, data.to, stripe);
    const actorEmail = who.email ?? "unknown";
    const reply = (outcome: PlanChangeOutcome, message: string, url: string | null = null) => ({ outcome, message, url, mode });
    if (q.direction === "same") return reply("unchanged", "Already on that plan.");
    if (mode !== "live") {
      // Sync is off: nothing is charged and the plan stays put. The request is
      // noted on the file so the team can apply it, and the caller is told so.
      const recorded = await noteOk(
        admin,
        t.id,
        "Plan change requested",
        `Move from ${q.from} to ${q.to} asked for in ${data.from === "office" ? "the Office" : "the account"}. Plan sync is off, so nothing was charged or changed. ${planChangeDryRunMessage(q)}`,
        actorEmail,
      );
      if (!recorded) return reply("failed", PLAN_CHANGE_NOT_RECORDED);
      return reply(
        "recorded",
        data.from === "office" ? planChangeOfficeRecordedMessage(q) : planChangeRecordedMessage(q),
      );
    }
    const row = {
      tenant_id: t.id,
      from_plan: q.from,
      to_plan: q.to,
      direction: q.direction,
      setup_diff_pence: q.setupDiffPence,
      prorated_pence: q.proratedPence,
      new_monthly_pence: q.newMonthlyPence,
      effective: q.effective,
      requested_by: actorEmail,
    };
    if (q.direction === "upgrade") {
      if (!stripe) throw new Error("Stripe is not set up here.");
      const { data: ins, error } = await admin.from("plan_changes").insert({ ...row, status: "pending_payment" }).select("id").single();
      if (error) throw new Error(error.code === "23505" ? "There is already an upgrade waiting for payment." : error.message);
      const back = data.from === "office" ? `${SITE.url}/office` : `${SITE.url}/account?tab=billing`;
      const session = await stripe.checkout.sessions.create(
        upgradeCheckoutParams({
          tenantId: t.id,
          changeId: ins.id as number,
          from: q.from,
          to: q.to,
          setupDiffPence: q.setupDiffPence,
          customer: t.stripe_customer_id,
          email: t.email,
          successUrl: `${back}${back.includes("?") ? "&" : "?"}plan_change=paid`,
          cancelUrl: back,
        }) as never,
        { idempotencyKey: `plan-change-checkout:${ins.id}` },
      );
      await admin.from("plan_changes").update({ checkout_session_id: session.id }).eq("id", ins.id);
      // Migration tracker (PR 8): open at "requested" and email the admin and hello@.
      const mig = await readMigration(admin, ins.id as number);
      if (mig && (await setMigrationStage(admin, mig, "requested"))) {
        await sendAccountEventEmail({ tenantId: t.id, ...migrationEvent({ changeId: mig.id, from: q.from, to: q.to, stage: "requested", upgrade: true, setupDiffPence: q.setupDiffPence }) });
      }
      return reply("checkout", "Pay the setup difference to switch plan.", session.url ?? null);
    }
    const result = await applyPlanChange(planChangeDeps(stripe), {
      subscriptionId: t.stripe_subscription_id,
      from: q.from,
      to: q.to,
      live: await liveCount(admin, t),
      key: `${t.id}:${q.from}-${q.to}:${Date.now()}`,
    });
    const message = planChangeMessage(result, q.from, q.to);
    const ok = result.applied || result.reason === "no_subscription";
    // PR 2: a price drop or equal swap is booked for period end. The plan flips
    // when the schedule fires (webhook) or the cron sees the date pass.
    const booked = (result.applied && result.mode === "scheduled") || (!result.applied && result.reason === "no_subscription");
    const effectiveAt = result.applied && result.mode === "scheduled" ? result.effectiveAt : q.periodEnd ? new Date(q.periodEnd).toISOString() : null;
    const { data: dn } = await admin
      .from("plan_changes")
      .insert({ ...row, status: ok ? (booked ? "scheduled" : "applied") : "failed", message, applied_at: ok && !booked ? new Date().toISOString() : null })
      .select("id")
      .single();
    if (ok && booked && dn?.id) {
      // Separate write so a database without plan-change-flow.sql still records the row.
      await admin.from("plan_changes").update({ effective_at: effectiveAt, ...(result.applied && result.mode === "scheduled" ? { stripe_schedule_id: result.scheduleId } : {}) }).eq("id", dn.id);
      const mig = await readMigration(admin, dn.id as number);
      if (mig && (await setMigrationStage(admin, mig, "requested", { effective_at: effectiveAt }))) {
        await sendAccountEventEmail({ tenantId: t.id, ...migrationEvent({ changeId: mig.id, from: q.from, to: q.to, stage: "requested", upgrade: false, periodEnd: effectiveAt }) });
      }
      await note(admin, t.id, "Account type change booked", message, actorEmail);
      return reply("scheduled", message);
    }
    if (ok) {
      // Matt: on a downgrade the plan name changes now, the price at period end.
      // site_count follows the plan shape (PR 9): Site is 1, Group at least 2.
      // Matt: a move down to Site ends the 12-month term; Site has no contract.
      await admin.from("tenants").update({ plan: q.to, site_count: clampSiteCount(q.to, t.site_count), ...(q.to === "site" ? { term_months: null } : {}) }).eq("id", t.id);
      // Migration tracker (PR 8): requested and switched now, the price step waits for the period end.
      const mig = dn?.id ? await readMigration(admin, dn.id as number) : null;
      if (mig && (await setMigrationStage(admin, mig, "switched", { effective_at: q.periodEnd ? new Date(q.periodEnd).toISOString() : null }))) {
        await sendAccountEventEmail({ tenantId: t.id, ...migrationEvent({ changeId: mig.id, from: q.from, to: q.to, stage: "requested", upgrade: false, periodEnd: q.periodEnd ? new Date(q.periodEnd).toISOString() : null }) });
        await note(admin, t.id, "Account type changed", message, actorEmail);
        return reply(q.effective === "period_end" ? "scheduled" : "applied", message);
      }
      const when = q.effective === "period_end" ? (q.periodEnd ? `from ${new Date(q.periodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" })}` : "from your next bill") : "pro-rated on your next bill";
      await sendAccountEventEmail({ tenantId: t.id, ...planChangedEvent({ tenantId: t.id, changeKey: `${t.id}:${q.from}-${q.to}:${new Date().toISOString().slice(0, 10)}`, from: q.from, to: q.to, newMonthlyPence: q.newMonthlyPence, when }) });
    }
    await note(admin, t.id, "Account type changed", message, actorEmail);
    return reply(ok ? (q.effective === "period_end" ? "scheduled" : "applied") : "failed", message);
  });

/** Like note(), but says whether the row was written. */
async function noteOk(sb: SupabaseClient, tenantId: number, title: string, body: string, actorEmail: string): Promise<boolean> {
  try {
    const { error } = await sb.from("build_events").insert({ tenant_id: tenantId, kind: "note", title, body, visibility: "internal", actor_email: actorEmail });
    return !error;
  } catch {
    return false;
  }
}

async function note(sb: SupabaseClient, tenantId: number, title: string, body: string, actorEmail: string) {
  try {
    await sb.from("build_events").insert({ tenant_id: tenantId, kind: "note", title, body, visibility: "internal", actor_email: actorEmail });
  } catch {
    /* best effort */
  }
}

/**
 * Stripe webhook: the setup difference was paid. Turns the new plan on.
 * Safe to retry: an applied row is left alone.
 */
export async function completePaidPlanChange(
  sb: SupabaseClient,
  session: { id: string; amount_total?: number | null; metadata?: Record<string, string> | null },
  deps: PlanChangeDeps,
): Promise<{ status: number; body: string }> {
  const changeId = Number(session.metadata?.change_id);
  const tenantId = Number(session.metadata?.tenant_id);
  if (!Number.isInteger(changeId) || !Number.isInteger(tenantId)) return { status: 422, body: "not applied: bad plan change metadata" };
  const { data: pc } = await sb.from("plan_changes").select("*").eq("id", changeId).maybeSingle();
  if (!pc || pc.tenant_id !== tenantId) return { status: 422, body: "not applied: plan change not found" };
  if (pc.status === "applied") return { status: 200, body: "plan change already applied" };
  if (pc.status !== "pending_payment") return { status: 200, body: `plan change ${pc.status}` };
  if ((session.amount_total ?? -1) !== pc.setup_diff_pence) return { status: 422, body: "not applied: amount does not match" };
  const { data: t } = await sb.from("tenants").select("id, plan, status, site_count, stripe_subscription_id").eq("id", tenantId).maybeSingle();
  if (!t) return { status: 422, body: "not applied: account not found" };
  const from = normalizePlan(pc.from_plan as string);
  const to = normalizePlan(pc.to_plan as string);
  const result = await applyPlanChange(deps, {
    subscriptionId: (t.stripe_subscription_id as string | null) ?? null,
    from,
    to,
    live: await liveCount(sb, t as TenantRow),
    key: `paid:${session.id}`,
  });
  const message = planChangeMessage(result, from, to);
  if (!result.applied && result.reason !== "no_subscription") {
    // Stays pending_payment so Stripe's retry can apply it.
    await sb.from("plan_changes").update({ message, checkout_session_id: session.id }).eq("id", changeId);
    await note(sb, tenantId, "Setup difference paid, plan change failed", message, "stripe");
    return { status: 500, body: "plan change failed, Stripe will retry" };
  }
  await sb.from("tenants").update({ plan: to, site_count: clampSiteCount(to, (t.site_count as number | null) ?? 1) }).eq("id", tenantId);
  await sb.from("plan_changes").update({ status: "applied", message, applied_at: new Date().toISOString(), checkout_session_id: session.id }).eq("id", changeId);
  await note(sb, tenantId, "Account type changed", `Setup difference paid. ${message}`, "stripe");
  // Migration tracker (PR 8): paid and switched together. Falls back to the PR 5 email without the SQL.
  const mig = await readMigration(sb, changeId);
  if (mig && (await setMigrationStage(sb, mig, "switched"))) {
    await sendAccountEventEmail({ tenantId, ...migrationEvent({ changeId, from, to, stage: "paid", upgrade: true, newMonthlyPence: Number(pc.new_monthly_pence) || 0 }) });
    return { status: 200, body: "plan change applied" };
  }
  await sendAccountEventEmail({ tenantId, ...planChangedEvent({ tenantId, changeKey: `paid:${changeId}`, from, to, newMonthlyPence: Number(pc.new_monthly_pence) || 0, when: "pro-rated on your next bill" }) });
  return { status: 200, body: "plan change applied" };
}
