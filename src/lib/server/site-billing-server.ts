/**
 * Group build PR 3: server side of per-site billing.
 *
 * changeSiteState is the one code path that moves a site between setting up,
 * live and archived and then keeps the subscription in step. It is NOT wired to
 * any button in this PR (see the PR notes); Office only reads.
 *
 * Order of work, so a retry can never double bill:
 * 1. Read the site. If it is already in the target state, stop (no Stripe call).
 * 2. Claim the event in site_billing_events (unique event_key). If the claim
 *    already exists, a previous attempt got this far: re-run the sync, which is
 *    a no-op when Stripe already matches.
 * 3. Update tenant_sites (status, live_at or archived_at).
 * 4. syncSiteBilling: at most one Stripe update with an idempotency key.
 * 5. Record the result on the event row and the internal timeline.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { normalizePlan } from "@/lib/catalog";
import { actor, sbAdmin, stripeSecret } from "@/lib/server/staff-actor";
import { parseBillingSites, siteBreakdown, type BillingSite, type SiteStatus } from "@/lib/site-billing";
import { siteSyncMessage, syncSiteBilling, type SiteSubsLike, type SiteSyncResult } from "@/lib/server/site-billing-sync";
import { missingTable } from "@/lib/server/payment-issues";

type SiteRow = { code: string; name: string; status: SiteStatus; live_at: string | null; archived_at: string | null };

function toBilling(r: SiteRow): BillingSite {
  return { code: r.code, name: r.name, status: r.status, liveAt: r.live_at, archivedAt: r.archived_at };
}

async function stripeSubs(): Promise<SiteSubsLike | null> {
  const secret = stripeSecret();
  if (!secret) return null;
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(secret);
  return {
    retrieve: (id) => stripe.subscriptions.retrieve(id) as unknown as ReturnType<SiteSubsLike["retrieve"]>,
    update: (id, params, options) => stripe.subscriptions.update(id, params as never, options),
  };
}

export async function changeSiteState(
  sb: SupabaseClient,
  input: { tenantId: number; code: string; to: SiteStatus; actorEmail: string },
  deps: { subscriptions?: SiteSubsLike | null; now?: () => Date } = {},
): Promise<{ result: SiteSyncResult; message: string }> {
  const now = (deps.now ?? (() => new Date()))().toISOString();
  const { data: t } = await sb.from("tenants").select("id, plan, status, stripe_subscription_id").eq("id", input.tenantId).maybeSingle();
  const { data: rows, error } = await sb.from("tenant_sites").select("code, name, status, live_at, archived_at").eq("tenant_id", input.tenantId);
  if (error || !t) return { result: { changed: false, reason: "no_subscription", detail: error?.message }, message: "Could not read the account." };
  const all = (rows ?? []) as SiteRow[];
  const site = all.find((r) => r.code === input.code);
  if (!site) return { result: { changed: false, reason: "no_state_change", detail: "unknown site" }, message: "Unknown site." };
  if (site.status === "archived" && input.to !== "archived") {
    return { result: { changed: false, reason: "no_state_change", detail: "archived sites stay archived" }, message: "Archived sites are not brought back here." };
  }
  const from = site.status;
  if (from === input.to) {
    const result: SiteSyncResult = { changed: false, reason: "no_state_change" };
    return { result, message: siteSyncMessage(result) };
  }
  const eventKey = `${input.tenantId}:${input.code}:${from}:${input.to}:${site.live_at ?? "never"}`;
  await sb.from("site_billing_events").upsert(
    { tenant_id: input.tenantId, site_code: input.code, from_status: from, to_status: input.to, event_key: eventKey, actor_email: input.actorEmail },
    { onConflict: "event_key", ignoreDuplicates: true },
  );
  const patch: Partial<SiteRow> & { updated_at: string } = { status: input.to, updated_at: now };
  if (input.to === "live") patch.live_at = now;
  if (input.to === "archived") patch.archived_at = now;
  await sb.from("tenant_sites").update(patch).eq("tenant_id", input.tenantId).eq("code", input.code).eq("status", from);
  const sites = all.map((r) => (r.code === input.code ? toBilling({ ...r, ...patch } as SiteRow) : toBilling(r)));
  let subscriptions: SiteSubsLike | null = null;
  try {
    subscriptions = deps.subscriptions !== undefined ? deps.subscriptions : await stripeSubs();
  } catch {
    subscriptions = null;
  }
  const result = await syncSiteBilling(
    { subscriptions },
    {
      tenantId: input.tenantId,
      plan: normalizePlan(t.plan as string),
      tenantStatus: (t.status as string | null) ?? null,
      subscriptionId: (t.stripe_subscription_id as string | null) ?? null,
      sites,
      event: { code: input.code, from, to: input.to },
    },
  );
  const message = siteSyncMessage(result);
  try {
    await sb.from("site_billing_events").update({ result: result.changed ? "changed" : result.reason, detail: message }).eq("event_key", eventKey);
    await sb.from("build_events").insert({
      tenant_id: input.tenantId,
      kind: "note",
      title: `Site ${input.code} ${input.to === "live" ? "went live" : input.to === "archived" ? "archived" : "set up"}`,
      body: message,
      visibility: "internal",
      actor_email: input.actorEmail,
    });
  } catch {
    /* best effort */
  }
  return { result, message };
}

/** Office, read only: each Group and Franchise account, its sites and what they are billed. */
export const listOfficeSiteBilling = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { sb: userSb, team } = await actor(data.token);
    if (!team) throw new Error("Office is for the Forecourt team.");
    // tenant_sites is service role only; without it, fall back to tenants.sites.
    const admin = sbAdmin();
    const sb = admin ?? userSb;
    const { data: tenants, error } = await sb
      .from("tenants")
      .select("id, name, plan, status, stage, sites, stripe_subscription_id")
      .in("plan", ["group", "franchise"])
      .is("archived_at", null)
      .order("name");
    if (error) throw new Error(error.message);
    const ids = (tenants ?? []).map((t) => t.id as number);
    let siteRows: (SiteRow & { tenant_id: number })[] = [];
    let fromTable = false;
    if (ids.length && admin) {
      const res = await sb.from("tenant_sites").select("tenant_id, code, name, status, live_at, archived_at").in("tenant_id", ids);
      if (!res.error) {
        siteRows = (res.data ?? []) as typeof siteRows;
        fromTable = true;
      } else if (!missingTable(res.error)) throw new Error(res.error.message);
    }
    return (tenants ?? []).map((t) => {
      const plan = normalizePlan(t.plan as string);
      const own = siteRows.filter((r) => r.tenant_id === t.id);
      const sites = own.length ? own.map(toBilling) : parseBillingSites(t.sites);
      return {
        id: t.id as number,
        name: (t.name as string) || "Unnamed",
        plan,
        status: (t.status as string) || "",
        hasSubscription: Boolean(t.stripe_subscription_id),
        source: own.length ? "tenant_sites" : fromTable ? "tenants.sites (no site rows yet)" : "tenants.sites",
        ...siteBreakdown(plan, sites),
      };
    });
  });
