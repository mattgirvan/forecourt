/** Staff access never comes from the @forecourt.me domain, and an invite grants nothing until accepted. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { OWNER_EMAIL, onForecourtDomain, teamAccess, teamChangeRefusal, type TeamMemberRow } from "../team.ts";
import { resolveActor, type ActorUser } from "./team-actor.ts";

/** A fake Supabase: a user from the token and a team_members table. Records every write. */
function fake(user: ActorUser | null, rows: Record<string, TeamMemberRow & { name?: string }> = {}, accepts = false) {
  const writes: string[] = [];
  return {
    writes,
    rows,
    deps: {
      getUser: async () => user,
      getMember: async (email: string): Promise<(TeamMemberRow & { name?: string | null }) | null> => rows[email] ?? null,
      touchMember: (email: string) => void writes.push(`touch ${email}`),
      seedOwner: async (email: string) => {
        writes.push(`seed ${email}`);
        // Insert only, like the real one: an existing row is left alone.
        rows[email] ??= { status: "active", role: "owner", name: "Matt Girvan" };
      },
      acceptInvite: async () => {
        writes.push("accept");
        const email = (user?.email ?? "").toLowerCase();
        if (!accepts || rows[email]?.status !== "invited") return false;
        rows[email] = { ...rows[email], status: "active" };
        return true;
      },
    },
  };
}

const confirmed = "2026-10-02T02:00:00Z";

test("a fresh @forecourt.me signup is not staff, and nothing is written", async () => {
  for (const email of ["stranger@forecourt.me", "Admin@Forecourt.me", "hello.matt@forecourt.me", "hello@forecourt.me.evil.com", "x@sub.forecourt.me"]) {
    const f = fake({ id: "u1", email, email_confirmed_at: confirmed });
    const who = await resolveActor(f.deps);
    assert.equal(who.team, false, email);
    assert.equal(who.role, null, email);
    assert.deepEqual(f.writes, [], `no team_members or team_emails write for ${email}`);
    assert.deepEqual(teamAccess({ email, emailConfirmed: true, member: null }), { team: false, role: null, seedOwner: false, pendingInvite: false });
  }
});

test("hello@forecourt.me with a confirmed email is owner, and its row is made once", async () => {
  const f = fake({ id: "u0", email: "Hello@Forecourt.me", email_confirmed_at: confirmed });
  const who = await resolveActor(f.deps);
  assert.deepEqual({ team: who.team, role: who.role, email: who.email, name: who.name }, { team: true, role: "owner", email: OWNER_EMAIL, name: "Matt Girvan" });
  assert.deepEqual(f.writes, ["seed hello@forecourt.me"]);
  // Next time the row exists: no second seed.
  const again = await resolveActor(f.deps);
  assert.equal(again.role, "owner");
  assert.deepEqual(f.writes, ["seed hello@forecourt.me", "touch hello@forecourt.me"]);
});

test("hello@forecourt.me without a confirmed email gets no team access", async () => {
  for (const email_confirmed_at of [null, undefined, ""]) {
    const f = fake({ id: "u0", email: OWNER_EMAIL, email_confirmed_at });
    const who = await resolveActor(f.deps);
    assert.equal(who.team, false);
    assert.equal(who.role, null);
    assert.deepEqual(f.writes, []);
    // Not even with its owner row in place.
    const withRow = fake({ id: "u0", email: OWNER_EMAIL, email_confirmed_at }, { [OWNER_EMAIL]: { status: "active", role: "owner", name: "Matt Girvan" } });
    const w = await resolveActor(withRow.deps);
    assert.equal(w.team, false);
    assert.deepEqual(withRow.writes, []);
  }
});

test("an invite grants nothing until the database accepts it with mailbox proof", async () => {
  const row = () => ({ "ops@forecourt.me": { status: "invited", role: "owner", name: "Ops" } });
  // No proof (for example a password sign-in, or one from before the invite): no access, no touch.
  const f = fake({ id: "u2", email: "ops@forecourt.me", email_confirmed_at: confirmed }, row(), false);
  const who = await resolveActor(f.deps);
  assert.deepEqual({ team: who.team, role: who.role, pendingInvite: who.pendingInvite }, { team: false, role: null, pendingInvite: true });
  assert.deepEqual(f.writes, ["accept"]);
  // With proof: active, as the role on the invite.
  const ok = fake({ id: "u2", email: "ops@forecourt.me", email_confirmed_at: confirmed }, row(), true);
  const yes = await resolveActor(ok.deps);
  assert.deepEqual({ team: yes.team, role: yes.role, name: yes.name, pendingInvite: yes.pendingInvite }, { team: true, role: "owner", name: "Ops", pendingInvite: false });
  assert.deepEqual(ok.writes, ["accept", "touch ops@forecourt.me"]);
  // If the accept call throws, still no access.
  const boom = fake({ id: "u2", email: "ops@forecourt.me", email_confirmed_at: confirmed }, row());
  boom.deps.acceptInvite = async () => {
    throw new Error("network");
  };
  assert.equal((await resolveActor(boom.deps)).team, false);
  assert.deepEqual(teamAccess({ email: "ops@forecourt.me", emailConfirmed: true, member: { status: "invited", role: "owner" } }), { team: false, role: null, seedOwner: false, pendingInvite: true });
  // An active owner row stays owner; an active operator stays operator.
  assert.deepEqual(teamAccess({ email: "a@forecourt.me", emailConfirmed: false, member: { status: "active", role: "owner" } }), { team: true, role: "owner", seedOwner: false, pendingInvite: false });
  assert.deepEqual(teamAccess({ email: "b@dealer.test", emailConfirmed: true, member: { status: "active", role: null } }), { team: true, role: "operator", seedOwner: false, pendingInvite: false });
});

test("a revoked hello@ the first read missed stays revoked: the seed never overwrites", async () => {
  const rows: Record<string, TeamMemberRow & { name?: string }> = {};
  const f = fake({ id: "u0", email: OWNER_EMAIL, email_confirmed_at: confirmed }, rows);
  let reads = 0;
  f.deps.getMember = async (email: string) => (reads++ === 0 ? null : { status: "revoked", role: "owner", name: "Matt Girvan" });
  const who = await resolveActor(f.deps);
  assert.equal(who.team, false);
  assert.equal(who.role, null);
});

test("team changes: owners only, never hello@ from the office, invites start fresh", () => {
  const base = { actorEmail: "owner@forecourt.me", target: "new@forecourt.me" };
  assert.match(teamChangeRefusal({ ...base, actorRole: "operator", change: "invite" }) ?? "", /Only an owner/);
  assert.match(teamChangeRefusal({ ...base, actorRole: null, change: "role" }) ?? "", /Only an owner/);
  assert.equal(teamChangeRefusal({ ...base, actorRole: "owner", change: "invite" }), null);
  assert.equal(teamChangeRefusal({ ...base, actorRole: "owner", change: "revoke" }), null);
  for (const change of ["invite", "role", "revoke", "restore"] as const) {
    assert.match(teamChangeRefusal({ ...base, target: "Hello@Forecourt.me", actorRole: "owner", change }) ?? "", /SQL editor/);
    assert.match(teamChangeRefusal({ ...base, actorEmail: OWNER_EMAIL, target: OWNER_EMAIL, actorRole: "owner", change }) ?? "", /SQL editor/);
  }
  assert.match(teamChangeRefusal({ ...base, actorRole: "owner", change: "invite", targetStatus: "active" }) ?? "", /already have access/);
  assert.match(teamChangeRefusal({ ...base, target: base.actorEmail, actorRole: "owner", change: "revoke" }) ?? "", /cannot revoke yourself/);
});

test("a revoked member is refused, even hello@ and even with a confirmed email", async () => {
  for (const email of ["ops@forecourt.me", OWNER_EMAIL]) {
    const f = fake({ id: "u3", email, email_confirmed_at: confirmed }, { [email]: { status: "revoked", role: "owner", name: "Gone" } });
    const who = await resolveActor(f.deps);
    assert.equal(who.team, false, email);
    assert.equal(who.role, null, email);
    assert.deepEqual(f.writes, [], "no touch, no seed, no accept, no re-activation");
  }
});

test("a dealer is not staff; no user means sign in again", async () => {
  const f = fake({ id: "u4", email: "sam@northside.test", email_confirmed_at: confirmed });
  assert.equal((await resolveActor(f.deps)).team, false);
  assert.deepEqual(f.writes, []);
  await assert.rejects(resolveActor(fake(null).deps), /Sign in again\./);
});

test("the domain helper is only a recipient check", () => {
  assert.equal(onForecourtDomain("x@forecourt.me"), true);
  assert.equal(onForecourtDomain("x@dealer.test"), false);
  assert.equal(onForecourtDomain(""), false);
});
