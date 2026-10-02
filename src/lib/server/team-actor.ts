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
   * and lock the account down (acceptInviteSecurely). "accepted" only when the
   * database saw mailbox proof dated after the invite AND the lock-down worked.
   */
  acceptInvite: (user: { id: string; email: string }) => Promise<AcceptResult>;
};

/**
 * accepted: the person is now active staff.
 * not-yet: no mailbox proof yet (sign in with an email code), nothing changed.
 * failed: something went wrong part way; the invite was put back.
 * other-sign-in: the account has Google, a passkey or an authenticator app
 *   attached, so it could still be used by someone else. Not accepted.
 */
export type AcceptResult = "accepted" | "not-yet" | "failed" | "other-sign-in";

/** Supabase Auth refuses passwords longer than this (gotrue internal/api/password.go). */
export const MAX_PASSWORD_LENGTH = 72;

/** The Supabase Admin API calls used around an accept (service role only). */
export type AdminAuthLike = {
  updateUserById: (id: string, attrs: { password: string }) => Promise<{ error: unknown }>;
  signOut: (jwt: string, scope: "others") => Promise<{ error: unknown }>;
};

export type SignInMethodsLike = {
  getUserById: (id: string) => Promise<{
    data: { user: { identities?: { provider?: string | null }[] | null; factors?: { status?: string | null; factor_type?: string | null }[] | null } | null } | null;
    error: unknown;
  }>;
  listPasskeys: (userId: string) => Promise<{ data: unknown[] | null; error: unknown }>;
};

type Log = (message: string) => void;
const logError: Log = (message) => console.error(message);

/** A short description of an Admin API error, safe to log. Never includes the password. */
export function describeError(error: unknown, secret?: string): string {
  let text: string;
  if (error && typeof error === "object") {
    const e = error as { message?: unknown; status?: unknown; code?: unknown };
    const parts = [e.status, e.code, e.message].filter((v) => v !== undefined && v !== null && v !== "").map(String);
    text = parts.length ? parts.join(" ") : "unknown error";
  } else {
    text = error === undefined || error === null ? "unknown error" : String(error);
  }
  return secret ? text.split(secret).join("[hidden]") : text;
}

/**
 * A random password nobody knows. The person keeps signing in with email
 * codes. 32 random bytes as base64url (43 characters) plus "Aa1!", so 47
 * characters: under Supabase's 72 limit, and it has a lower case letter, an
 * upper case letter, a digit and a symbol, so it also passes a project's
 * "required characters" setting.
 */
export function unknownPassword(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const b64url = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url}Aa1!`;
}

/**
 * The ways into this account other than email codes: a linked identity such
 * as Google, a passkey, or a verified authenticator app. Returns null if the
 * Admin API could not answer (callers treat that as a refusal).
 */
export async function otherSignInMethods(admin: SignInMethodsLike, userId: string, log: Log = logError): Promise<string[] | null> {
  try {
    const found: string[] = [];
    const u = await admin.getUserById(userId);
    const user = u.data?.user;
    if (u.error || !user) {
      log(`[team] could not read the sign-in methods of user ${userId}: ${describeError(u.error ?? "no user")}`);
      return null;
    }
    for (const i of user.identities ?? []) {
      const provider = (i.provider ?? "").toLowerCase();
      if (provider !== "email") found.push(provider || "unknown identity");
    }
    for (const f of user.factors ?? []) {
      if (f.status === "verified") found.push(f.factor_type ? `${f.factor_type} factor` : "factor");
    }
    const pk = await admin.listPasskeys(userId);
    if (pk.error) {
      // 404 from an Auth server without passkeys at all: none can exist.
      // Any other error (including user_not_found) is a refusal.
      const e = pk.error as { status?: unknown; code?: unknown };
      if (!(e.status === 404 && e.code !== "user_not_found")) {
        log(`[team] could not list the passkeys of user ${userId}: ${describeError(pk.error)}`);
        return null;
      }
    } else {
      if (!Array.isArray(pk.data)) {
        log(`[team] unexpected passkey list for user ${userId}`);
        return null;
      }
      if (pk.data.length) found.push(pk.data.length === 1 ? "passkey" : `${pk.data.length} passkeys`);
    }
    return found;
  } catch (e) {
    log(`[team] could not check the sign-in methods of user ${userId}: ${describeError(e)}`);
    return null;
  }
}

/**
 * After an invite is accepted, close the other ways into the account. A
 * stranger may have registered the address with a password before the
 * invite (Supabase keeps it even after the real owner confirms by email). So:
 * replace the password with an unknown one, then sign out every session
 * except the one the hire is using now (scope "others"). Any Admin API error
 * is logged (never the password) and counts as a failure.
 */
export async function lockDownAcceptedAccount(admin: AdminAuthLike, userId: string, token: string, log: Log = logError): Promise<boolean> {
  const password = unknownPassword();
  try {
    const pw = await admin.updateUserById(userId, { password });
    if (pw.error) {
      log(`[team] could not replace the password of user ${userId}: ${describeError(pw.error, password)}`);
      return false;
    }
    const out = await admin.signOut(token, "others");
    if (out.error) {
      log(`[team] could not sign out the other sessions of user ${userId}: ${describeError(out.error, password)}`);
      return false;
    }
    return true;
  } catch (e) {
    log(`[team] lock-down of user ${userId} failed: ${describeError(e, password)}`);
    return false;
  }
}

/**
 * Refuse while the account has another way in, then accept, then lock down
 * and check again. If anything after the accept fails the invite is put back
 * (undo), so access is never granted while another way in may still work.
 * If the undo fails too, it is retried once and then logged loudly with the
 * address and user id, so Matt can revoke the row by hand.
 */
export async function acceptInviteSecurely(steps: {
  who: { id: string; email: string };
  otherSignIn: () => Promise<string[] | null>;
  /** True when the database accepted. Throws when the call itself failed. */
  accept: () => Promise<boolean>;
  lockDown: () => Promise<boolean>;
  /** Put the invite back. Throws or returns false when that failed. */
  undo: () => Promise<boolean>;
  log?: Log;
}): Promise<AcceptResult> {
  const log = steps.log ?? logError;
  const before = await steps.otherSignIn();
  if (before === null) return "failed";
  if (before.length) {
    log(`[team] invite for ${steps.who.email} (user ${steps.who.id}) not accepted: the account also has ${before.join(", ")}`);
    return "other-sign-in";
  }
  let accepted: boolean;
  try {
    accepted = await steps.accept();
  } catch (e) {
    log(`[team] accept_team_invite failed for ${steps.who.email}: ${describeError(e)}`);
    return "failed";
  }
  if (!accepted) return "not-yet";
  let result: AcceptResult = "failed";
  if (await steps.lockDown()) {
    const after = await steps.otherSignIn();
    if (after && after.length === 0) return "accepted";
    if (after && after.length) {
      log(`[team] ${steps.who.email} (user ${steps.who.id}) gained ${after.join(", ")} while accepting`);
      result = "other-sign-in";
    }
  }
  log(`[team] could not lock down ${steps.who.email} (user ${steps.who.id}) after accepting; putting the invite back`);
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (await steps.undo()) return result;
    } catch (e) {
      log(`[team] putting the invite back failed (attempt ${attempt}): ${describeError(e)}`);
    }
  }
  log(
    `[team] SECURITY: team row ${steps.who.email} (user ${steps.who.id}) is ACTIVE but its account was not locked down. ` +
      "Revoke it in the office Staff list now, then tell Forge.",
  );
  return "failed";
}

export type ResolvedActor = {
  userId: string;
  email: string;
  team: boolean;
  role: StaffRole | null;
  name: string;
  /** Invited but not accepted yet: sign in from the invite email to accept. */
  pendingInvite: boolean;
  /** Set when accepting was tried just now and did not finish (see AcceptResult). */
  acceptProblem: "failed" | "other-sign-in" | null;
};

export async function resolveActor(deps: ActorDeps): Promise<ResolvedActor> {
  const user = await deps.getUser();
  if (!user) throw new Error("Sign in again.");
  const email = (user.email ?? "").trim().toLowerCase();
  const emailConfirmed = Boolean(user.email_confirmed_at);
  let member = email ? await deps.getMember(email) : null;
  let access = teamAccess({ email, emailConfirmed, member });
  let acceptProblem: ResolvedActor["acceptProblem"] = null;
  if (member && access.pendingInvite) {
    let result: AcceptResult;
    try {
      result = await deps.acceptInvite({ id: user.id, email });
    } catch {
      result = "failed";
    }
    if (result === "accepted") {
      member = await deps.getMember(email);
      access = teamAccess({ email, emailConfirmed, member });
    } else if (result === "failed" || result === "other-sign-in") {
      acceptProblem = result;
    }
  }
  if (member) {
    if (access.team) deps.touchMember(email);
    return {
      userId: user.id,
      email,
      team: access.team,
      role: access.role,
      name: member.name ?? "",
      pendingInvite: access.pendingInvite,
      acceptProblem: access.team ? null : acceptProblem,
    };
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
      return { userId: user.id, email, team: a.team, role: a.role, name: after.name ?? "", pendingInvite: a.pendingInvite, acceptProblem: null };
    }
    return { userId: user.id, email, team: true, role: "owner", name: "Matt Girvan", pendingInvite: false, acceptProblem: null };
  }
  return { userId: user.id, email, team: false, role: null, name: "", pendingInvite: false, acceptProblem: null };
}
