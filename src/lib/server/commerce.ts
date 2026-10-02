import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import {
  PLANS,
  checkoutQuote,
  MONTHLY_START_LATEST_DAYS,
  monthlyStartSentence,
  onPaidTrial,
  isBillingKind,
  isPlanId,
  normalizePlan,
  type BillingKind,
  type PlanId,
} from "@/lib/catalog";
import { seedPaidOrder } from "@/lib/server/build";
import { sendStaffAlert } from "@/lib/server/journey-email";
import { OPEN_SESSION_MAX, expireOpenSessions, recentPendingCutoff } from "@/lib/server/checkout-sessions";
import {
  PLAN_CHECK_FAILED_MESSAGE,
  checkoutRefusal,
  trialAlreadyUsed,
  type GuardTenant,
  type StoredSubscription,
} from "@/lib/server/checkout-guard";
import { confirmPaymentFlow, supabasePaymentStore, type SupabaseLike } from "@/lib/server/payments";
import { env } from "@/lib/env.server";
import { actor } from "@/lib/server/staff-actor";
import { SUPABASE_ANON, SUPABASE_URL } from "@/lib/sb";

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "site"
  );
}

function sbFor(token: string) {
  const key = SUPABASE_ANON || env("VITE_SUPABASE_ANON_KEY") || env("VITE_SUPABASE_PUBLISHABLE_KEY") || "";
  const url = SUPABASE_URL;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function uid(token: string) {
  const sb = sbFor(token);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new Error("Sign in again.");
  return { sb, userId: data.user.id };
}

function stripeSecret() {
  return env("GROK_STRIPE_SECRET_KEY") ?? env("STRIPE_SECRET_KEY");
}

/** Service-role client, or null when SUPABASE_SERVICE_ROLE_KEY is not set. */
function sbAdmin() {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? env("GROK_SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Client for writes customers may not make themselves (payment status, Stripe
 * ids). Service role when configured; otherwise the caller's own client, which
 * stops working for these fields once supabase/entitlement-guard.sql is live.
 */
function moneyWriter(userSb: ReturnType<typeof sbFor>) {
  const admin = sbAdmin();
  if (!admin) {
    console.warn("[payments] SUPABASE_SERVICE_ROLE_KEY is not set; payment writes use the customer session");
  }
  return admin ?? userSb;
}

export const listMyTenants = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { sb, userId } = await uid(data.token);
    const { data: rows, error } = await sb
      .from("tenants")
      .select(
        "id, slug, name, legal, phone, email, domain, sites, features, ingest, plan, status, billing, site_count, stripe_subscription_id, trial_ends_at, term_months, principal_name, group_name, staff_json, created_at, stage",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      const { data: fallback, error: err2 } = await sb
        .from("tenants")
        .select("id, slug, name, legal, phone, email, domain, sites, features, ingest, plan, status")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (err2) throw new Error(err2.message);
      return (fallback ?? []).map((row) => ({
        ...row,
        billing: row.plan === "pilot" ? "trial" : "subscription",
        site_count: 1,
        stripe_subscription_id: null as string | null,
        trial_ends_at: null as string | null,
        term_months: null as number | null,
        principal_name: "",
        group_name: "",
        staff_json: "[]",
        created_at: null as string | null,
        stage: null as string | null,
      }));
    }
    return rows ?? [];
  });

export const listMyOrders = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { sb, userId } = await uid(data.token);
    const { data: rows, error } = await sb
      .from("orders")
      .select("id, plan, amount_pence, status, stripe_session_id, kind, site_count, tenant_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      const { data: fallback, error: err2 } = await sb
        .from("orders")
        .select("id, plan, amount_pence, status, stripe_session_id, tenant_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (err2) throw new Error(err2.message);
      return (fallback ?? []).map((row) => ({
        ...row,
        kind: row.plan === "pilot" ? "trial" : "subscription",
        site_count: 1,
      }));
    }
    return rows ?? [];
  });

export const listProvision = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }) => {
    const { sb } = await uid(data.token);
    const { data: rows, error } = await sb
      .from("provision_steps")
      .select("step, done, note")
      .eq("tenant_id", data.tenantId)
      .order("id");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertTenant = createServerFn({ method: "POST" })
  .validator(
    (d: {
      token: string;
      name: string;
      legal?: string;
      phone?: string;
      email?: string;
      domain?: string;
      sites?: string[];
      features?: Record<string, boolean>;
      ingest?: string;
      plan?: PlanId;
      billing?: BillingKind;
      siteCount?: number;
    }) => d,
  )
  .handler(async ({ data }) => {
    const { sb, userId } = await uid(data.token);
    const slug = slugify(data.name);
    const plan = normalizePlan(data.plan);
    const billing = data.billing ?? (plan === "site" ? "trial" : "subscription");
    if (billing === "trial" && plan !== "site") {
      throw new Error("The 60-day trial is only for a single site.");
    }
    const siteCount = Math.max(PLANS[plan].minSites, data.siteCount ?? (data.sites?.length || 1));
    const sites = JSON.stringify(data.sites ?? ["Main"]);
    const features = JSON.stringify(data.features ?? {});
    const patch = {
      name: data.name,
      legal: data.legal ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      domain: data.domain ?? "",
      sites,
      features,
      ingest: data.ingest ?? (plan === "site" && billing === "trial" ? "excel" : data.ingest ?? "excel"),
      plan,
      billing,
      site_count: siteCount,
      term_months: PLANS[plan].contractMonths,
    };
    const { data: existing } = await sb.from("tenants").select("id, status").eq("slug", slug).maybeSingle();
    if (existing?.id) {
      // Once a package is paid for, plan, billing, site count and term only
      // change through a verified checkout (or staff), never from this form.
      // Same rule as supabase/entitlement-guard.sql: only a briefing site
      // (nothing paid yet) may change its package here.
      if ((existing.status ?? "briefing") !== "briefing") {
        const { plan: _p, billing: _b, site_count: _s, term_months: _t, ...profile } = patch;
        const { error } = await sb.from("tenants").update(profile).eq("id", existing.id);
        if (error) throw new Error(error.message);
        return { id: existing.id as number, slug, plan, billing, siteCount };
      }
      const { error } = await sb.from("tenants").update(patch).eq("id", existing.id);
      if (error) {
        const { billing: _b, site_count: _s, term_months: _t, ...legacy } = patch;
        const { error: err2 } = await sb
          .from("tenants")
          .update({ ...legacy, plan: billing === "trial" ? "pilot" : plan })
          .eq("id", existing.id);
        if (err2) throw new Error(err2.message);
      }
      return { id: existing.id as number, slug, plan, billing, siteCount };
    }
    const insert = {
      user_id: userId,
      slug,
      ...patch,
      status: "briefing",
    };
    const { data: inserted, error } = await sb.from("tenants").insert(insert).select("id").single();
    if (error) {
      const { billing: _b, site_count: _s, term_months: _t, ...legacy } = patch;
      const { data: fallback, error: err2 } = await sb
        .from("tenants")
        .insert({
          user_id: userId,
          slug,
          ...legacy,
          plan: billing === "trial" ? "pilot" : plan,
          status: "briefing",
        })
        .select("id")
        .single();
      if (err2 || !fallback) throw new Error(err2?.message ?? error.message);
      const id = fallback.id as number;
      await sb.from("provision_steps").insert(
        ["brand", "config", "data", "ingest", "ship"].map((step) => ({
          tenant_id: id,
          user_id: userId,
          step,
          done: step === "data",
          note: step === "data" ? "Rows created for this site." : "",
        })),
      );
      return { id, slug, plan, billing, siteCount };
    }
    const id = inserted.id as number;
    await sb.from("provision_steps").insert(
      ["brand", "config", "data", "ingest", "ship"].map((step) => ({
        tenant_id: id,
        user_id: userId,
        step,
        done: step === "data",
        note: step === "data" ? "Rows created for this site." : "",
      })),
    );
    return { id, slug, plan, billing, siteCount };
  });

/** Internal setup checklist. Staff only: customers follow the six journey steps instead. */
export const toggleStep = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number; step: string; done: boolean }) => d)
  .handler(async ({ data }) => {
    // The one staff lookup (active member or confirmed hello@, never the domain).
    const { sb, team } = await actor(data.token);
    if (!team) throw new Error("Only staff change the setup checklist.");
    const { error } = await sb
      .from("provision_steps")
      .update({ done: data.done })
      .eq("tenant_id", data.tenantId)
      .eq("step", data.step);
    if (error) throw new Error(error.message);
  });

export const startCheckout = createServerFn({ method: "POST" })
  .validator(
    (d: {
      token: string;
      plan: PlanId;
      billing: BillingKind;
      origin: string;
      tenantId: number;
      siteCount?: number;
      convertFromTrial?: boolean;
    }) => d,
  )
  .handler(async ({ data }) => {
    if (!isPlanId(data.plan) || !isBillingKind(data.billing)) {
      return { url: null as string | null, message: "Pick a package first." };
    }
    if (data.billing === "trial" && data.plan !== "site") {
      return { url: null, message: "The 60-day trial is only for a single site." };
    }
    if (data.plan !== "site" && data.billing !== "subscription") {
      return { url: null, message: "Franchise and group start on a 12-month subscription." };
    }
    const plan = PLANS[data.plan];
    const siteCount = Math.max(plan.minSites, data.siteCount ?? 1);

    const { sb, userId } = await uid(data.token);
    const full = await sb
      .from("tenants")
      .select("id, email, name, plan, status, billing, stage, stripe_subscription_id")
      .eq("id", data.tenantId)
      .maybeSingle();
    const owned = (full.error
      ? (
          await sb
            .from("tenants")
            .select("id, email, name, plan, status, billing, stage")
            .eq("id", data.tenantId)
            .maybeSingle()
        ).data
      : full.data) as (GuardTenant & { email?: string | null }) | null;
    if (!owned) return { url: null, message: "No site on this account." };

    // Never sell the same desk twice (see checkout-guard.ts). This runs before
    // any order or Stripe session exists.
    const secret = stripeSecret();
    const Stripe = secret ? (await import("stripe")).default : null;
    const stripe = Stripe && secret ? new Stripe(secret) : null;
    let storedSubscription: StoredSubscription = null;
    if (owned.stripe_subscription_id && stripe) {
      try {
        const sub = await stripe.subscriptions.retrieve(owned.stripe_subscription_id);
        storedSubscription = { status: sub.status, cancel_at_period_end: sub.cancel_at_period_end, cancel_at: sub.cancel_at };
      } catch (err) {
        const code = (err as { code?: string; statusCode?: number } | null) ?? null;
        storedSubscription = code?.code === "resource_missing" || code?.statusCode === 404 ? "missing" : "unknown";
      }
    }
    const { data: mine } = await sb.from("tenants").select("id, name, plan, status, billing, stage").eq("user_id", userId);
    // One trial per site: a refunded or cancelled trial cannot buy another trial.
    let trialUsed = false;
    if (data.billing === "trial") {
      const { data: past, error: pastErr } = await moneyWriter(sb)
        .from("orders")
        .select("kind, plan, status")
        .eq("tenant_id", data.tenantId);
      if (pastErr) return { url: null, message: PLAN_CHECK_FAILED_MESSAGE };
      trialUsed = trialAlreadyUsed((past ?? []) as { kind?: string | null; plan?: string | null; status?: string | null }[]);
    }
    const refusal = checkoutRefusal({
      tenant: owned,
      billing: data.billing,
      convertFromTrial: data.convertFromTrial,
      storedSubscription,
      otherTenants: (mine ?? []) as GuardTenant[],
      trialUsed,
    });
    if (refusal) return { url: null, message: refusal };

    // One open Checkout per site: expire older open sessions for this tenant
    // so two tabs can never both be paid.
    if (stripe) {
      const { data: pending } = await sb
        .from("orders")
        .select("stripe_session_id")
        .eq("tenant_id", data.tenantId)
        .eq("status", "pending")
        .gte("created_at", recentPendingCutoff())
        .order("created_at", { ascending: false })
        .limit(OPEN_SESSION_MAX);
      await expireOpenSessions(
        {
          retrieve: (id) => stripe.checkout.sessions.retrieve(id),
          expire: (id) => stripe.checkout.sessions.expire(id),
          log: console,
        },
        ((pending ?? []) as Array<{ stripe_session_id?: string | null }>).map((o) => o.stripe_session_id),
      );
    }
    // One shared rule (catalog checkoutQuote) decides the charge, so the Pay
    // button on the account page always matches what Stripe takes. Monthly
    // billing starts at go live; a site already live starts it now.
    if (data.convertFromTrial && !onPaidTrial(owned)) {
      return { url: null, message: "The trial credit only applies to a site that is on the trial." };
    }
    const quote = checkoutQuote({
      plan: data.plan,
      billing: data.billing,
      siteCount,
      convertFromTrial: data.convertFromTrial,
      tenant: owned,
    });
    const { convert, monthlyNow } = quote;
    const setup = quote.setupPence;
    const monthly = quote.monthlyPence;
    const amount = quote.dueTodayPence;
    const kind = data.billing === "trial" ? "trial" : convert ? "convert" : "subscription";

    const orderInsert = {
      user_id: userId,
      tenant_id: data.tenantId,
      plan: data.plan,
      amount_pence: amount,
      status: "pending",
      kind,
      site_count: siteCount,
    };
    let orderId: number | null = null;
    const { data: order, error } = await sb.from("orders").insert(orderInsert).select("id").single();
    if (error) {
      const { data: fallback, error: err2 } = await sb
        .from("orders")
        .insert({
          user_id: userId,
          tenant_id: data.tenantId,
          plan: data.billing === "trial" ? "pilot" : data.plan,
          amount_pence: amount,
          status: "pending",
        })
        .select("id")
        .single();
      if (err2 || !fallback) return { url: null, message: err2?.message ?? error.message };
      orderId = fallback.id as number;
    } else {
      orderId = order.id as number;
    }

    const success = `${data.origin.replace(/\/$/, "")}/account?paid=1`;
    const cancel = `${data.origin.replace(/\/$/, "")}/account?canceled=1`;
    if (!secret || !stripe) {
      return {
        url: `/account?preview=1&order=${orderId}`,
        message: "Checkout is wired. Live card charges need STRIPE_SECRET_KEY on Vercel.",
      };
    }

    const metadata = {
      user_id: userId,
      tenant_id: String(data.tenantId),
      order_id: String(orderId),
      plan: data.plan,
      billing: data.billing,
      kind,
      site_count: String(siteCount),
    };

    const productName =
      data.billing === "trial"
        ? "Forecourt 60-day site trial"
        : `Forecourt ${plan.name}`;

    const termsText = {
      submit: {
        message: monthlyNow || data.billing === "trial"
          ? "Paying agrees to Forecourt terms at https://www.forecourt.me/terms, including when setup is not refundable."
          : `Today you pay the one-off setup only. ${monthlyStartSentence(monthly)} The date Stripe shows is the latest it could start. Paying agrees to Forecourt terms at https://www.forecourt.me/terms, including when setup is not refundable.`,
      },
    };

    const session =
      data.billing === "trial"
        ? await stripe.checkout.sessions.create({
            mode: "payment",
            success_url: `${success}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancel,
            customer_email: owned.email || undefined,
            customer_creation: "always",
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "gbp",
                  unit_amount: setup,
                  product_data: {
                    name: productName,
                    description: "One site, 60 days. Comes off the setup if you stay.",
                  },
                },
              },
            ],
            metadata,
            invoice_creation: { enabled: true },
            custom_text: termsText,
          })
        : await stripe.checkout.sessions.create({
            mode: "subscription",
            success_url: `${success}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancel,
            customer_email: owned.email || undefined,
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "gbp",
                  unit_amount: setup,
                  product_data: {
                    name: `${productName} (setup)`,
                    description: convert
                      ? "Remaining setup after the 60-day trial. Paid once, today."
                      : plan.contractMonths
                        ? `One-off setup, paid today. ${plan.contractMonths} month contract from go live.`
                        : "One-off setup, paid today.",
                  },
                },
              },
              {
                quantity: plan.perSite ? siteCount : 1,
                price_data: {
                  currency: "gbp",
                  unit_amount: plan.monthPence,
                  recurring: { interval: "month" },
                  product_data: {
                    name: plan.perSite ? `${productName} (per site)` : productName,
                    description: `${plan.perSite ? `${gbp(monthly)} a month for ${siteCount} sites` : `${gbp(monthly)} a month`}${
                      monthlyNow
                        ? ", starting today."
                        : `, starting on your go live day, or ${MONTHLY_START_LATEST_DAYS} days after payment if that comes first.`
                    }`,
                  },
                },
              },
            ],
            metadata: { ...metadata, monthly_from: monthlyNow ? "checkout" : "go_live" },
            subscription_data: {
              metadata: { ...metadata, monthly_from: monthlyNow ? "checkout" : "go_live" },
              // Setup is charged now; the monthly price waits until go live.
              // markLive ends this early with trial_end=now (see billing-start.ts).
              ...(monthlyNow
                ? {}
                : {
                    trial_period_days: MONTHLY_START_LATEST_DAYS,
                    trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } },
                  }),
            },
            custom_text: termsText,
          });

    // Recorded with the service role; confirmation also works without it,
    // because the session carries order_id in its metadata.
    const { error: linkError } = await moneyWriter(sb)
      .from("orders")
      .update({ stripe_session_id: session.id })
      .eq("id", orderId);
    if (linkError) console.error("[payments] could not record the checkout session on order", orderId, linkError.message);
    return { url: session.url, message: null as string | null };
  });

function gbp(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(
    pence / 100,
  );
}

export const confirmPayment = createServerFn({ method: "POST" })
  .validator((d: { token: string; sessionId?: string; previewOrderId?: number }) => d)
  .handler(async ({ data }) => {
    const { sb, userId } = await uid(data.token);
    const secret = stripeSecret();
    const writer = moneyWriter(sb);
    const store = supabasePaymentStore(writer as unknown as SupabaseLike, (tenantId, actor) =>
      seedPaidOrder(writer, tenantId, actor),
      async (flag) => void (await sendStaffAlert(flag)),
    );
    try {
      const result = await confirmPaymentFlow(
        {
          stripeSecret: secret,
          userId,
          store,
          log: console,
          retrieveSession: async (id) => {
            const Stripe = (await import("stripe")).default;
            const stripe = new Stripe(secret as string);
            return await stripe.checkout.sessions.retrieve(id);
          },
        },
        { sessionId: data.sessionId, previewOrderId: data.previewOrderId },
      );
      return { ok: result.ok };
    } catch (err) {
      console.error("[payments] confirmPayment failed:", err);
      return { ok: false };
    }
  });
