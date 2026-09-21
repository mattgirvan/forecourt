import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import {
  BUILD_STAGES,
  isBuildStage,
  packFromTenant,
  type BuildStage,
  type TenantPack,
} from "@/lib/build";
import { env } from "@/lib/env.server";
import { SUPABASE_ANON, SUPABASE_URL } from "@/lib/sb";
import { looksLikeTeam } from "@/lib/team";
import { listStaffEnvKeyNames } from "@/lib/server/desk-scaffold";
import { executeSendToBuild } from "@/lib/server/build-api";

function sbFor(token: string) {
  const key = SUPABASE_ANON || env("VITE_SUPABASE_ANON_KEY") || env("VITE_SUPABASE_PUBLISHABLE_KEY") || "";
  return createClient(SUPABASE_URL, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function actor(token: string) {
  const sb = sbFor(token);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new Error("Sign in again.");
  const email = (data.user.email ?? "").toLowerCase();
  const { data: member } = await sb
    .from("team_members")
    .select("status")
    .eq("email", email)
    .maybeSingle();
  const team = member ? member.status !== "revoked" : looksLikeTeam(email);
  return { sb, userId: data.user.id, email, team };
}

export async function seedPaidOrder(
  sb: SupabaseClient,
  tenantId: number,
  actorEmail = "stripe",
) {
  const { data: t, error } = await sb
    .from("tenants")
    .select(
      "id, slug, name, legal, phone, email, domain, sites, features, ingest, plan, billing, staff_json, principal_name, group_name, pack_json, stage",
    )
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !t) return;
  const pack = packFromTenant(t);
  const current = isBuildStage(t.stage) ? t.stage : null;
  const patch: Record<string, string> = {};
  if (!t.pack_json) patch.pack_json = JSON.stringify(pack);
  if (!current || current === "paid") patch.stage = "paid";
  if (!current) patch.stage = "paid";
  if (Object.keys(patch).length) {
    await sb.from("tenants").update(patch).eq("id", tenantId);
  }
  const { data: existing } = await sb
    .from("build_events")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("stage", "paid")
    .limit(1);
  if (!existing?.length) {
    await sb.from("build_events").insert({
      tenant_id: tenantId,
      kind: "stage",
      stage: "paid",
      title: "Order received",
      body: `${pack.name || "A dealership"} paid. The build is on the board.`,
      visibility: "customer",
      actor_email: actorEmail,
    });
  }
}

export const getBuild = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }) => {
    const { sb, team, userId } = await actor(data.token);
    let tq = sb
      .from("tenants")
      .select(
        "id, slug, name, legal, phone, email, domain, sites, features, ingest, plan, billing, staff_json, principal_name, group_name, pack_json, stage, preview_url, repo_slug, user_id",
      )
      .eq("id", data.tenantId)
      .maybeSingle();
    const { data: t, error } = await tq;
    if (error) throw new Error(error.message);
    if (!t) throw new Error("No order.");
    if (!team && t.user_id !== userId) throw new Error("No order.");
    const pack = packFromTenant(t);
    let eq = sb
      .from("build_events")
      .select("id, kind, stage, title, body, visibility, actor_email, created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: true });
    if (!team) eq = eq.eq("visibility", "customer");
    const { data: events } = await eq;
    const { data: meetings } = await sb
      .from("meetings")
      .select("id, title, starts_at, notes, created_by, created_at")
      .eq("tenant_id", data.tenantId)
      .order("starts_at", { ascending: true });
    const { data: jobs } = team
      ? await sb
          .from("build_jobs")
          .select("id, status, error_message, repo_html_url, created_at, finished_at, claimed_at")
          .eq("tenant_id", data.tenantId)
          .order("created_at", { ascending: false })
          .limit(5)
      : {
          data: [] as {
            id: number;
            status: string;
            error_message: string;
            repo_html_url: string;
            created_at: string;
            finished_at: string | null;
            claimed_at: string | null;
          }[],
        };
    // Token chip / scaffold use /api/build/* route handlers (Stripe-webhook path).
    // createServerFn env keys are returned only for staff A/B diagnostic.
    const serverFnEnvKeys = team ? listStaffEnvKeyNames() : null;
    return {
      stage: (isBuildStage(t.stage) ? t.stage : (t.stage as string) || "briefing") as BuildStage | "briefing",
      preview_url: (t.preview_url as string | null) ?? "",
      repo_slug: (t.repo_slug as string | null) ?? "",
      pack,
      events: events ?? [],
      meetings: meetings ?? [],
      jobs: jobs ?? [],
      plan: t.plan as string,
      billing: t.billing as string,
      serverFnEnvKeys,
    };
  });

export const savePack = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number; pack: TenantPack }) => d)
  .handler(async ({ data }) => {
    const { sb, team, userId, email } = await actor(data.token);
    const { data: t } = await sb.from("tenants").select("id, user_id, stage").eq("id", data.tenantId).maybeSingle();
    if (!t) throw new Error("No order.");
    if (!team && t.user_id !== userId) throw new Error("No order.");
    const pack = { ...data.pack, seedDemo: false as const };
    const patch: Record<string, unknown> = {
      pack_json: JSON.stringify(pack),
      name: pack.name,
      legal: pack.legal,
      phone: pack.phone,
      email: pack.email,
      domain: pack.domain,
      sites: JSON.stringify(pack.sites),
      ingest: pack.ingest,
      features: JSON.stringify(pack.features),
      staff_json: JSON.stringify(pack.staff),
      group_name: pack.groupMark,
    };
    let q = sb.from("tenants").update(patch).eq("id", data.tenantId);
    if (!team) q = q.eq("user_id", userId);
    const { error } = await q;
    if (error) throw new Error(error.message);
    await sb.from("build_events").insert({
      tenant_id: data.tenantId,
      kind: "note",
      title: team ? "Pack updated" : "You sent us details",
      body: team ? "Staff saved the brand pack." : "Customer updated the brief.",
      visibility: "customer",
      actor_email: email,
    });
    return { ok: true };
  });

export const setBuildStage = createServerFn({ method: "POST" })
  .validator(
    (d: {
      token: string;
      tenantId: number;
      stage: BuildStage;
      preview_url?: string;
      repo_slug?: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    const { sb, team, email } = await actor(data.token);
    if (!team) throw new Error("Only staff move the build.");
    if (!isBuildStage(data.stage)) throw new Error("Unknown stage.");
    const patch: Record<string, string> = { stage: data.stage };
    if (data.preview_url !== undefined) patch.preview_url = data.preview_url;
    if (data.repo_slug !== undefined) patch.repo_slug = data.repo_slug;
    if (data.stage === "live") patch.status = "live";
    const { error } = await sb.from("tenants").update(patch).eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    const meta = BUILD_STAGES.find((s) => s.id === data.stage)!;
    await sb.from("build_events").insert({
      tenant_id: data.tenantId,
      kind: "stage",
      stage: data.stage,
      title: meta.label,
      body: meta.customer,
      visibility: "customer",
      actor_email: email,
    });
    return { ok: true };
  });

export const addMeeting = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number; title: string; starts_at: string; notes?: string }) => d)
  .handler(async ({ data }) => {
    const { sb, team, email } = await actor(data.token);
    if (!team) throw new Error("Staff book the call.");
    const title = data.title.trim() || "Briefing call";
    const { error } = await sb.from("meetings").insert({
      tenant_id: data.tenantId,
      title,
      starts_at: data.starts_at,
      notes: data.notes ?? "",
      created_by: email,
    });
    if (error) throw new Error(error.message);
    await sb.from("build_events").insert({
      tenant_id: data.tenantId,
      kind: "meeting",
      title,
      body: data.starts_at,
      visibility: "customer",
      actor_email: email,
    });
    return { ok: true };
  });

export const sendToBuild = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }) => {
    // Prefer /api/build/send from the browser (route handler = webhook env path).
    // Kept as a thin delegate for any leftover callers.
    return executeSendToBuild(data.token, data.tenantId);
  });
