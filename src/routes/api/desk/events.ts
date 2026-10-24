import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env.server";
import { SUPABASE_URL } from "@/lib/sb";
import { sendAccountEventEmail } from "@/lib/server/journey-email";
import { handleDeskEvent } from "@/lib/server/desk-events-server";
import { parseBillingSites, type BillingSite } from "@/lib/site-billing";

function service() {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? env("GROK_SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Signed events from each desk (desk migration 0007). See supabase/desk-links.sql. */
export const Route = createFileRoute("/api/desk/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sb = service();
        if (!sb) return Response.json({ ok: false, error: "not configured" }, { status: 503 });
        const raw = await request.text();
        const out = await handleDeskEvent(
          {
            keyId: request.headers.get("x-forecourt-desk"),
            timestamp: request.headers.get("x-forecourt-timestamp"),
            signature: request.headers.get("x-forecourt-signature"),
            raw,
          },
          {
            findLink: async (keyId) => {
              const { data } = await sb.from("desk_links").select("tenant_id, key_id, secret, revoked_at").eq("key_id", keyId).maybeSingle();
              return data ? { tenantId: data.tenant_id as number, keyId: data.key_id as string, secret: data.secret as string, revoked: Boolean(data.revoked_at) } : null;
            },
            loadAccount: async (tenantId) => {
              const { data: t } = await sb.from("tenants").select("plan, sites").eq("id", tenantId).maybeSingle();
              if (!t) return null;
              const { data: rows } = await sb.from("tenant_sites").select("code, name, status").eq("tenant_id", tenantId);
              const sites = rows?.length ? (rows as BillingSite[]) : parseBillingSites(t.sites);
              return { plan: t.plan as string, sites };
            },
            applySiteState: async (tenantId, code, to, opts) => {
              const { changeSiteState } = await import("@/lib/server/site-billing-server");
              const r = await changeSiteState(sb, { tenantId, code, to, actorEmail: opts.actor, restore: opts.restore, notify: false });
              return r.billing ? { billing: r.billing, message: r.message } : null;
            },
            recordSite: async (tenantId, code, name) => {
              await sb.from("tenant_sites").upsert({ tenant_id: tenantId, code, name, status: "setting_up" }, { onConflict: "tenant_id,code", ignoreDuplicates: true });
            },
            send: (tenantId, ev) => sendAccountEventEmail({ tenantId, ...ev }),
            note: async (tenantId, title, body) => {
              await sb.from("build_events").insert({ tenant_id: tenantId, kind: "note", title, body });
            },
          },
        );
        return Response.json(out.body, { status: out.status });
      },
    },
  },
});
