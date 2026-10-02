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
  /** Mark a member seen; an invited member becomes active. Best effort. */
  touchMember: (email: string, activate: boolean) => void;
  /** Create the owner row for a confirmed hello@forecourt.me. Only ever called for that address. */
  seedOwner: (email: string) => Promise<void>;
};

export type ResolvedActor = { userId: string; email: string; team: boolean; role: StaffRole | null; name: string };

export async function resolveActor(deps: ActorDeps): Promise<ResolvedActor> {
  const user = await deps.getUser();
  if (!user) throw new Error("Sign in again.");
  const email = (user.email ?? "").trim().toLowerCase();
  const member = email ? await deps.getMember(email) : null;
  const access = teamAccess({ email, emailConfirmed: Boolean(user.email_confirmed_at), member });
  if (member) {
    if (access.team) deps.touchMember(email, member.status === "invited");
    return { userId: user.id, email, team: access.team, role: access.role, name: member.name ?? "" };
  }
  if (access.seedOwner && email === OWNER_EMAIL) {
    try {
      await deps.seedOwner(email);
    } catch {
      /* the owner still gets in; the row is made next time */
    }
    return { userId: user.id, email, team: true, role: "owner", name: "Matt Girvan" };
  }
  return { userId: user.id, email, team: false, role: null, name: "" };
}
