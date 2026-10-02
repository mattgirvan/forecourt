/**
 * Staff and Stripe helpers shared by the office server functions. Only ever
 * called inside createServerFn handlers, so client builds drop this module.
 */
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env.server";
import { SUPABASE_ANON, SUPABASE_URL } from "@/lib/sb";
import { looksLikeTeam, type StaffRole } from "@/lib/team";

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

export async function actor(token: string) {
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

  if (looksLikeTeam(email)) {
    const admin = sbAdmin();
    if (admin) {
      await admin.from("team_members").upsert(
        {
          email,
          name: email === "hello@forecourt.me" ? "Matt Girvan" : "",
          role: "owner",
          status: "active",
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "email" },
      );
      await admin.from("team_emails").upsert({ email });
    }
    return {
      sb,
      userId: data.user.id,
      email,
      team: true,
      role: "owner" as StaffRole,
      name: email === "hello@forecourt.me" ? "Matt Girvan" : "",
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

export function stripeSecret() {
  return env("GROK_STRIPE_SECRET_KEY") ?? env("STRIPE_SECRET_KEY");
}
