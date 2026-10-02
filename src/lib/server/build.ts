import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import {
  BUILD_STAGES,
  isBuildStage,
  packFromTenant,
  type BuildStage,
  type TenantPack,
} from "@/lib/build";
// The one staff lookup (active member or confirmed hello@, never the domain).
import { actor } from "@/lib/server/staff-actor";
import { listStaffEnvKeyNames } from "@/lib/server/desk-scaffold";
import { executeSendToBuild } from "@/lib/server/build-api";
import { goLiveConfirmForTenant, startMonthlyForTenant } from "@/lib/server/billing-go-live";
import { emailOutcomeMessage, sendProgressEmail } from "@/lib/server/journey-email";
import { customerStepFor, customerStepNumber, stepLabel } from "@/lib/journey";
import { progressEmailHold, tenantEnded, type MonthlyStartResult } from "@/lib/server/billing-start";


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
      title: "Payment received",
      body: "We have your order. Next, book your kickoff call.",
      visibility: "customer",
      actor_email: actorEmail,
    });
  }
}

export const getBuild = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }) => {
    const { sb, team, userId } = await actor(data.token);
    const tq = sb
      .from("tenants")
      .select(
        "id, slug, name, legal, phone, email, domain, sites, features, ingest, plan, billing, staff_json, principal_name, group_name, pack_json, stage, preview_url, repo_slug, user_id, status",
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
      /** Staff only: refunded or cancelled files show the Resume order hint. */
      status: team ? ((t.status as string | null) ?? null) : null,
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
      title: team ? "Details updated" : "You sent us details",
      body: team ? "We updated your setup details." : "Thanks. We have your latest details.",
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
      /** Staff ticked "Notify customer": send the progress email for this step. */
      notify?: boolean;
    }) => d,
  )
  .handler(async ({ data }) => {
    const { sb, team, email } = await actor(data.token);
    if (!team) throw new Error("Only staff move the build.");
    if (!isBuildStage(data.stage)) throw new Error("Unknown stage.");
    const patch: Record<string, string> = { stage: data.stage };
    if (data.preview_url !== undefined) patch.preview_url = data.preview_url;
    if (data.repo_slug !== undefined) patch.repo_slug = data.repo_slug;
    const { data: before } = await sb.from("tenants").select("stage, status").eq("id", data.tenantId).maybeSingle();
    const previousStage = (before?.stage as string | null | undefined) ?? null;
    const priorStatus = (before?.status as string | null | undefined) ?? null;
    // A cancelled or refunded file keeps that status; going live does not revive billing.
    if (data.stage === "live" && !tenantEnded(priorStatus)) patch.status = "live";
    const { error } = await sb.from("tenants").update(patch).eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    const stageChanged = previousStage !== data.stage;
    // Monthly billing starts the day the desk goes live.
    let billingMessage: string | null = null;
    let monthlyStartsToday = false;
    let startResult: MonthlyStartResult | null = null;
    if (data.stage === "live" && previousStage !== "live") {
      const started = await startMonthlyForTenant(sb, data.tenantId, email, { priorStatus });
      billingMessage = started.message;
      monthlyStartsToday = started.result.started;
      startResult = started.result;
    }
    if (stageChanged) {
      const meta = BUILD_STAGES.find((s) => s.id === data.stage)!;
      const step = customerStepFor(data.stage);
      // Customers see their six steps only. Moves inside one customer step
      // (pack to build) stay on the internal timeline.
      const customerMoved = customerStepNumber(data.stage) !== customerStepNumber(previousStage);
      await sb.from("build_events").insert({
        tenant_id: data.tenantId,
        kind: "stage",
        stage: data.stage,
        title: customerMoved && step ? `${stepLabel(step)}: ${step.title}` : `Stage: ${meta.label}`,
        body: customerMoved ? meta.customer : meta.staff,
        visibility: customerMoved ? "customer" : "internal",
        actor_email: email,
      });
    }
    let emailMessage: string | null = null;
    const hold = progressEmailHold({ stage: data.stage, priorStatus, start: startResult });
    if (data.notify && hold) {
      emailMessage = hold;
    } else if (data.notify) {
      emailMessage = stageChanged
        ? emailOutcomeMessage(
            await sendProgressEmail({ tenantId: data.tenantId, stage: data.stage, previousStage, monthlyStartsToday }),
          )
        : "No email: the stage did not change.";
    }
    return { ok: true, billingMessage, emailMessage };
  });

/** Staff only: the confirm text before moving a site to Live (checks Stripe, changes nothing). */
export const goLiveConfirm = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }) => {
    const { sb, team } = await actor(data.token);
    if (!team) throw new Error("Only staff move the build.");
    const { text } = await goLiveConfirmForTenant(sb, data.tenantId);
    return { text };
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
