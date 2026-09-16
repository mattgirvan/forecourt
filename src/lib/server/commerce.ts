import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { PLANS, type PlanId } from "@/lib/catalog";
import { env } from "@/lib/env.server";
import { SUPABASE_ANON, SUPABASE_URL } from "@/lib/sb";

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "rooftop"
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

export const listMyTenants = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { sb } = await uid(data.token);
    const { data: rows, error } = await sb
      .from("tenants")
      .select("id, slug, name, legal, phone, email, domain, sites, features, ingest, plan, status")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listMyOrders = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { sb } = await uid(data.token);
    const { data: rows, error } = await sb
      .from("orders")
      .select("id, plan, amount_pence, status, stripe_session_id")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
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
    }) => d,
  )
  .handler(async ({ data }) => {
    const { sb, userId } = await uid(data.token);
    const slug = slugify(data.name);
    const sites = JSON.stringify(data.sites ?? ["Main"]);
    const features = JSON.stringify(data.features ?? {});
    const { data: existing } = await sb.from("tenants").select("id").eq("slug", slug).maybeSingle();
    if (existing?.id) {
      const { error } = await sb
        .from("tenants")
        .update({
          name: data.name,
          legal: data.legal ?? "",
          phone: data.phone ?? "",
          email: data.email ?? "",
          domain: data.domain ?? "",
          sites,
          features,
          ingest: data.ingest ?? "excel",
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { id: existing.id as number, slug };
    }
    const { data: inserted, error } = await sb
      .from("tenants")
      .insert({
        user_id: userId,
        slug,
        name: data.name,
        legal: data.legal ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
        domain: data.domain ?? "",
        sites,
        features,
        ingest: data.ingest ?? "excel",
        plan: data.plan ?? "pilot",
        status: "briefing",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const id = inserted.id as number;
    await sb.from("provision_steps").insert(
      ["brand", "config", "data", "ingest", "ship"].map((step) => ({
        tenant_id: id,
        user_id: userId,
        step,
        done: step === "data",
        note: step === "data" ? "Rows created for this rooftop." : "",
      })),
    );
    return { id, slug };
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
  .validator((d: { token: string; plan: PlanId; origin: string; tenantId: number }) => d)
  .handler(async ({ data }) => {
    const plan = PLANS[data.plan];
    if (!plan || !plan.sellNow) {
      return { url: null as string | null, message: "This plan is invoiced after go-live, not taken at checkout." };
    }
    const { sb, userId } = await uid(data.token);
    const { data: owned } = await sb.from("tenants").select("id").eq("id", data.tenantId).maybeSingle();
    if (!owned) return { url: null, message: "No rooftop on this account." };

    const { data: order, error } = await sb
      .from("orders")
      .insert({
        user_id: userId,
        tenant_id: data.tenantId,
        plan: plan.id,
        amount_pence: plan.setupPence,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !order) return { url: null, message: error?.message ?? "Could not open an order." };

    const secret = env("GROK_STRIPE_SECRET_KEY") ?? env("STRIPE_SECRET_KEY");
    const success = `${data.origin.replace(/\/$/, "")}/account?paid=1`;
    const cancel = `${data.origin.replace(/\/$/, "")}/account?canceled=1`;

    if (!secret) {
      return {
        url: `/account?preview=1&order=${order.id}`,
        message: "Checkout is wired. Live card charges need STRIPE_SECRET_KEY on Vercel.",
      };
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${success}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: plan.setupPence,
            product_data: {
              name: `Forecourt — ${plan.name}`,
              description: plan.body,
            },
          },
        },
      ],
      metadata: {
        user_id: userId,
        tenant_id: String(data.tenantId),
        order_id: String(order.id),
        plan: plan.id,
      },
    });

    await sb.from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);
    return { url: session.url, message: null as string | null };
  });

export const confirmPayment = createServerFn({ method: "POST" })
  .validator((d: { token: string; sessionId?: string; previewOrderId?: number }) => d)
  .handler(async ({ data }) => {
    const { sb } = await uid(data.token);
    if (data.previewOrderId) {
      await sb.from("orders").update({ status: "paid" }).eq("id", data.previewOrderId);
      const { data: row } = await sb.from("orders").select("tenant_id").eq("id", data.previewOrderId).maybeSingle();
      if (row?.tenant_id) await sb.from("tenants").update({ status: "paid" }).eq("id", row.tenant_id);
      return { ok: true };
    }
    if (!data.sessionId) return { ok: false };
    const secret = env("GROK_STRIPE_SECRET_KEY") ?? env("STRIPE_SECRET_KEY");
    if (!secret) return { ok: false };
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.retrieve(data.sessionId);
    if (session.payment_status !== "paid" && session.status !== "complete") return { ok: false };
    await sb.from("orders").update({ status: "paid" }).eq("stripe_session_id", data.sessionId);
    const { data: row } = await sb.from("orders").select("tenant_id").eq("stripe_session_id", data.sessionId).maybeSingle();
    if (row?.tenant_id) await sb.from("tenants").update({ status: "paid" }).eq("id", row.tenant_id);
    return { ok: true };
  });
