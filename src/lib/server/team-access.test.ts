/** Security hotfix: staff access never comes from the @forecourt.me domain. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { OWNER_EMAIL, onForecourtDomain, teamAccess, type TeamMemberRow } from "../team.ts";
import { resolveActor, type ActorUser } from "./team-actor.ts";

/** A fake Supabase: a user from the token and a team_members table. Records every write. */
function fake(user: ActorUser | null, rows: Record<string, TeamMemberRow & { name?: string }> = {}) {
  const writes: string[] = [];
  return {
    writes,
    rows,
    deps: {
      getUser: async () => user,
      getMember: async (email: string) => rows[email] ?? null,
      touchMember: (email: string, activate: boolean) => void writes.push(`touch ${email}${activate ? " activate" : ""}`),
      seedOwner: async (email: string) => {
        writes.push(`seed ${email}`);
        rows[email] = { status: "active", role: "owner", name: "Matt Girvan" };
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
    assert.deepEqual(teamAccess({ email, emailConfirmed: true, member: null }), { team: false, role: null, seedOwner: false });
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

test("an invited @forecourt.me member still gets in, as the role on the invite, and becomes active", async () => {
  const f = fake({ id: "u2", email: "ops@forecourt.me", email_confirmed_at: confirmed }, { "ops@forecourt.me": { status: "invited", role: "operator", name: "Ops" } });
  const who = await resolveActor(f.deps);
  assert.deepEqual({ team: who.team, role: who.role, name: who.name }, { team: true, role: "operator", name: "Ops" });
  assert.deepEqual(f.writes, ["touch ops@forecourt.me activate"]);
  // An active owner row stays owner; an active operator stays operator.
  assert.deepEqual(teamAccess({ email: "a@forecourt.me", emailConfirmed: false, member: { status: "active", role: "owner" } }), { team: true, role: "owner", seedOwner: false });
  assert.deepEqual(teamAccess({ email: "b@dealer.test", emailConfirmed: true, member: { status: "active", role: null } }), { team: true, role: "operator", seedOwner: false });
});

test("a revoked member is refused, even hello@ and even with a confirmed email", async () => {
  for (const email of ["ops@forecourt.me", OWNER_EMAIL]) {
    const f = fake({ id: "u3", email, email_confirmed_at: confirmed }, { [email]: { status: "revoked", role: "owner", name: "Gone" } });
    const who = await resolveActor(f.deps);
    assert.equal(who.team, false, email);
    assert.equal(who.role, null, email);
    assert.deepEqual(f.writes, [], "no touch, no seed, no re-activation");
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
