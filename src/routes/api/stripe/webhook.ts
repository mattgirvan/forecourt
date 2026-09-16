import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env.server";
import { SUPABASE_URL } from "@/lib/sb";
import { seedPaidOrder } from "@/lib/server/build";
import { isBillingKind, normalizePlan } from "@/lib/catalog";

function service() {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? env("GROK_SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function stripeSecret() {
  return env("GROK_STRIPE_SECRET_KEY") ?? env("STRIPE_SECRET_KEY");
}

async function applyCheckout(session: {
  id: string;
  mode: string | null;
  metadata: Record<string, string> | null;
  subscription?: string | { id: string } | null;
  customer?: string | { id: string } | null;
}) {
  const sb = service();
  if (!sb) return;
  const tenantId = Number(session.metadata?.tenant_id);
  const orderId = Number(session.metadata?.order_id);
  const billing = isBillingKind(session.metadata?.billing)
    ? session.metadata.billing
    : session.mode === "subscription"
      ? "subscription"
      : "trial";
  const plan = normalizePlan(session.metadata?.plan);
  const sub = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (orderId) {
    await sb
      .from("orders")
      .update({
        status: "paid",
        stripe_subscription_id: sub ?? null,
      })
      .eq("id", orderId);
  }
  if (!tenantId) return;
  const { data: current } = await sb
    .from("tenants")
    .select("status, trial_ends_at")
    .eq("id", tenantId)
    .maybeSingle();
  const alreadyLive = current?.status === "trial" || current?.status === "subscribed" || current?.status === "live";
  const trialEnds =
    billing === "trial"
      ? current?.trial_ends_at || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
      : null;
  await sb
    .from("tenants")
    .update({
      status: billing === "trial" ? "trial" : "subscribed",
      plan,
      billing,
      stripe_subscription_id: sub ?? null,
      stripe_customer_id: customer ?? null,
      trial_ends_at: trialEnds,
    })
    .eq("id", tenantId);
  if (!alreadyLive || !current?.trial_ends_at) {
    try {
      await seedPaidOrder(sb, tenantId, "stripe");
    } catch {
      /* build tables may not be live yet */
    }
  }
}

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = stripeSecret();
        const hookSecret = env("STRIPE_WEBHOOK_SECRET") ?? env("GROK_STRIPE_WEBHOOK_SECRET");
        if (!secret) return new Response("no stripe", { status: 500 });
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(secret);
        const raw = await request.text();
        let event: { type: string; data: { object: Record<string, unknown> } };
        try {
          if (hookSecret) {
            const sig = request.headers.get("stripe-signature") ?? "";
            event = stripe.webhooks.constructEvent(raw, sig, hookSecret) as unknown as typeof event;
          } else {
            event = JSON.parse(raw) as typeof event;
          }
        } catch {
          return new Response("bad signature", { status: 400 });
        }

        if (event.type === "checkout.session.completed") {
          const session = event.data.object as {
            id: string;
            mode: string | null;
            metadata: Record<string, string> | null;
            subscription?: string | { id: string } | null;
            customer?: string | { id: string } | null;
          };
          await applyCheckout(session);
        }
        if (event.type === "customer.subscription.deleted") {
          const sb = service();
          const sub = event.data.object as { id?: string };
          if (sb && sub.id) {
            await sb.from("tenants").update({ status: "cancelled" }).eq("stripe_subscription_id", sub.id);
          }
        }
        return new Response("ok");
      },
    },
  },
});
