import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env.server";
import { monthlyStartMessage, startMonthlyAtGoLive, type MonthlyStartResult } from "@/lib/server/billing-start";

function stripeSecret() {
  return env("GROK_STRIPE_SECRET_KEY") ?? env("STRIPE_SECRET_KEY");
}

/**
 * Start a site's monthly plan because it has gone live. Never throws: going
 * live must not fail because Stripe did. The outcome is written to the
 * internal timeline so staff can see it.
 */
export async function startMonthlyForTenant(
  sb: SupabaseClient,
  tenantId: number,
  actorEmail: string,
): Promise<{ result: MonthlyStartResult; message: string }> {
  let result: MonthlyStartResult;
  try {
    const { data: t } = await sb
      .from("tenants")
      .select("stripe_subscription_id, billing")
      .eq("id", tenantId)
      .maybeSingle();
    const secret = stripeSecret();
    const Stripe = secret ? (await import("stripe")).default : null;
    const stripe = Stripe && secret ? new Stripe(secret) : null;
    result = await startMonthlyAtGoLive(
      {
        subscriptions: stripe
          ? {
              retrieve: (id) => stripe.subscriptions.retrieve(id),
              update: (id, params, options) => stripe.subscriptions.update(id, params, options),
            }
          : null,
        log: console,
      },
      (t?.stripe_subscription_id as string | null | undefined) ?? null,
    );
  } catch (err) {
    console.error("[billing] go live billing check failed for tenant", tenantId, err);
    result = { started: false, reason: "stripe_error", detail: err instanceof Error ? err.message : String(err) };
  }
  const message = monthlyStartMessage(result);
  try {
    await sb.from("build_events").insert({
      tenant_id: tenantId,
      kind: "note",
      stage: "live",
      title: result.started ? "Monthly billing started" : "Monthly billing not started",
      body: message,
      visibility: "internal",
      actor_email: actorEmail,
    });
  } catch {
    /* timeline note is best effort */
  }
  return { result, message };
}
