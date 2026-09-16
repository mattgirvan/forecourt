import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { gbpPence, normalizeBilling, normalizePlan } from "@/lib/catalog";
import { env } from "@/lib/env.server";
import { SUPABASE_ANON, SUPABASE_URL } from "@/lib/sb";
import { SITE } from "@/lib/site";
import { TEAM_EMAILS, looksLikeTeam, type StaffRole, type StaffStatus } from "@/lib/team";

function sbFor(token: string) {
  const key = SUPABASE_ANON || env("VITE_SUPABASE_ANON_KEY") || env("VITE_SUPABASE_PUBLISHABLE_KEY") || "";
  return createClient(SUPABASE_URL, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sbAdmin() {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? env("GROK_SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function actor(token: string) {
  const sb = sbFor(token);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new Error("Sign in again.");
  const email = (data.user.email ?? "").toLowerCase();

  const { data: member } = await sb
    .from("team_members")
    .select("email, role, status, name")
    .eq("email", email)
    .maybeSingle();

  if (member) {
    if (member.status === "revoked") {
      return {
        sb,
        userId: data.user.id,
        email,
        team: false,
        role: null as StaffRole | null,
        name: member.name as string,
      };
    }
    if (member.status === "invited") {
      void sb.from("team_members").update({ status: "active", last_seen_at: new Date().toISOString() }).eq("email", email);
    } else {
      void sb.from("team_members").update({ last_seen_at: new Date().toISOString() }).eq("email", email);
    }
    return {
      sb,
      userId: data.user.id,
      email,
      team: true,
      role: (member.role as StaffRole) ?? "operator",
      name: member.name as string,
    };
  }

  const { data: row } = await sb.from("team_emails").select("email").eq("email", email).maybeSingle();
  const team = Boolean(row) || looksLikeTeam(email);
  return {
    sb,
    userId: data.user.id,
    email,
    team,
    role: (team ? "owner" : null) as StaffRole | null,
    name: "",
  };
}

function stripeSecret() {
  return env("GROK_STRIPE_SECRET_KEY") ?? env("STRIPE_SECRET_KEY");
}

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
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { sb, team } = await actor(data.token);
    if (!team) throw new Error("Office is for the Forecourt team.");
    const { data: rows, error } = await sb
      .from("tenants")
      .select(
        "id, name, email, phone, plan, status, billing, site_count, trial_ends_at, term_months, group_name, principal_name, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const tenants = rows ?? [];
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
    return tenants.map((t) => ({
      ...t,
      last_message_at: lastBy[t.id]?.at ?? null,
      waiting: lastBy[t.id] ? !lastBy[t.id].from_team : false,
    }));
  });

export const getTenantFile = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }) => {
    const { sb, team, userId } = await actor(data.token);
    const q = sb
      .from("tenants")
      .select(
        "id, slug, name, legal, phone, email, domain, sites, features, ingest, plan, status, billing, site_count, stripe_customer_id, stripe_subscription_id, trial_ends_at, term_months, principal_name, group_name, research, staff_json, created_at, user_id",
      )
      .eq("id", data.tenantId)
      .maybeSingle();
    const { data: row, error } = await q;
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
        name: email === "mattgirvan39@gmail.com" ? "Matt Girvan" : "Forecourt",
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
  const redirect = `${SITE.url}${toOffice ? "/office" : "/account"}`;
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
