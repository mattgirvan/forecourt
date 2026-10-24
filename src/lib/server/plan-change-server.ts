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
import { SITE } from "@/lib/site";
import { planChangeDryRunMessage, quotePlanChange, type PlanChangeQuote } from "@/lib/plan-change";
import { applyPlanChange, planChangeMessage, upgradeCheckoutParams, type PlanChangeDeps } from "@/lib/server/plan-change-sync";
import { siteBillingModeFrom, type SiteSubLike } from "@/lib/server/site-billing-sync";
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

type StripeLike = NonNullable<Awaited<ReturnType<typeof stripeClient>>>;

export function planChangeDeps(stripe: StripeLike | null): PlanChangeDeps {
  return {
    subscriptions: stripe
      ? {
          retrieve: async (id) => (await stripe.subscriptions.retrieve(id)) as unknown as SiteSubLike,
          update: (id, params, options) => stripe.subscriptions.update(id, params as never, options),
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
  return quotePlanChange({ from: normalizePlan(t.plan), to, live: await liveCount(sb, t), periodStart: start, periodEnd: end });
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
    if (q.direction === "same") return { message: "Already on that plan.", url: null as string | null, mode };
    if (mode !== "live") {
      return {
        message: planChangeDryRunMessage(q),
        url: null as string | null,
        mode,
      };
    }
    const actorEmail = who.email ?? "unknown";
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
      return { message: "Pay the setup difference to switch plan.", url: session.url, mode };
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
    await admin.from("plan_changes").insert({ ...row, status: ok ? (q.effective === "period_end" ? "scheduled" : "applied") : "failed", message, applied_at: ok ? new Date().toISOString() : null });
    if (ok) await admin.from("tenants").update({ plan: q.to }).eq("id", t.id);
    await note(admin, t.id, "Account type changed", message, actorEmail);
    return { message, url: null as string | null, mode };
  });

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
  await sb.from("tenants").update({ plan: to }).eq("id", tenantId);
  await sb.from("plan_changes").update({ status: "applied", message, applied_at: new Date().toISOString(), checkout_session_id: session.id }).eq("id", changeId);
  await note(sb, tenantId, "Account type changed", `Setup difference paid. ${message}`, "stripe");
  return { status: 200, body: "plan change applied" };
}
