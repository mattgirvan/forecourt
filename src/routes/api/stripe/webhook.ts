import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env.server";
import { SUPABASE_URL } from "@/lib/sb";
import { seedPaidOrder } from "@/lib/server/build";
import { sendStaffAlert, sendThankYouEmail } from "@/lib/server/journey-email";
import {
  handleStripeWebhook,
  supabasePaymentStore,
  type SupabaseLike,
  type WebhookEvent,
} from "@/lib/server/payments";

function service() {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? env("GROK_SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function stripeSecret() {
  return env("GROK_STRIPE_SECRET_KEY") ?? env("STRIPE_SECRET_KEY");
}

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = stripeSecret();
        const sb = service();
        const Stripe = secret ? (await import("stripe")).default : null;
        const stripe = Stripe && secret ? new Stripe(secret) : null;
        const raw = await request.text();
        // Rules (and status codes) live in handleStripeWebhook: missing config
        // or a failed write is a 5xx so Stripe retries; a bad signature is 400.
        const result = await handleStripeWebhook(
          {
            stripeSecret: secret,
            webhookSecret: env("STRIPE_WEBHOOK_SECRET") ?? env("GROK_STRIPE_WEBHOOK_SECRET"),
            store: sb
              ? supabasePaymentStore(sb as unknown as SupabaseLike, (tenantId, actor) =>
                  seedPaidOrder(sb, tenantId, actor),
                  async (flag) => void (await sendStaffAlert(flag)),
                )
              : null,
            constructEvent: (body, sig, hookSecret) => {
              if (!stripe) throw new Error("stripe not configured");
              return stripe.webhooks.constructEvent(body, sig, hookSecret) as unknown as WebhookEvent;
            },
            log: console,
            // Thank-you email. Gated by EMAIL_MODE (unset = off) and deduped
            // in email_log, so Stripe retries never send it twice.
            onPaid: async (order, session, event) => {
              await sendThankYouEmail({
                order,
                stripeLivemode: typeof event.livemode === "boolean" ? event.livemode : null,
                monthlyFrom: session.metadata?.monthly_from,
              });
            },
          },
          raw,
          request.headers.get("stripe-signature") ?? "",
        );
        return new Response(result.body, { status: result.status });
      },
    },
  },
});
