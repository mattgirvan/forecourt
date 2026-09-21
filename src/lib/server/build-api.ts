/**
 * Shared Send-to-build + token-status logic for TanStack *route* server handlers.
 *
 * Hypothesis: createServerFn bundles can see an empty process.env on Vercel Nitro,
 * while createFileRoute server.handlers (same path as Stripe webhook) see real env.
 * Desk scaffold and the staff Token chip must share THIS path.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildBriefMarkdown,
  packFromTenant,
  packGaps,
  tenantJson,
} from "@/lib/build";
import { normalizeBilling, normalizePlan } from "@/lib/catalog";
import { env } from "@/lib/env.server";
import { SUPABASE_ANON, SUPABASE_URL } from "@/lib/sb";
import { looksLikeTeam } from "@/lib/team";
import {
  deskHtmlUrl,
  deskRepoName,
  listStaffEnvKeyNames,
  nextHumanSteps,
  requireGhTemplateTokenAsync,
  resolveGhTemplateToken,
  scaffoldDeskRepo,
  type GhTokenSource,
} from "@/lib/server/desk-scaffold";

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

export type TokenStatusPayload = {
  configured: boolean;
  source: GhTokenSource;
  /** Route-handler process.env key names matching GH|TOKEN|GROK|VERCEL|SUPABASE. Never values. */
  routeEnvKeys: string[];
  runtime: "route-handler";
};

/** Staff-only token probe — same runtime as scaffold / Stripe webhook. */
export async function getTokenStatusForStaff(accessToken: string): Promise<TokenStatusPayload> {
  const { team } = await actor(accessToken);
  if (!team) throw new Error("Staff only.");
  const resolved = await resolveGhTemplateToken();
  return {
    configured: Boolean(resolved.token),
    source: resolved.source,
    routeEnvKeys: listStaffEnvKeyNames(),
    runtime: "route-handler",
  };
}

export type SendToBuildResult = {
  ok: true;
  brief: string;
  repo: string;
  htmlUrl: string;
  created: boolean;
  logoWritten: boolean;
  nextSteps: string[];
};

/**
 * Phase 1 Send to build — must run inside a route server handler so Vercel
 * injects GH_TEMPLATE_TOKEN the same way as /api/stripe/webhook.
 */
export async function executeSendToBuild(
  accessToken: string,
  tenantId: number,
): Promise<SendToBuildResult> {
  const { sb, team, email } = await actor(accessToken);
  if (!team) throw new Error("Only staff send a build.");
  // Fail closed before queuing — no orphan queued jobs without a token.
  await requireGhTemplateTokenAsync();

  const { data: t, error } = await sb
    .from("tenants")
    .select(
      "id, slug, name, legal, phone, email, domain, sites, features, ingest, plan, billing, staff_json, principal_name, group_name, pack_json, stage",
    )
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !t) throw new Error("No order.");

  const pack = packFromTenant(t);
  const plan = normalizePlan(t.plan);
  const billing = normalizeBilling(plan, t.billing);
  const gaps = packGaps(pack, plan, billing);
  if (gaps.length) {
    throw new Error(
      gaps.length === 1
        ? gaps[0]!
        : "Add a web address and at least one staff seat before we can build.",
    );
  }

  const repo = deskRepoName(pack.slug);
  const brief = buildBriefMarkdown(pack, {
    plan: String(t.plan),
    billing: String(t.billing),
    tenantId,
  });

  await sb
    .from("tenants")
    .update({
      stage: "build",
      pack_json: JSON.stringify(pack),
      repo_slug: repo,
    })
    .eq("id", tenantId);

  const claimedAt = new Date().toISOString();
  const { data: job, error: jobErr } = await sb
    .from("build_jobs")
    .insert({
      tenant_id: tenantId,
      status: "queued",
      pack_json: JSON.stringify(tenantJson(pack)),
      brief_md: brief,
      claimed_at: claimedAt,
    })
    .select("id")
    .single();
  if (jobErr || !job) throw new Error(jobErr?.message ?? "Could not queue the build job.");

  try {
    const result = await scaffoldDeskRepo(pack);
    const finishedAt = new Date().toISOString();
    await sb
      .from("build_jobs")
      .update({
        status: "succeeded",
        error_message: "",
        repo_html_url: result.htmlUrl,
        finished_at: finishedAt,
      })
      .eq("id", job.id);
    await sb.from("tenants").update({ repo_slug: result.repo }).eq("id", tenantId);
    const body = result.created
      ? `Private repo ${result.repo} created from forecourt-desk. tenant.json locked. Supabase and Vercel are still manual.`
      : `Repo ${result.repo} already existed — tenant.json updated. Supabase and Vercel are still manual.`;
    await sb.from("build_events").insert({
      tenant_id: tenantId,
      kind: "stage",
      stage: "build",
      title: "Sent to build",
      body,
      visibility: "customer",
      actor_email: email,
    });
    return {
      ok: true as const,
      brief,
      repo: result.repo,
      htmlUrl: result.htmlUrl,
      created: result.created,
      logoWritten: result.logoWritten,
      nextSteps: nextHumanSteps(pack.slug, pack.domain),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Desk scaffold failed.";
    await sb
      .from("build_jobs")
      .update({
        status: "failed",
        error_message: message.slice(0, 2000),
        repo_html_url: deskHtmlUrl(repo),
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await sb.from("build_events").insert({
      tenant_id: tenantId,
      kind: "note",
      stage: "build",
      title: "Build scaffold failed",
      body: message.slice(0, 500),
      visibility: "internal",
      actor_email: email,
    });
    throw new Error(message);
  }
}

/** JSON helper for route handlers. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

// Re-export for callers that need the client type without pulling build.ts.
export type { SupabaseClient };
