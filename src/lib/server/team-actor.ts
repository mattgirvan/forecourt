/**
 * Who is calling an office server function, and are they staff. Pure (deps
 * injected) so it can be unit tested with node --test. The email domain is
 * never trusted: see teamAccess in team.ts.
 */
import { OWNER_EMAIL, teamAccess, type StaffRole, type TeamMemberRow } from "../team.ts";

export type ActorUser = { id: string; email?: string | null; email_confirmed_at?: string | null };

export type ActorDeps = {
  /** The signed-in user from the token, or null. */
  getUser: () => Promise<ActorUser | null>;
  /** The team_members row for this email, or null. */
  getMember: (email: string) => Promise<(TeamMemberRow & { name?: string | null }) | null>;
  /** Mark an active member seen. Best effort. Never changes status. */
  touchMember: (email: string) => void;
  /** Create the owner row for a confirmed hello@forecourt.me. Must never overwrite an existing row. */
  seedOwner: (email: string) => Promise<void>;
  /**
   * Accept the caller's own invite (accept_team_invite in team-owner-only.sql)
   * and lock the account down (acceptInviteSecurely). True only when the
   * database saw mailbox proof dated after the invite AND the lock-down worked.
   */
  acceptInvite: (user: { id: string; email: string }) => Promise<boolean>;
};

/** The two Supabase Admin API calls used after an accept (service role only). */
export type AdminAuthLike = {
  updateUserById: (id: string, attrs: { password: string }) => Promise<{ error: unknown }>;
  signOut: (jwt: string, scope: "others") => Promise<{ error: unknown }>;
};

/** A long random password nobody knows. The person keeps signing in with email codes. */
export function unknownPassword(): string {
  const bytes = new Uint8Array(48);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * After an invite is accepted, close the other ways into the account. A
 * stranger may have registered the address with a password before the
 * invite (Supabase keeps it even after the real owner confirms by email). So:
 * replace the password with an unknown one, then sign out every session
 * except the one the hire is using now (scope "others").
 */
export async function lockDownAcceptedAccount(admin: AdminAuthLike, userId: string, token: string): Promise<boolean> {
  try {
    const pw = await admin.updateUserById(userId, { password: unknownPassword() });
    if (pw.error) return false;
    const out = await admin.signOut(token, "others");
    return !out.error;
  } catch {
    return false;
  }
}

/**
 * Accept, then lock down. If the lock-down fails the invite is put back
 * (undo), so access is never granted while another way in may still work.
 */
export async function acceptInviteSecurely(steps: {
  accept: () => Promise<boolean>;
  lockDown: () => Promise<boolean>;
  undo: () => Promise<void>;
}): Promise<boolean> {
  let accepted = false;
  try {
    accepted = await steps.accept();
  } catch {
    return false;
  }
  if (!accepted) return false;
  if (await steps.lockDown()) return true;
  try {
    await steps.undo();
  } catch {
    /* the row stays active only if undo also failed; logged by the caller */
  }
  return false;
}

export type ResolvedActor = {
  userId: string;
  email: string;
  team: boolean;
  role: StaffRole | null;
  name: string;
  /** Invited but not accepted yet: sign in from the invite email to accept. */
  pendingInvite: boolean;
};

export async function resolveActor(deps: ActorDeps): Promise<ResolvedActor> {
  const user = await deps.getUser();
  if (!user) throw new Error("Sign in again.");
  const email = (user.email ?? "").trim().toLowerCase();
  const emailConfirmed = Boolean(user.email_confirmed_at);
  let member = email ? await deps.getMember(email) : null;
  let access = teamAccess({ email, emailConfirmed, member });
  if (member && access.pendingInvite) {
    let accepted = false;
    try {
      accepted = await deps.acceptInvite({ id: user.id, email });
    } catch {
      accepted = false;
    }
    if (accepted) {
      member = await deps.getMember(email);
      access = teamAccess({ email, emailConfirmed, member });
    }
  }
  if (member) {
    if (access.team) deps.touchMember(email);
    return { userId: user.id, email, team: access.team, role: access.role, name: member.name ?? "", pendingInvite: access.pendingInvite };
  }
  if (access.seedOwner && email === OWNER_EMAIL) {
    try {
      await deps.seedOwner(email);
    } catch {
      /* the owner still gets in; the row is made next time */
    }
    // seedOwner never overwrites. If a row turned up (for example a revoked
    // hello@ the first read could not see), that row decides.
    let after: Awaited<ReturnType<ActorDeps["getMember"]>> = null;
    try {
      after = await deps.getMember(email);
    } catch {
      after = null;
    }
    if (after) {
      const a = teamAccess({ email, emailConfirmed, member: after });
      return { userId: user.id, email, team: a.team, role: a.role, name: after.name ?? "", pendingInvite: a.pendingInvite };
    }
    return { userId: user.id, email, team: true, role: "owner", name: "Matt Girvan", pendingInvite: false };
  }
  return { userId: user.id, email, team: false, role: null, name: "", pendingInvite: false };
}
