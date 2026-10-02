/**
 * Staff and Stripe helpers shared by the office server functions. Only ever
 * called inside createServerFn handlers, so client builds drop this module.
 */
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env.server";
import { SUPABASE_ANON, SUPABASE_URL } from "@/lib/sb";
import { resolveActor } from "@/lib/server/team-actor";

export function sbFor(token: string) {
  const key = SUPABASE_ANON || env("VITE_SUPABASE_ANON_KEY") || env("VITE_SUPABASE_PUBLISHABLE_KEY") || "";
  return createClient(SUPABASE_URL, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function sbAdmin() {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? env("GROK_SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * The caller and their staff access. Only a team_members row (invited or
 * active) or a confirmed hello@forecourt.me counts; an @forecourt.me address
 * on its own never does, because anyone can sign up with one.
 */
export async function actor(token: string) {
  const sb = sbFor(token);
  const who = await resolveActor({
    getUser: async () => {
      const { data, error } = await sb.auth.getUser(token);
      return error || !data.user ? null : data.user;
    },
    getMember: async (email) => {
      const { data: member } = await sb.from("team_members").select("email, role, status, name").eq("email", email).maybeSingle();
      return member ?? null;
    },
    touchMember: (email, activate) => {
      const now = new Date().toISOString();
      void sb
        .from("team_members")
        .update(activate ? { status: "active", last_seen_at: now } : { last_seen_at: now })
        .eq("email", email);
    },
    seedOwner: async (email) => {
      const admin = sbAdmin();
      if (!admin) return;
      await admin
        .from("team_members")
        .upsert({ email, name: "Matt Girvan", role: "owner", status: "active", last_seen_at: new Date().toISOString() }, { onConflict: "email" });
    },
  });
  return { sb, ...who };
}

export function stripeSecret() {
  return env("GROK_STRIPE_SECRET_KEY") ?? env("STRIPE_SECRET_KEY");
}
