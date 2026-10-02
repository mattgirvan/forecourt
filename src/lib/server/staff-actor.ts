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
 * The caller and their staff access. Only an active team_members row or a
 * confirmed hello@forecourt.me counts; an invite counts once accepted from the
 * person's own email; an @forecourt.me address on its own never does,
 * because anyone can sign up with one. Every office server function (portal,
 * build, build-api, commerce, resume-order-api) uses this one lookup.
 */
export async function actor(token: string) {
  const sb = sbFor(token);
  const admin = sbAdmin();
  const who = await resolveActor({
    getUser: async () => {
      const { data, error } = await sb.auth.getUser(token);
      return error || !data.user ? null : data.user;
    },
    getMember: async (email) => {
      // Service role when set, so a revoked row is always seen. Otherwise the
      // caller's own client, which may read its own row (team-owner-only.sql).
      const { data: member } = await (admin ?? sb)
        .from("team_members")
        .select("email, role, status, name")
        .eq("email", email)
        .maybeSingle();
      return member ?? null;
    },
    touchMember: (email) => {
      void (admin ?? sb).from("team_members").update({ last_seen_at: new Date().toISOString() }).eq("email", email);
    },
    seedOwner: async (email) => {
      if (!admin) return;
      // Insert only, never overwrite: a revoked hello@ stays revoked.
      await admin
        .from("team_members")
        .upsert(
          { email, name: "Matt Girvan", role: "owner", status: "active", last_seen_at: new Date().toISOString() },
          { onConflict: "email", ignoreDuplicates: true },
        );
    },
    acceptInvite: async () => {
      // Must use the caller's own token: the database checks its sign-in method and time.
      const { data, error } = await sb.rpc("accept_team_invite");
      return !error && data === true;
    },
  });
  return { sb, ...who };
}

export function stripeSecret() {
  return env("GROK_STRIPE_SECRET_KEY") ?? env("STRIPE_SECRET_KEY");
}
