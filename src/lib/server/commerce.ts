import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { PLANS, type PlanId } from "@/lib/catalog";
import { getSql } from "@/lib/db";
import { env } from "@/lib/env.server";

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "rooftop"
  );
}

export const listMyTenants = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{
      id: number;
      slug: string;
      name: string;
      legal: string;
      phone: string;
      email: string;
      domain: string;
      sites: string;
      features: string;
      ingest: string;
      plan: string;
      status: string;
    }>`select id, slug, name, legal, phone, email, domain, sites, features, ingest, plan, status from tenants where user_id = ${context.userId} order by created_at desc`;
  });

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{
      id: number;
      plan: string;
      amount_pence: number;
      status: string;
      stripe_session_id: string | null;
    }>`select id, plan, amount_pence, status, stripe_session_id from orders where user_id = ${context.userId} order by created_at desc`;
  });

export const listProvision = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((tenantId: number) => tenantId)
  .handler(async ({ context, data: tenantId }) => {
    const sql = await getSql();
    return sql<{ step: string; done: boolean; note: string }>`
      select step, done, note from provision_steps
      where tenant_id = ${tenantId} and user_id = ${context.userId}
      order by id`;
  });

export const upsertTenant = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
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
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const slug = slugify(data.name);
    const sites = JSON.stringify(data.sites ?? ["Main"]);
    const features = JSON.stringify(data.features ?? {});
    const existing = await sql<{ id: number }>`
      select id from tenants where user_id = ${context.userId} and slug = ${slug}`;
    if (existing[0]) {
      await sql`
        update tenants set
          name = ${data.name},
          legal = ${data.legal ?? ""},
          phone = ${data.phone ?? ""},
          email = ${data.email ?? ""},
          domain = ${data.domain ?? ""},
          sites = ${sites},
          features = ${features},
          ingest = ${data.ingest ?? "excel"}
        where id = ${existing[0].id} and user_id = ${context.userId}`;
      return { id: existing[0].id, slug };
    }
    const inserted = await sql<{ id: number }>`
      insert into tenants (user_id, slug, name, legal, phone, email, domain, sites, features, ingest, plan, status)
      values (
        ${context.userId}, ${slug}, ${data.name}, ${data.legal ?? ""}, ${data.phone ?? ""},
        ${data.email ?? ""}, ${data.domain ?? ""}, ${sites}, ${features},
        ${data.ingest ?? "excel"}, ${data.plan ?? "pilot"}, 'briefing'
      ) returning id`;
    const id = inserted[0]!.id;
    for (const step of ["brand", "config", "data", "ingest", "ship"]) {
      await sql`
        insert into provision_steps (tenant_id, user_id, step, done, note)
        values (${id}, ${context.userId}, ${step}, ${step === "data"}, ${step === "data" ? "Rows created for this rooftop." : ""})`;
    }
    return { id, slug };
  });

export const toggleStep = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { tenantId: number; step: string; done: boolean }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      update provision_steps set done = ${data.done}
      where tenant_id = ${data.tenantId} and user_id = ${context.userId} and step = ${data.step}`;
  });

export const startCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { plan: PlanId; origin: string; tenantId: number }) => d)
  .handler(async ({ context, data }) => {
    const plan = PLANS[data.plan];
    if (!plan || !plan.sellNow) {
      return { url: null as string | null, message: "This plan is invoiced after go-live, not taken at checkout." };
    }
    const sql = await getSql();
    const owned = await sql<{ id: number }>`
      select id from tenants where id = ${data.tenantId} and user_id = ${context.userId}`;
    if (!owned[0]) return { url: null, message: "No rooftop on this account." };

    const order = await sql<{ id: number }>`
      insert into orders (user_id, tenant_id, plan, amount_pence, status)
      values (${context.userId}, ${data.tenantId}, ${plan.id}, ${plan.setupPence}, 'pending')
      returning id`;

    const secret = env("GROK_STRIPE_SECRET_KEY") ?? env("STRIPE_SECRET_KEY");
    const success =
      env("GROK_PAYMENT_SUCCESS_URL") ?? `${data.origin.replace(/\/$/, "")}/account?paid=1`;
    const cancel = env("GROK_PAYMENT_CANCEL_URL") ?? `${data.origin.replace(/\/$/, "")}/account?canceled=1`;

    if (!secret) {
      return {
        url: `/account?preview=1&order=${order[0]!.id}`,
        message: "Checkout is wired. Live card charges run on the published app.",
      };
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${success}${success.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
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
        user_id: context.userId,
        tenant_id: String(data.tenantId),
        order_id: String(order[0]!.id),
        plan: plan.id,
      },
    });

    await sql`
      update orders set stripe_session_id = ${session.id}
      where id = ${order[0]!.id} and user_id = ${context.userId}`;

    return { url: session.url, message: null as string | null };
  });

export const confirmPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { sessionId?: string; previewOrderId?: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    if (data.previewOrderId) {
      await sql`
        update orders set status = 'paid'
        where id = ${data.previewOrderId} and user_id = ${context.userId}`;
      await sql`
        update tenants set status = 'paid'
        where user_id = ${context.userId} and id in (
          select tenant_id from orders where id = ${data.previewOrderId} and user_id = ${context.userId}
        )`;
      return { ok: true };
    }
    if (!data.sessionId) return { ok: false };
    const secret = env("GROK_STRIPE_SECRET_KEY") ?? env("STRIPE_SECRET_KEY");
    if (!secret) return { ok: false };
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.retrieve(data.sessionId);
    if (session.payment_status !== "paid" && session.status !== "complete") return { ok: false };
    await sql`
      update orders set status = 'paid'
      where stripe_session_id = ${data.sessionId} and user_id = ${context.userId}`;
    const row = await sql<{ tenant_id: number | null }>`
      select tenant_id from orders where stripe_session_id = ${data.sessionId} and user_id = ${context.userId}`;
    if (row[0]?.tenant_id) {
      await sql`update tenants set status = 'paid' where id = ${row[0].tenant_id} and user_id = ${context.userId}`;
    }
    return { ok: true };
  });
