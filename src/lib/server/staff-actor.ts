/**
 * Staff and Stripe helpers shared by the office server functions. Only ever
 * called inside createServerFn handlers, so client builds drop this module.
 *
 * This is also the ONLY place a server function turns a sign-in token into a
 * user: `verifiedUser()` calls Supabase, then refuses any account whose email
 * is not proven by its identities (src/lib/auth/verified-email.ts). The token
 * client is not exported, so there is no way round it.
 * src/lib/auth/verified-email.test.ts scans src/ to keep it that way.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { assertEmailVerified } from "@/lib/auth/verified-email";
import { env } from "@/lib/env.server";
import { SUPABASE_ANON, SUPABASE_URL } from "@/lib/sb";
import { acceptInviteSecurely, lockDownAcceptedAccount, otherSignInMethods, resolveActor } from "@/lib/server/team-actor";

function sbFor(token: string) {
  const key = SUPABASE_ANON || env("VITE_SUPABASE_ANON_KEY") || env("VITE_SUPABASE_PUBLISHABLE_KEY") || "";
  return createClient(SUPABASE_URL, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function sbAdmin() {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? env("GROK_SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return null;
  // experimental.passkey turns on auth.admin.passkey, used to check an account
  // for passkeys before an invite is accepted.
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, experimental: { passkey: true } },
  });
}

/**
 * The signed-in user behind a token, with a Supabase client acting as them.
 * Throws "Sign in again." for a bad token and the plain unverified message
 * when the account email is not proven. Every server function goes through
 * this (directly, or through `actor()`).
 */
export async function verifiedUser(token: string): Promise<{ sb: SupabaseClient; user: User }> {
  const sb = sbFor(token);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new Error("Sign in again.");
  assertEmailVerified(data.user);
  return { sb, user: data.user };
}

/**
 * The caller and their staff access. Only an active team_members row or a
 * confirmed hello@forecourt.me counts; an invite counts once accepted from the
 * person's own email; an @forecourt.me address on its own never does,
 * because anyone can sign up with one. Every office server function (portal,
 * build, build-api, commerce, resume-order-api) uses this one lookup.
 */
export async function actor(token: string) {
  const { sb, user } = await verifiedUser(token);
  const admin = sbAdmin();
  const who = await resolveActor({
    getUser: async () => user,
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
    acceptInvite: async (user) => {
      // Accepting also locks the account down with the Admin API, so it needs
      // the service role. Without it, invites stay pending (fail closed).
      if (!admin) {
        console.warn("[team] SUPABASE_SERVICE_ROLE_KEY is not set; staff invites cannot be accepted");
        return "not-yet";
      }
      return acceptInviteSecurely({
        who: user,
        otherSignIn: () =>
          otherSignInMethods(
            {
              getUserById: (id) => admin.auth.admin.getUserById(id),
              listPasskeys: (userId) => admin.auth.admin.passkey.listPasskeys({ userId }),
            },
            user.id,
          ),
        accept: async () => {
          // The caller's own token: the database checks its sign-in method and time.
          const { data, error } = await sb.rpc("accept_team_invite");
          if (error) throw error;
          return data === true;
        },
        lockDown: () =>
          lockDownAcceptedAccount(
            {
              updateUserById: (id, attrs) => admin.auth.admin.updateUserById(id, attrs),
              signOut: (jwt, scope) => admin.auth.admin.signOut(jwt, scope),
            },
            user.id,
            token,
          ),
        undo: async () => {
          const { error } = await admin
            .from("team_members")
            .update({ status: "invited", accepted_at: null })
            .eq("email", user.email)
            .eq("status", "active");
          if (error) throw error;
          return true;
        },
      });
    },
  });
  return { sb, ...who };
}

export function stripeSecret() {
  return env("GROK_STRIPE_SECRET_KEY") ?? env("STRIPE_SECRET_KEY");
}
