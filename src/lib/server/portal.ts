import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { gbpPence, normalizeBilling, normalizePlan } from "@/lib/catalog";
import { SUPABASE_ANON, SUPABASE_URL } from "@/lib/sb";
import { SITE } from "@/lib/site";
import { TEAM_EMAILS, type StaffRole, type StaffStatus } from "@/lib/team";
import { actor, sbAdmin, stripeSecret } from "@/lib/server/staff-actor";
import { startMonthlyForTenant } from "@/lib/server/billing-go-live";
import { tenantEnded } from "@/lib/server/billing-start";
import {
  ALL_REFUNDED_TEXT,
  findRefundTarget,
  duplicateHandledProblem,
  flaggedDuplicateSessions,
  flaggedDuplicateSubscriptions,
  refundConfirmText,
  sessionIdsIn,
  type SessionLike,
} from "@/lib/server/refund-target";
import { BALANCE_LINK_TITLE, ENDED_EVENT_TITLES } from "@/lib/server/resume-order";
import { FLAG_HANDLED_TITLE, FLAG_TITLES, boardFlags, handledNote, type FlagKind } from "@/lib/server/payments";

export const whoAmI = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { email, team, role, name } = await actor(data.token);
    return { email, team, role, name };
  });

export const listAllTenants = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { sb, team } = await actor(data.token);
    if (!team) throw new Error("Office is for the Forecourt team.");
    const { data: rows, error } = await sb
      .from("tenants")
      .select(
        "id, slug, name, legal, phone, email, domain, sites, features, ingest, plan, status, billing, site_count, stripe_customer_id, stripe_subscription_id, trial_ends_at, term_months, principal_name, group_name, research, staff_json, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listOfficeBoard = createServerFn({ method: "POST" })
  .validator((d: { token: string; showArchived?: boolean }) => d)
  .handler(async ({ data }) => {
    const { sb, team } = await actor(data.token);
    if (!team) throw new Error("Office is for the Forecourt team.");
    const showArchived = Boolean(data.showArchived);
    const selectFull =
      "id, name, email, phone, plan, status, billing, site_count, trial_ends_at, term_months, group_name, principal_name, created_at, stage, archived_at";
    const selectFallback =
      "id, name, email, phone, plan, status, billing, site_count, trial_ends_at, term_months, group_name, principal_name, created_at";
    let q = sb.from("tenants").select(selectFull).order("created_at", { ascending: false });
    q = showArchived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    const { data: rows, error } = await q;
    type TenantBoard = {
      id: number;
      name: string;
      email: string | null;
      phone: string | null;
      plan: string;
      status: string;
      billing: string | null;
      site_count: number | null;
      trial_ends_at: string | null;
      term_months: number | null;
      group_name: string | null;
      principal_name: string | null;
      created_at: string | null;
      stage: string | null;
      archived_at: string | null;
    };
    let tenants: TenantBoard[] = [];
    if (error) {
      // Column may not exist yet — fall back and treat everyone as active.
      let fb = sb.from("tenants").select(selectFallback).order("created_at", { ascending: false });
      const { data: fallbackRows, error: fbErr } = await fb;
      if (fbErr) throw new Error(fbErr.message);
      tenants = (fallbackRows ?? []).map((row) => ({
        ...(row as Omit<TenantBoard, "stage" | "archived_at">),
        stage: null,
        archived_at: null,
      }));
      if (showArchived) tenants = [];
    } else {
      tenants = (rows ?? []).map((row) => {
        const r = row as TenantBoard;
        return { ...r, stage: r.stage ?? null, archived_at: r.archived_at ?? null };
      });
    }
    const ids = tenants.map((t) => t.id);
    const lastBy: Record<
      number,
      { at: string; from_team: boolean }
    > = {};
    if (ids.length) {
      const { data: msgs } = await sb
        .from("messages")
        .select("tenant_id, from_team, created_at")
        .in("tenant_id", ids)
        .order("created_at", { ascending: false });
      for (const m of msgs ?? []) {
        const id = m.tenant_id as number;
        if (lastBy[id]) continue;
        lastBy[id] = { at: m.created_at as string, from_team: Boolean(m.from_team) };
      }
    }
    // Duplicate and look-alike flags as badges, so staff see them without opening the file.
    let flags: ReturnType<typeof boardFlags> = {};
    if (ids.length) {
      const { data: flagged } = await sb
        .from("build_events")
        .select("tenant_id, title, body, created_at")
        .in("tenant_id", ids)
        .in("title", [FLAG_TITLES.duplicate_payment, FLAG_TITLES.similar_dealer, FLAG_HANDLED_TITLE])
        .order("created_at", { ascending: true });
      flags = boardFlags((flagged ?? []) as { tenant_id: number; title: string | null; body: string | null; created_at: string }[]);
    }
    return tenants.map((t) => ({
      ...t,
      flags: flags[t.id] ?? null,
      last_message_at: lastBy[t.id]?.at ?? null,
      waiting: lastBy[t.id] ? !lastBy[t.id].from_team : t.stage === "paid" || t.stage === "brief",
    }));
  });

export const getTenantFile = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }) => {
    const { sb, team, userId } = await actor(data.token);
    const q = sb
      .from("tenants")
      .select(
        "id, slug, name, legal, phone, email, domain, sites, features, ingest, plan, status, billing, site_count, stripe_customer_id, stripe_subscription_id, trial_ends_at, term_months, principal_name, group_name, research, staff_json, created_at, user_id, signed_off_at, cancelled_at, archived_at",
      )
      .eq("id", data.tenantId)
      .maybeSingle();
    let { data: row, error } = await q;
    if (error) {
      const fallback = await sb
        .from("tenants")
        .select(
          "id, slug, name, legal, phone, email, domain, sites, features, ingest, plan, status, billing, site_count, stripe_customer_id, stripe_subscription_id, trial_ends_at, term_months, principal_name, group_name, research, staff_json, created_at, user_id",
        )
        .eq("id", data.tenantId)
        .maybeSingle();
      row = fallback.data
        ? { ...fallback.data, signed_off_at: null, cancelled_at: null, archived_at: null }
        : null;
      error = fallback.error;
    }
    if (error) throw new Error(error.message);
    if (!row) throw new Error("No dealership on this account.");
    if (!team && row.user_id !== userId) throw new Error("No dealership on this account.");
    const research = team ? row.research : "";
    return { ...row, research };
  });

export const saveTenantFile = createServerFn({ method: "POST" })
  .validator(
    (d: {
      token: string;
      tenantId: number;
      principal_name?: string;
      group_name?: string;
      research?: string;
      staff_json?: string;
      phone?: string;
      email?: string;
      domain?: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    const { sb, team, userId } = await actor(data.token);
    const patch: Record<string, string> = {};
    if (data.principal_name !== undefined) patch.principal_name = data.principal_name;
    if (data.group_name !== undefined) patch.group_name = data.group_name;
    if (data.staff_json !== undefined) patch.staff_json = data.staff_json;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.email !== undefined) patch.email = data.email;
    if (data.domain !== undefined) patch.domain = data.domain;
    if (data.research !== undefined) {
      if (!team) throw new Error("Research notes are team-only.");
      patch.research = data.research;
    }
    if (!Object.keys(patch).length) return { ok: true };
    let q = sb.from("tenants").update(patch).eq("id", data.tenantId);
    if (!team) q = q.eq("user_id", userId);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setTenantArchived = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number; archived: boolean }) => d)
  .handler(async ({ data }) => {
    const { sb, team } = await actor(data.token);
    if (!team) throw new Error("Office is for the Forecourt team.");
    const archived_at = data.archived ? new Date().toISOString() : null;
    const { error } = await sb.from("tenants").update({ archived_at }).eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true as const, archived_at };
  });

export const listNotes = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }) => {
    const { sb, team } = await actor(data.token);
    let q = sb
      .from("notes")
      .select("id, body, visibility, author_email, created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false });
    if (!team) q = q.eq("visibility", "customer");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addNote = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number; body: string; visibility?: "customer" | "internal" }) => d)
  .handler(async ({ data }) => {
    const { sb, userId, email, team } = await actor(data.token);
    const visibility = data.visibility === "internal" ? "internal" : "customer";
    if (visibility === "internal" && !team) throw new Error("Internal notes are team-only.");
    const body = data.body.trim();
    if (!body) throw new Error("Write a note first.");
    const { error } = await sb.from("notes").insert({
      tenant_id: data.tenantId,
      user_id: userId,
      author_email: email,
      visibility,
      body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMessages = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }) => {
    const { sb } = await actor(data.token);
    const { data: rows, error } = await sb
      .from("messages")
      .select("id, body, from_team, author_email, created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const sendMessage = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number; body: string }) => d)
  .handler(async ({ data }) => {
    const { sb, userId, email, team } = await actor(data.token);
    const body = data.body.trim();
    if (!body) throw new Error("Write a message first.");
    const { error } = await sb.from("messages").insert({
      tenant_id: data.tenantId,
      user_id: userId,
      author_email: email,
      from_team: team,
      body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listReceipts = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }) => {
    const { sb, team, userId } = await actor(data.token);
    const { data: tenant, error: tErr } = await sb
      .from("tenants")
      .select("id, stripe_customer_id, user_id")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!tenant) return [];
    if (!team && tenant.user_id !== userId) return [];

    const { data: orders } = await sb
      .from("orders")
      .select("id, plan, amount_pence, status, kind, created_at, stripe_session_id")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false });

    const local = (orders ?? []).map((o) => ({
      id: `order-${o.id}`,
      label: `${normalizePlan(o.plan)}${o.kind ? ` · ${o.kind}` : ""}`,
      amount: gbpPence(o.amount_pence),
      status: o.status,
      date: o.created_at as string | undefined,
      url: null as string | null,
    }));

    const secret = stripeSecret();
    const customer = tenant.stripe_customer_id as string | null;
    if (!secret || !customer) return local;

    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(secret);
      const invoices = await stripe.invoices.list({ customer, limit: 24 });
      const fromStripe = invoices.data.map((inv) => ({
        id: inv.id,
        label: inv.lines.data[0]?.description || inv.description || "Invoice",
        amount: gbpPence(inv.amount_paid || inv.amount_due || 0),
        status: inv.status ?? "open",
        date: inv.created ? new Date(inv.created * 1000).toISOString() : undefined,
        url: inv.hosted_invoice_url ?? inv.invoice_pdf ?? null,
      }));
      if (fromStripe.length) return fromStripe;
    } catch {
      /* fall through to orders */
    }
    return local;
  });

export const listStaff = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { sb, team } = await actor(data.token);
    if (!team) throw new Error("Office is for the Forecourt team.");
    const { data: rows, error } = await sb
      .from("team_members")
      .select("email, name, role, status, invited_by, created_at, last_seen_at")
      .order("created_at", { ascending: true });
    if (error) {
      return TEAM_EMAILS.map((email) => ({
        email,
        name: "Matt Girvan",
        role: "owner" as StaffRole,
        status: "active" as StaffStatus,
        invited_by: "",
        created_at: null as string | null,
        last_seen_at: null as string | null,
      }));
    }
    return rows ?? [];
  });

async function sendSignIn(email: string, toOffice: boolean) {
  const admin = sbAdmin() ?? createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const redirect = `${SITE.url}/login`;
  const { error } = await admin.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect, shouldCreateUser: true },
  });
  if (error) throw new Error(error.message);
}

export const inviteStaff = createServerFn({ method: "POST" })
  .validator((d: { token: string; email: string; name?: string; role?: StaffRole }) => d)
  .handler(async ({ data }) => {
    const { sb, team, role, email: by } = await actor(data.token);
    if (!team) throw new Error("Office is for the Forecourt team.");
    if (role !== "owner") throw new Error("Only an owner can add staff.");
    const email = data.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("Need an email.");
    const staffRole: StaffRole = data.role === "owner" ? "owner" : "operator";
    const { error } = await sb.from("team_members").upsert(
      {
        email,
        name: (data.name ?? "").trim(),
        role: staffRole,
        status: "invited",
        invited_by: by,
      },
      { onConflict: "email" },
    );
    if (error) throw new Error(error.message);
    await sb.from("team_emails").upsert({ email });
    await sendSignIn(email, true);
    return { ok: true };
  });

export const setStaffRole = createServerFn({ method: "POST" })
  .validator((d: { token: string; email: string; role: StaffRole }) => d)
  .handler(async ({ data }) => {
    const { sb, team, role, email } = await actor(data.token);
    if (!team || role !== "owner") throw new Error("Only an owner can change roles.");
    const target = data.email.trim().toLowerCase();
    if (target === email && data.role !== "owner") {
      const { data: owners } = await sb.from("team_members").select("email").eq("role", "owner").eq("status", "active");
      if ((owners ?? []).length <= 1) throw new Error("Keep at least one owner.");
    }
    const { error } = await sb.from("team_members").update({ role: data.role }).eq("email", target);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setStaffStatus = createServerFn({ method: "POST" })
  .validator((d: { token: string; email: string; status: StaffStatus }) => d)
  .handler(async ({ data }) => {
    const { sb, team, role, email } = await actor(data.token);
    if (!team || role !== "owner") throw new Error("Only an owner can change access.");
    const target = data.email.trim().toLowerCase();
    if (target === email && data.status === "revoked") throw new Error("You cannot revoke yourself.");
    if (data.status === "revoked") {
      const { data: row } = await sb.from("team_members").select("role").eq("email", target).maybeSingle();
      if (row?.role === "owner") {
        const { data: owners } = await sb.from("team_members").select("email").eq("role", "owner").eq("status", "active");
        if ((owners ?? []).filter((o) => o.email !== target).length < 1) {
          throw new Error("Keep at least one owner.");
        }
      }
      await sb.from("team_emails").delete().eq("email", target);
    } else {
      await sb.from("team_emails").upsert({ email: target });
    }
    const { error } = await sb.from("team_members").update({ status: data.status }).eq("email", target);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendStaffSignIn = createServerFn({ method: "POST" })
  .validator((d: { token: string; email: string }) => d)
  .handler(async ({ data }) => {
    const { team, role } = await actor(data.token);
    if (!team || role !== "owner") throw new Error("Only an owner can send a sign-in.");
    const email = data.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("Need an email.");
    await sendSignIn(email, true);
    return { ok: true };
  });

export const addTeamEmail = createServerFn({ method: "POST" })
  .validator((d: { token: string; email: string }) => d)
  .handler(async ({ data }) => {
    return inviteStaff({ data: { token: data.token, email: data.email, role: "operator" } });
  });

type StripeClient = InstanceType<typeof import("stripe").default>;

/** Customer, subscription and the setup payment for a file (read only). */
async function locateStripeFile(
  admin: SupabaseClient,
  stripe: StripeClient,
  tenantId: number,
  tenant: { stripe_customer_id?: unknown; stripe_subscription_id?: unknown; cancelled_at?: unknown },
) {
  const { data: orders } = await admin
    .from("orders")
    .select("id, stripe_session_id, stripe_subscription_id, status")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(8);
  // Flags, end marks and balance links on the timeline decide which payments
  // are the site's own for its current package (same rule as Resume order).
  const { data: eventRows } = await admin
    .from("build_events")
    .select("kind, title, body, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  const events = (eventRows ?? []) as { kind: string | null; title: string | null; body: string | null; created_at: string }[];
  const endedAt = events
    .filter((e) => e.kind === "billing" && (ENDED_EVENT_TITLES as readonly string[]).includes(e.title ?? ""))
    .map((e) => Math.floor(Date.parse(e.created_at) / 1000));
  if (typeof tenant.cancelled_at === "string") endedAt.push(Math.floor(Date.parse(tenant.cancelled_at) / 1000));
  const duplicateSessionIds = flaggedDuplicateSessions(
    events,
    ((orders ?? []) as Array<{ id: number; stripe_session_id?: string | null }>).map((o) => ({ id: o.id, stripe_session_id: o.stripe_session_id })),
  );
  const ids: string[] = [];
  for (const o of (orders ?? []) as Array<{ stripe_session_id?: string | null }>) {
    if (o.stripe_session_id?.startsWith("cs_") && !ids.includes(o.stripe_session_id)) ids.push(o.stripe_session_id);
  }
  for (const e of events) {
    if (e.kind !== "billing" || e.title !== BALANCE_LINK_TITLE) continue;
    for (const sid of sessionIdsIn(e.body)) if (!ids.includes(sid)) ids.push(sid);
  }

  let subId = (tenant.stripe_subscription_id as string | null) || null;
  let customerId = (tenant.stripe_customer_id as string | null) || null;
  const sessions: SessionLike[] = [];
  for (const o of (orders ?? []) as Array<{ stripe_subscription_id?: string | null }>) {
    if (o.stripe_subscription_id && !subId) subId = o.stripe_subscription_id;
  }
  for (const sid of ids) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sid);
      if (!customerId && typeof session.customer === "string") customerId = session.customer;
      if (!subId && typeof session.subscription === "string") subId = session.subscription;
      sessions.push({
        id: session.id,
        mode: session.mode,
        payment_status: session.payment_status,
        payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : null,
        invoice: typeof session.invoice === "string" ? session.invoice : null,
        subscription: typeof session.subscription === "string" ? session.subscription : null,
        amount_total: session.amount_total,
        created: session.created,
        metadata: { kind: session.metadata?.kind ?? null, monthly_from: session.metadata?.monthly_from ?? null },
      });
    } catch {
      /* next session */
    }
  }
  // Newest first, as findSetupPayment's callers always passed them.
  sessions.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));

  const storedSubId = (tenant.stripe_subscription_id as string | null) || null;
  const found = await findRefundTarget({
    sessions,
    subscriptionId: subId,
    duplicateSessionIds,
    endedAt,
    refundedPence: async (pi) => {
      const intent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] });
      const charge = intent.latest_charge && typeof intent.latest_charge !== "string" ? intent.latest_charge : null;
      return charge?.amount_refunded ?? 0;
    },
    listInvoices: async (sub) =>
      (await stripe.invoices.list({ subscription: sub, limit: 20 })).data.map((i) => ({
        id: i.id ?? "",
        billing_reason: i.billing_reason,
        amount_paid: i.amount_paid,
      })),
    listInvoicePayments: async (invoice) =>
      (await stripe.invoicePayments.list({ invoice, limit: 10 })).data.map((p) => ({
        status: p.status,
        amount_paid: p.amount_paid,
        payment: {
          type: p.payment?.type,
          payment_intent:
            typeof p.payment?.payment_intent === "string" ? p.payment.payment_intent : (p.payment?.payment_intent?.id ?? null),
        },
      })),
  }).catch(() => ({ target: null, allRefunded: false }));
  const setup = found.target;

  // The subscription Refund may cancel: the site's own, or the one on the setup checkout it refunds.
  // Never a duplicate's: that would leave the real package running unbilled or end the wrong one.
  const setupSub = setup?.sessionId ? (sessions.find((x) => x.id === setup.sessionId)?.subscription ?? null) : null;
  const refundSubId = storedSubId || setupSub || (setup && !setup.sessionId ? subId : null);
  return { subId, customerId, setup, refundSubId, allRefunded: found.allRefunded };
}

/** Staff only: what Refund would send back, for the confirm. Changes nothing. */
export const refundPreview = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }) => {
    const { sb, team, role } = await actor(data.token);
    if (!team) throw new Error("Office is for the Forecourt team.");
    if (role !== "owner") throw new Error("Only an owner can change billing.");
    const admin = sbAdmin() ?? sb;
    const { data: tenant } = await admin
      .from("tenants")
      .select("id, stripe_customer_id, stripe_subscription_id, cancelled_at")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (!tenant) throw new Error("No dealership on this file.");
    const secret = stripeSecret();
    if (!secret) return { text: "Stripe is not connected on the server, so nothing can be refunded from here.", paymentIntent: null };
    const Stripe = (await import("stripe")).default;
    const { setup, allRefunded } = await locateStripeFile(admin, new Stripe(secret), data.tenantId, tenant);
    return { text: allRefunded ? ALL_REFUNDED_TEXT : refundConfirmText(setup, gbpPence), paymentIntent: setup?.paymentIntent ?? null };
  });

export const runBillingAction = createServerFn({ method: "POST" })
  .validator(
    (d: {
      token: string;
      tenantId: number;
      action: "cancel" | "refund" | "sign-off";
      /** Refund only: the payment staff confirmed, so a changed file refunds nothing. */
      expectPaymentIntent?: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    const { sb, team, role, email } = await actor(data.token);
    if (!team) throw new Error("Office is for the Forecourt team.");
    if (role !== "owner") throw new Error("Only an owner can change billing.");

    const admin = sbAdmin() ?? sb;
    const loaded = await admin
      .from("tenants")
      .select("id, status, stage, billing, stripe_customer_id, stripe_subscription_id, signed_off_at, cancelled_at")
      .eq("id", data.tenantId)
      .maybeSingle();
    const tenant = loaded.data
      ? loaded.data
      : (
          await admin
            .from("tenants")
            .select("id, status, billing, stripe_customer_id, stripe_subscription_id")
            .eq("id", data.tenantId)
            .maybeSingle()
        ).data;
    if (!tenant) throw new Error(loaded.error?.message ?? "No dealership on this file.");
    const signedOff = Boolean((tenant as { signed_off_at?: string | null }).signed_off_at);

    const secret = stripeSecret();
    const Stripe = secret ? (await import("stripe")).default : null;
    const stripe = secret && Stripe ? new Stripe(secret) : null;

    async function trail(body: string) {
      try {
        await admin.from("notes").insert({
          tenant_id: data.tenantId,
          author_email: email,
          visibility: "internal",
          body,
        });
      } catch {
        /* optional */
      }
    }

    if (data.action === "sign-off") {
      const priorStatus = (tenant.status as string | null) ?? null;
      // A cancelled or refunded file keeps that status and is never billed.
      const ended = tenantEnded(priorStatus);
      const { error: up } = await admin
        .from("tenants")
        .update({
          signed_off_at: new Date().toISOString(),
          ...(ended ? {} : { status: "live" }),
          stage: "live",
        })
        .eq("id", data.tenantId);
      if (up && !ended) await admin.from("tenants").update({ status: "live" }).eq("id", data.tenantId);
      await trail(`Signed off live by ${email}. Setup is not refundable.`);
      // Monthly billing starts at go live; a no-op if it is already running.
      const { message: billingMessage } = await startMonthlyForTenant(admin, data.tenantId, email, { priorStatus });
      return { ok: true, message: `Signed off live. Setup is not refundable from here. ${billingMessage}` };
    }

    if (data.action === "refund" && signedOff) {
      throw new Error("Live and signed off, so the terms say no refund of setup. Any exception is done in Stripe by hand.");
    }

    if (!stripe) {
      throw new Error("Stripe is not connected on the server, so nothing was sent to the card.");
    }

    const located = await locateStripeFile(admin, stripe, data.tenantId, tenant);
    const subId = located.subId;
    const customerId = located.customerId;
    const bits: string[] = [];

    if (data.action === "cancel") {
      if (subId) {
        await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
        bits.push("Stripe will stop the monthly at the period end.");
      } else {
        bits.push("No monthly Stripe subscription on this file (a 60-day trial is a one-off). Package marked cancelled.");
      }
    }

    if (data.action === "refund") {
      // Check the setup payment before touching the subscription.
      const target = located.setup;
      if (!target) {
        if (located.allRefunded) throw new Error(`${ALL_REFUNDED_TEXT} Nothing was changed.`);
        throw new Error(
          "No setup payment found on this file, so nothing was refunded. If they paid, refund in Stripe by hand.",
        );
      }
      if (data.expectPaymentIntent && data.expectPaymentIntent !== target.paymentIntent) {
        throw new Error("The payment on this file changed since you confirmed. Nothing was refunded. Try again.");
      }
      // Refund first: if Stripe refuses, the subscription is left alone.
      try {
        await stripe.refunds.create(
          { payment_intent: target.paymentIntent },
          { idempotencyKey: `forecourt-refund-${target.paymentIntent}` },
        );
        bits.push(`Refunded ${gbpPence(target.amountPence)}, ${target.label}.`);
        if (target.conversion) {
          bits.push(
            `The ${target.trialPence ? `${gbpPence(target.trialPence)} ` : ""}trial payment was not refunded; do that in Stripe by hand if needed.`,
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Stripe refused the refund.";
        if (!/already been refunded/i.test(msg)) throw new Error(msg);
        bits.push(`Stripe says ${target.label} (${gbpPence(target.amountPence)}) was already refunded.`);
      }
      const ownSub = located.refundSubId;
      if (ownSub) {
        try {
          await stripe.subscriptions.cancel(ownSub);
          bits.push("Monthly Stripe subscription cancelled now.");
        } catch (e) {
          bits.push(e instanceof Error ? e.message : "Could not cancel the subscription.");
        }
      }
      if (target.sessionId) {
        await admin.from("orders").update({ status: "refunded" }).eq("stripe_session_id", target.sessionId);
      } else {
        await admin.from("orders").update({ status: "refunded" }).eq("tenant_id", data.tenantId);
      }
    }

    const status = data.action === "refund" ? "refunded" : "cancelled";
    const patch: Record<string, unknown> = {
      status,
      cancelled_at: new Date().toISOString(),
    };
    if (customerId) patch.stripe_customer_id = customerId;
    // Keep the site's own subscription on the file, never a duplicate's.
    const keepSub = located.refundSubId ?? subId;
    if (keepSub) patch.stripe_subscription_id = keepSub;
    const { error: up } = await admin.from("tenants").update(patch).eq("id", data.tenantId);
    if (up) await admin.from("tenants").update({ status }).eq("id", data.tenantId);

    const message = bits.join(" ");
    await trail(`${data.action} by ${email}. ${message}`);
    // Record the stage it was ended at, so Resume order can put it back there.
    try {
      await admin.from("build_events").insert({
        tenant_id: data.tenantId,
        kind: "billing",
        stage: ((tenant as { stage?: string | null }).stage as string | null) ?? null,
        title: data.action === "refund" ? "Package refunded" : "Package ended",
        body: `${data.action === "refund" ? "Refunded" : "Ended"} by ${email}. ${message}`.trim(),
        visibility: "internal",
        actor_email: email,
      });
    } catch {
      /* timeline is best effort */
    }
    return { ok: true, message };
  });

/** Staff: the payment flags still open on one file, for the Mark handled buttons. */
export const fileFlags = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }) => {
    const { sb, team } = await actor(data.token);
    if (!team) throw new Error("Office is for the Forecourt team.");
    const admin = sbAdmin() ?? sb;
    const { data: rows } = await admin
      .from("build_events")
      .select("tenant_id, title, body, created_at")
      .eq("tenant_id", data.tenantId)
      .in("title", [FLAG_TITLES.duplicate_payment, FLAG_TITLES.similar_dealer, FLAG_HANDLED_TITLE])
      .order("created_at", { ascending: true });
    const events = (rows ?? []) as { tenant_id: number; title: string | null; body: string | null; created_at: string }[];
    const open = boardFlags(events)[data.tenantId] ?? { duplicate: false, lookalike: false };
    return { ...open, duplicateSessions: [...flaggedDuplicateSessions(events)] };
  });

/** How much of a flagged duplicate checkout has gone back in Stripe. GET calls only. */
async function duplicateRefunded(stripe: StripeClient, sessionId: string): Promise<{ paid: number; refunded: number; subscription: string | null }> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const subscription = typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);
  let pi = typeof session.payment_intent === "string" ? session.payment_intent : null;
  if (!pi && typeof session.invoice === "string") {
    const payments = (await stripe.invoicePayments.list({ invoice: session.invoice, limit: 10 })).data;
    const paid = payments.find((p) => p.status === "paid" && p.payment?.payment_intent);
    const ref = paid?.payment?.payment_intent;
    pi = typeof ref === "string" ? ref : (ref?.id ?? null);
  }
  if (!pi) return { paid: 0, refunded: 0, subscription };
  const intent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] });
  const charge = intent.latest_charge && typeof intent.latest_charge !== "string" ? intent.latest_charge : null;
  return { paid: charge?.amount_captured ?? intent.amount_received ?? 0, refunded: charge?.amount_refunded ?? 0, subscription };
}

/**
 * Owner only: mark a duplicate payment or look-alike flag as dealt with, so
 * its badge clears. "Refunded" is checked against Stripe first: the
 * duplicate payment fully refunded and its subscription cancelled. Writes an
 * internal timeline mark and a note. Nothing in Stripe is changed.
 */
export const markFlagHandled = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number; kind: FlagKind; how: "refunded" | "checked" }) => d)
  .handler(async ({ data }) => {
    const { sb, team, role, email } = await actor(data.token);
    if (!team) throw new Error("Office is for the Forecourt team.");
    if (role !== "owner") throw new Error("Only an owner can mark a payment flag handled.");
    if (data.kind !== "duplicate_payment" && data.kind !== "similar_dealer") throw new Error("Unknown flag.");
    const admin = sbAdmin() ?? sb;
    let stripeLine: string | null = null;
    if (data.kind === "duplicate_payment" && data.how === "refunded") {
      const { data: rows } = await admin
        .from("build_events")
        .select("title, body")
        .eq("tenant_id", data.tenantId)
        .eq("title", FLAG_TITLES.duplicate_payment);
      const { data: orderRows } = await admin.from("orders").select("id, stripe_session_id").eq("tenant_id", data.tenantId);
      const { data: tenantRow } = await admin.from("tenants").select("stripe_subscription_id").eq("id", data.tenantId).maybeSingle();
      const flags = (rows ?? []) as { title: string | null; body: string | null }[];
      const sessions = [...flaggedDuplicateSessions(flags, (orderRows ?? []) as { id: number; stripe_session_id: string | null }[])];
      const keep = ((tenantRow as { stripe_subscription_id?: string | null } | null)?.stripe_subscription_id ?? null) || null;
      const secret = stripeSecret();
      if (!secret) throw new Error("Stripe is not connected on the server, so the refund cannot be checked. Mark it checked instead.");
      if (!sessions.length) throw new Error("The flag does not name a Stripe checkout, so the refund cannot be checked. Mark it checked instead.");
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(secret);
      const payments: { sessionId: string; paidPence: number; refundedPence: number; paid: string; refunded: string }[] = [];
      // The duplicate's own subscription: named in the flag, or on its checkout.
      const subIds = flaggedDuplicateSubscriptions(flags, keep);
      for (const sid of sessions) {
        const r = await duplicateRefunded(stripe, sid);
        payments.push({ sessionId: sid, paidPence: r.paid, refundedPence: r.refunded, paid: gbpPence(r.paid), refunded: gbpPence(r.refunded) });
        if (r.subscription && r.subscription !== keep) subIds.add(r.subscription);
      }
      const subscriptions: { id: string; status: string | null }[] = [];
      for (const id of subIds) {
        const sub = await stripe.subscriptions.retrieve(id).catch((err: unknown) => {
          if ((err as { code?: string })?.code === "resource_missing") return null;
          throw err;
        });
        subscriptions.push({ id, status: sub ? sub.status : "canceled" });
      }
      const problem = duplicateHandledProblem({ payments, subscriptions });
      if (problem) throw new Error(problem);
      stripeLine = [
        ...payments.map((p) => `Stripe shows ${p.refunded} of ${p.paid} refunded on ${p.sessionId}.`),
        ...subscriptions.map((s) => `Duplicate subscription ${s.id} is ${s.status === "incomplete_expired" ? "expired" : "cancelled"}.`),
      ].join(" ");
    }
    const body = handledNote({ kind: data.kind, by: email, how: data.how, stripe: stripeLine });
    const { error } = await admin.from("build_events").insert({
      tenant_id: data.tenantId,
      kind: "note",
      stage: null,
      title: FLAG_HANDLED_TITLE,
      body,
      visibility: "internal",
      actor_email: email,
    });
    if (error) throw new Error(error.message);
    try {
      await admin.from("notes").insert({ tenant_id: data.tenantId, author_email: email, visibility: "internal", body });
    } catch {
      /* best effort */
    }
    return { ok: true, message: body.replace(/\s*\[handled:[a-z_]+\]$/, "") };
  });
