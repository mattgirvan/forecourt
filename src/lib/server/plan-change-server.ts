/**
 * Account type change, server side. Customers (live accounts only) and the
 * Forecourt team can preview and request a change.
 *
 * PLAN_CHANGE_SYNC only gates the automatic Stripe plan and price swap (and
 * the period end schedule booking). With it off, requests still route by the
 * price rules: setup Checkout, "requested" tickets, period end dates. Staff
 * apply the plan and set the price by hand.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { normalizePlan, type PlanId } from "@/lib/catalog";
import { clampSiteCount } from "@/lib/plan-shape";
import { SITE } from "@/lib/site";
import { currentMonthlyPence, type StripePriceItem } from "@/lib/current-price";
import {
  planChangeOfficeRecordedMessage,
  quotePlanChange,
  type PlanChangeOutcome,
  type PlanChangeQuote,
} from "@/lib/plan-change";
import { planMove } from "@/lib/plan-change-rules";
import { markRequestExpired, markRequestPaid, OPEN_STATUSES, startRequest, type SessionLike } from "@/lib/server/plan-change-request";
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
    // Sync off only stops the automatic Stripe plan and price swap. The
    // request, its setup Checkout and the ticket all still run.
    const checkoutStripe = stripe ?? (await stripeClient());
    const live = await liveCount(admin, t);
    // PR 3: route by the PR 1 price rules, not plan rank.
    const move = planMove({ from: q.from, to: q.to, live });
    const row = {
      tenant_id: t.id,
      from_plan: q.from,
      to_plan: q.to,
      direction: move.direction,
      setup_diff_pence: move.setupDuePence,
      prorated_pence: 0,
      new_monthly_pence: move.newMonthlyPence,
      effective: move.monthlyStarts,
      requested_by: actorEmail,
    };
    const back = data.from === "office" ? `${SITE.url}/office` : `${SITE.url}/account?tab=billing`;
    const started = await startRequest(
      {
        findOpen: async (tenantId) => {
          const { data: open } = await admin.from("plan_changes").select("id, status").eq("tenant_id", tenantId).in("status", [...OPEN_STATUSES]).limit(1);
          return (open?.[0] as { id: number; status: string } | undefined) ?? null;
        },
        insert: async (r) => {
          const { data: ins, error } = await admin.from("plan_changes").insert(r).select("id").single();
          if (error) {
            if (error.code === "23505") return "duplicate";
            throw new Error(error.message);
          }
          return { id: ins.id as number };
        },
        setSession: async (id, sessionId) => void (await admin.from("plan_changes").update({ checkout_session_id: sessionId }).eq("id", id)),
        cancel: async (id, message) => void (await admin.from("plan_changes").update({ status: "cancelled", message }).eq("id", id)),
        createCheckout: async (changeId, idempotencyKey) => {
          if (!checkoutStripe) throw new Error("Stripe is not set up here.");
          const session = await checkoutStripe.checkout.sessions.create(
            upgradeCheckoutParams({
              tenantId: t.id,
              changeId,
              from: q.from,
              to: q.to,
              setupDiffPence: move.setupDuePence,
              customer: t.stripe_customer_id,
              email: t.email,
              successUrl: `${back}${back.includes("?") ? "&" : "?"}plan_change=paid`,
              cancelUrl: back,
            }) as never,
            { idempotencyKey },
          );
          return { id: session.id, url: session.url };
        },
      },
      move,
      row,
      { scheduleBooking: mode === "live" },
    );
    if (started.kind === "refused") return reply(started.reason === "open_request" ? "in_progress" : "failed", started.message);
    if (started.kind === "checkout" || started.kind === "requested") {
      // Migration tracker (PR 8): open at "requested" and email the admin and hello@.
      const mig = await readMigration(admin, started.changeId);
      if (mig && (await setMigrationStage(admin, mig, "requested"))) {
        await sendAccountEventEmail({ tenantId: t.id, ...migrationEvent({ changeId: mig.id, from: q.from, to: q.to, stage: "requested", upgrade: move.direction === "up", setupDiffPence: move.setupDuePence }) });
      }
      if (started.kind === "checkout") {
        await note(admin, t.id, "Plan change requested", `Waiting for the setup difference (${move.setupDuePence / 100} GBP).`, actorEmail);
        return reply("checkout", "Pay the setup difference to send your request.", started.url ?? null);
      }
      if (started.deferred) {
        const effectiveAt = q.periodEnd ? new Date(q.periodEnd).toISOString() : null;
        // Separate write so a database without plan-change-flow.sql still records the row.
        await admin.from("plan_changes").update({ effective_at: effectiveAt }).eq("id", started.changeId);
        await note(admin, t.id, "Plan change requested", `Plan sync is off. The team applies this at period end${effectiveAt ? ` (${effectiveAt.slice(0, 10)})` : ""}.`, actorEmail);
        return reply("recorded", mode !== "live" && data.from === "office" ? planChangeOfficeRecordedMessage(q) : "Request sent. Nothing to pay. Your new plan starts at the end of this billing period.");
      }
      await note(admin, t.id, "Plan change requested", "No setup difference. Waiting for the team.", actorEmail);
      return reply("recorded", mode !== "live" && data.from === "office" ? planChangeOfficeRecordedMessage(q) : "Request sent. Nothing to pay now. We will be in touch to set up your change.");
    }
    const result = await applyPlanChange(planChangeDeps(stripe), {
      subscriptionId: t.stripe_subscription_id,
      from: q.from,
      to: q.to,
      live,
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
export async function noteOk(sb: SupabaseClient, tenantId: number, title: string, body: string, actorEmail: string): Promise<boolean> {
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
 * Stripe webhook: the setup difference was paid. Marks the request paid and
 * moves the tracker on. PR 3: never switches the plan; staff apply it (PR 4).
 * Safe to retry: only the first call moves pending_payment to paid.
 */
export async function completePaidPlanChange(
  sb: SupabaseClient,
  session: SessionLike,
  _deps?: PlanChangeDeps,
): Promise<{ status: number; body: string }> {
  return markRequestPaid(
    {
      load: async (id) => {
        const { data } = await sb.from("plan_changes").select("id, tenant_id, status, setup_diff_pence").eq("id", id).maybeSingle();
        return (data as { id: number; tenant_id: number; status: string; setup_diff_pence: number } | null) ?? null;
      },
      claimPaid: async (id, patch) => {
        const { data, error } = await sb.from("plan_changes").update({ status: "paid", ...patch }).eq("id", id).eq("status", "pending_payment").select("id");
        if (error) throw new Error(error.message);
        return (data ?? []).length > 0;
      },
      afterPaid: async (id, tenantId) => {
        await note(sb, tenantId, "Setup difference paid", "Plan change request is now with the team. The plan has not changed yet.", "stripe");
        const mig = await readMigration(sb, id);
        if (mig && (await setMigrationStage(sb, mig, "paid"))) {
          await sendAccountEventEmail({ tenantId, ...migrationEvent({ changeId: id, from: normalizePlan(mig.from_plan), to: normalizePlan(mig.to_plan), stage: "paid", upgrade: true, newMonthlyPence: Number(mig.new_monthly_pence) || 0 }) });
        }
      },
    },
    session,
  );
}

/** Stripe webhook: Checkout expired or the payment failed. Cancels the request. */
export async function expirePlanChange(sb: SupabaseClient, session: SessionLike): Promise<{ status: number; body: string }> {
  return markRequestExpired(
    {
      cancelPending: async (id, sessionId) => {
        const { data, error } = await sb
          .from("plan_changes")
          .update({ status: "cancelled", message: "Checkout expired before payment." })
          .eq("id", id)
          .eq("status", "pending_payment")
          .eq("checkout_session_id", sessionId)
          .select("id");
        if (error) throw new Error(error.message);
        return (data ?? []).length > 0;
      },
      afterExpired: async (id, tenantId) => {
        await note(sb, tenantId, "Plan change cancelled", "Checkout expired before the setup difference was paid. The plan is unchanged.", "stripe");
        try {
          await sb.from("plan_changes").update({ migration_cancelled_at: new Date().toISOString() }).eq("id", id);
        } catch {
          /* tracker SQL not run */
        }
      },
    },
    session,
  );
}
