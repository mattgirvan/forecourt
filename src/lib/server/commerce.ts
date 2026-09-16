import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import {
  PLANS,
  firstChargePence,
  isBillingKind,
  isPlanId,
  monthTotalPence,
  normalizeBilling,
  normalizePlan,
  setupDuePence,
  type BillingKind,
  type PlanId,
} from "@/lib/catalog";
import { seedPaidOrder } from "@/lib/server/build";
import { env } from "@/lib/env.server";
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

export const listMyTenants = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { sb, userId } = await uid(data.token);
    const { data: rows, error } = await sb
      .from("tenants")
      .select(
        "id, slug, name, legal, phone, email, domain, sites, features, ingest, plan, status, billing, site_count, stripe_subscription_id, trial_ends_at, term_months, principal_name, group_name, staff_json, created_at",
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
      .select("id, plan, amount_pence, status, stripe_session_id, kind, site_count")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      const { data: fallback, error: err2 } = await sb
        .from("orders")
        .select("id, plan, amount_pence, status, stripe_session_id")
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
    const { data: existing } = await sb.from("tenants").select("id").eq("slug", slug).maybeSingle();
    if (existing?.id) {
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

export const toggleStep = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number; step: string; done: boolean }) => d)
  .handler(async ({ data }) => {
    const { sb } = await uid(data.token);
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
    const convert = Boolean(data.convertFromTrial && data.plan === "site");
    const setup = setupDuePence(data.plan, data.billing, convert);
    const monthly = monthTotalPence(data.plan, siteCount);
    const amount = firstChargePence(data.plan, data.billing, siteCount, convert);
    const kind = data.billing === "trial" ? "trial" : convert ? "convert" : "subscription";

    const { sb, userId } = await uid(data.token);
    const { data: owned } = await sb.from("tenants").select("id, email, name").eq("id", data.tenantId).maybeSingle();
    if (!owned) return { url: null, message: "No site on this account." };

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
    const secret = stripeSecret();

    if (!secret) {
      return {
        url: `/account?preview=1&order=${orderId}`,
        message: "Checkout is wired. Live card charges need STRIPE_SECRET_KEY on Vercel.",
      };
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secret);
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
        ? "Forecourt — 60-day site trial"
        : `Forecourt — ${plan.name}`;

    const termsText = {
      submit: {
        message: "Paying agrees to Forecourt terms at https://www.forecourt.me/terms — including when setup is not refundable.",
      },
    };

    const session =
      data.billing === "trial"
        ? await stripe.checkout.sessions.create({
            mode: "payment",
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
                    name: `${productName} — setup`,
                    description: convert
                      ? "Remaining setup after the 60-day trial."
                      : plan.contractMonths
                        ? `${plan.contractMonths}-month contract. Setup billed once.`
                        : "One-time setup.",
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
                    name: plan.perSite ? `${productName} — per site` : productName,
                    description: plan.perSite
                      ? `${gbp(monthly)} / month for ${siteCount} sites.`
                      : `${gbp(monthly)} / month.`,
                  },
                },
              },
            ],
            metadata,
            subscription_data: {
              metadata,
            },
            custom_text: termsText,
          });

    await sb.from("orders").update({ stripe_session_id: session.id }).eq("id", orderId);
    return { url: session.url, message: null as string | null };
  });

function gbp(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(
    pence / 100,
  );
}

async function markPaid(
  sb: ReturnType<typeof sbFor>,
  args: {
    orderId?: number;
    sessionId?: string;
    subscriptionId?: string | null;
    customerId?: string | null;
    billing?: BillingKind;
    plan?: PlanId;
  },
) {
  if (args.orderId) {
    await sb.from("orders").update({ status: "paid" }).eq("id", args.orderId);
  }
  if (args.sessionId) {
    await sb.from("orders").update({ status: "paid" }).eq("stripe_session_id", args.sessionId);
  }
  const { data: row } = args.orderId
    ? await sb.from("orders").select("tenant_id, plan").eq("id", args.orderId).maybeSingle()
    : args.sessionId
      ? await sb.from("orders").select("tenant_id, plan").eq("stripe_session_id", args.sessionId).maybeSingle()
      : { data: null };
  if (!row?.tenant_id) return;
  const plan = normalizePlan(args.plan ?? row.plan);
  const billing = args.billing ?? normalizeBilling(plan, row.plan);
  const status = billing === "trial" ? "trial" : "subscribed";
  const trialEnds =
    billing === "trial" ? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() : null;
  const patch: Record<string, unknown> = {
    status,
    plan,
    billing,
    trial_ends_at: trialEnds,
  };
  if (args.subscriptionId) patch.stripe_subscription_id = args.subscriptionId;
  if (args.customerId) patch.stripe_customer_id = args.customerId;
  const { error } = await sb.from("tenants").update(patch).eq("id", row.tenant_id);
  if (error) {
    await sb.from("tenants").update({ status: billing === "trial" ? "paid" : "paid", plan }).eq("id", row.tenant_id);
  }
  try {
    await seedPaidOrder(sb, row.tenant_id as number, "checkout");
  } catch {
    /* build tables may not be live yet */
  }
}

export const confirmPayment = createServerFn({ method: "POST" })
  .validator((d: { token: string; sessionId?: string; previewOrderId?: number }) => d)
  .handler(async ({ data }) => {
    const { sb } = await uid(data.token);
    if (data.previewOrderId) {
      await markPaid(sb, { orderId: data.previewOrderId, billing: "trial", plan: "site" });
      return { ok: true };
    }
    if (!data.sessionId) return { ok: false };
    const secret = stripeSecret();
    if (!secret) return { ok: false };
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.retrieve(data.sessionId);
    if (session.payment_status !== "paid" && session.status !== "complete") return { ok: false };
    const billing = isBillingKind(session.metadata?.billing) ? session.metadata.billing : session.mode === "subscription" ? "subscription" : "trial";
    const plan = normalizePlan(session.metadata?.plan);
    await markPaid(sb, {
      sessionId: data.sessionId,
      subscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null,
      customerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
      billing,
      plan,
    });
    return { ok: true };
  });
