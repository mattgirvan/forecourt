/** Staff access never comes from the @forecourt.me domain, and an invite grants nothing until accepted. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { OWNER_EMAIL, onForecourtDomain, teamAccess, teamChangeRefusal, type TeamMemberRow } from "../team.ts";
import {
  acceptInviteSecurely,
  lockDownAcceptedAccount,
  MAX_PASSWORD_LENGTH,
  otherSignInMethods,
  resolveActor,
  unknownPassword,
  type AcceptResult,
  type ActorDeps,
  type ActorUser,
  type AdminAuthLike,
  type SignInMethodsLike,
} from "./team-actor.ts";

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
        if (!accepts || rows[email]?.status !== "invited") return "not-yet" as AcceptResult;
        rows[email] = { ...rows[email], status: "active" };
        return "accepted" as AcceptResult;
      },
    } as ActorDeps,
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
  assert.deepEqual(
    { team: who.team, role: who.role, pendingInvite: who.pendingInvite, acceptProblem: who.acceptProblem },
    { team: false, role: null, pendingInvite: true, acceptProblem: null },
    "no proof yet: the email code hint, not an error",
  );
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
  const boomed = await resolveActor(boom.deps);
  assert.deepEqual({ team: boomed.team, acceptProblem: boomed.acceptProblem }, { team: false, acceptProblem: "failed" });
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

/**
 * A mock of the two Supabase Admin API calls. updateUserById rejects a
 * password over 72 characters exactly the way Supabase Auth does
 * (internal/api/password.go:13,31, checked in adminUserUpdate before the
 * password is set): HTTP 400, nothing changed. Records every call.
 */
function mockAdmin(fail: { password?: boolean; signOut?: boolean; throws?: boolean; echo?: boolean } = {}) {
  const calls: string[] = [];
  let password = "";
  const admin: AdminAuthLike = {
    updateUserById: async (id, attrs) => {
      if (fail.throws) throw new Error("network");
      calls.push(`password ${id}`);
      if (attrs.password.length > MAX_PASSWORD_LENGTH) {
        return { error: { status: 400, code: "validation_failed", message: `Password cannot be longer than ${MAX_PASSWORD_LENGTH} characters` } };
      }
      if (fail.echo) return { error: { status: 422, message: `rejected ${attrs.password}` } };
      password = attrs.password;
      return { error: fail.password ? { status: 500, message: "no" } : null };
    },
    signOut: async (jwt, scope) => {
      calls.push(`signOut ${jwt} ${scope}`);
      return { error: fail.signOut ? { status: 500, message: "sign out failed" } : null };
    },
  };
  return { admin, calls, password: () => password };
}

test("the unknown password fits Supabase's 72 character limit and has every character class", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const p = unknownPassword();
    assert.ok(p.length <= MAX_PASSWORD_LENGTH, `length ${p.length}`);
    assert.equal(p.length, 47);
    assert.match(p, /^[A-Za-z0-9_-]{43}Aa1!$/, "43 base64url characters (32 random bytes) then Aa1!");
    assert.match(p, /[a-z]/);
    assert.match(p, /[A-Z]/);
    assert.match(p, /[0-9]/);
    assert.match(p, /[^A-Za-z0-9]/);
    seen.add(p);
  }
  assert.equal(seen.size, 200, "never repeats");
  assert.equal(MAX_PASSWORD_LENGTH, 72);
});

test("the mock refuses long passwords like Supabase, so the old 96 character one would fail", async () => {
  const m = mockAdmin();
  const r = await m.admin.updateUserById("u9", { password: "a".repeat(96) });
  assert.match(String((r.error as { message: string }).message), /cannot be longer than 72/);
  assert.equal((await m.admin.updateUserById("u9", { password: "a".repeat(72) })).error, null);
});

test("after an accept: an unknown password, then every OTHER session signed out", async () => {
  const m = mockAdmin();
  assert.equal(await lockDownAcceptedAccount(m.admin, "u9", "hire-token"), true);
  assert.deepEqual(m.calls, ["password u9", "signOut hire-token others"], "the hire's own session (this token) is kept");
  assert.ok(m.password().length <= MAX_PASSWORD_LENGTH);
  assert.notEqual(unknownPassword(), unknownPassword());
  // Any failure means not locked down, and the Admin API error is logged.
  const logs: string[] = [];
  const pw = mockAdmin({ password: true });
  assert.equal(await lockDownAcceptedAccount(pw.admin, "u9", "t", (s) => logs.push(s)), false);
  assert.deepEqual(pw.calls, ["password u9"], "no sign-out attempt after a failed password change");
  assert.equal(await lockDownAcceptedAccount(mockAdmin({ signOut: true }).admin, "u9", "t", (s) => logs.push(s)), false);
  assert.equal(await lockDownAcceptedAccount(mockAdmin({ throws: true }).admin, "u9", "t", (s) => logs.push(s)), false);
  assert.deepEqual(logs, [
    "[team] could not replace the password of user u9: 500 no",
    "[team] could not sign out the other sessions of user u9: 500 sign out failed",
    "[team] lock-down of user u9 failed: network",
  ]);
});

test("the Admin API error is logged without the password, even if the error repeats it", async () => {
  const logs: string[] = [];
  const m = mockAdmin({ echo: true });
  assert.equal(await lockDownAcceptedAccount(m.admin, "u9", "t", (s) => logs.push(s)), false);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^\[team\] could not replace the password of user u9: 422 rejected \[hidden\]$/);
  assert.doesNotMatch(logs[0], /Aa1!/);
});

/** A mock of getUserById and the passkey list. */
function mockMethods(opts: {
  identities?: readonly string[];
  factors?: { status: string; factor_type: string }[];
  passkeys?: number;
  passkeyError?: { status: number; code?: string; message?: string };
  userError?: boolean;
  throws?: boolean;
} = {}): SignInMethodsLike {
  return {
    getUserById: async () => {
      if (opts.throws) throw new Error("network");
      if (opts.userError) return { data: { user: null }, error: { status: 500, message: "down" } };
      return {
        data: { user: { identities: (opts.identities ?? ["email"]).map((provider) => ({ provider })), factors: opts.factors ?? [] } },
        error: null,
      };
    },
    listPasskeys: async () =>
      opts.passkeyError
        ? { data: null, error: opts.passkeyError }
        : { data: Array.from({ length: opts.passkeys ?? 0 }, (_, i) => ({ id: `pk${i}` })), error: null },
  };
}

test("other ways into the account: Google, passkeys and authenticator apps are found; errors refuse", async () => {
  const quiet = () => {};
  assert.deepEqual(await otherSignInMethods(mockMethods(), "u1", quiet), [], "email code only");
  assert.deepEqual(await otherSignInMethods(mockMethods({ identities: ["email", "google"] }), "u1", quiet), ["google"]);
  assert.deepEqual(await otherSignInMethods(mockMethods({ identities: ["email", "phone"] }), "u1", quiet), ["phone"]);
  assert.deepEqual(await otherSignInMethods(mockMethods({ passkeys: 1 }), "u1", quiet), ["passkey"]);
  assert.deepEqual(await otherSignInMethods(mockMethods({ passkeys: 2 }), "u1", quiet), ["2 passkeys"]);
  assert.deepEqual(
    await otherSignInMethods(mockMethods({ factors: [{ status: "verified", factor_type: "totp" }, { status: "unverified", factor_type: "webauthn" }] }), "u1", quiet),
    ["totp factor"],
    "an unfinished factor cannot be used to sign in",
  );
  // An Auth server with no passkey endpoint at all (404, not user_not_found): none can exist.
  assert.deepEqual(await otherSignInMethods(mockMethods({ passkeyError: { status: 404, code: "not_found" } }), "u1", quiet), []);
  // Anything the check cannot answer is a refusal (null).
  assert.equal(await otherSignInMethods(mockMethods({ passkeyError: { status: 404, code: "user_not_found" } }), "u1", quiet), null);
  assert.equal(await otherSignInMethods(mockMethods({ passkeyError: { status: 500, message: "down" } }), "u1", quiet), null);
  assert.equal(await otherSignInMethods(mockMethods({ userError: true }), "u1", quiet), null);
  assert.equal(await otherSignInMethods(mockMethods({ throws: true }), "u1", quiet), null);
});

test("accept is only kept when the account has no other way in and the lock-down works", async () => {
  const log: string[] = [];
  const logs: string[] = [];
  const who = { id: "u7", email: "sales@forecourt.me" };
  const steps = (o: {
    before?: string[] | null;
    after?: string[] | null;
    accept?: boolean | "throw";
    lock?: boolean;
    undo?: (boolean | "throw")[];
  }) => {
    const undos = [...(o.undo ?? [true])];
    let checks = 0;
    return {
      who,
      log: (s: string) => void logs.push(s),
      otherSignIn: async () => {
        log.push("check");
        return checks++ === 0 ? (o.before === undefined ? [] : o.before) : o.after === undefined ? [] : o.after;
      },
      accept: async () => {
        if (o.accept === "throw") throw new Error("rpc");
        log.push("accept");
        return o.accept ?? true;
      },
      lockDown: async () => {
        log.push("lockDown");
        return o.lock ?? true;
      },
      undo: async () => {
        log.push("undo");
        const r = undos.shift() ?? true;
        if (r === "throw") throw new Error("db");
        return r;
      },
    };
  };
  assert.equal(await acceptInviteSecurely(steps({})), "accepted");
  assert.deepEqual(log.splice(0), ["check", "accept", "lockDown", "check"]);
  assert.equal(await acceptInviteSecurely(steps({ accept: false })), "not-yet");
  assert.deepEqual(log.splice(0), ["check", "accept"], "no proof: nothing is touched");
  assert.equal(await acceptInviteSecurely(steps({ before: ["google"] })), "other-sign-in");
  assert.deepEqual(log.splice(0), ["check"], "another way in: refused before the database is asked");
  assert.equal(await acceptInviteSecurely(steps({ before: null })), "failed");
  assert.deepEqual(log.splice(0), ["check"]);
  assert.equal(await acceptInviteSecurely(steps({ accept: "throw" })), "failed");
  assert.deepEqual(log.splice(0), ["check"]);
  assert.equal(await acceptInviteSecurely(steps({ lock: false })), "failed");
  assert.deepEqual(log.splice(0), ["check", "accept", "lockDown", "undo"]);
  assert.equal(await acceptInviteSecurely(steps({ after: ["passkey"] })), "other-sign-in", "a passkey added mid-accept is caught");
  assert.deepEqual(log.splice(0), ["check", "accept", "lockDown", "check", "undo"]);
  assert.equal(await acceptInviteSecurely(steps({ after: null })), "failed");
  assert.deepEqual(log.splice(0), ["check", "accept", "lockDown", "check", "undo"]);
  // The undo is retried once.
  logs.splice(0);
  assert.equal(await acceptInviteSecurely(steps({ lock: false, undo: ["throw", true] })), "failed");
  assert.deepEqual(log.splice(0), ["check", "accept", "lockDown", "undo", "undo"]);
  assert.ok(!logs.some((s) => s.includes("SECURITY")), "no alarm when the retry worked");
  // Lock-down AND undo both fail: a loud log with the address and user id.
  logs.splice(0);
  assert.equal(await acceptInviteSecurely(steps({ lock: false, undo: ["throw", false] })), "failed");
  assert.deepEqual(log.splice(0), ["check", "accept", "lockDown", "undo", "undo"]);
  const alarm = logs.find((s) => s.includes("SECURITY")) ?? "";
  assert.match(alarm, /team row sales@forecourt\.me \(user u7\) is ACTIVE but its account was not locked down/);
  assert.match(alarm, /Revoke it in the office Staff list now/);
});

test("the full accept path with mocked Admin calls: the hire gets in; a failure or another way in keeps them out", async () => {
  const cases = [
    { name: "ok", fail: {}, methods: {}, team: true, problem: null, status: "active", calls: ["password u5", "signOut hire-token others"] },
    { name: "sign-out fails", fail: { signOut: true }, methods: {}, team: false, problem: "failed", status: "invited", calls: ["password u5", "signOut hire-token others"] },
    { name: "google linked", fail: {}, methods: { identities: ["email", "google"] }, team: false, problem: "other-sign-in", status: "invited", calls: [] },
    { name: "passkey", fail: {}, methods: { passkeys: 1 }, team: false, problem: "other-sign-in", status: "invited", calls: [] },
  ] as const;
  for (const c of cases) {
    const rows: Record<string, TeamMemberRow & { name?: string }> = { "sales@forecourt.me": { status: "invited", role: "operator", name: "Sales" } };
    const m = mockAdmin(c.fail);
    const f = fake({ id: "u5", email: "sales@forecourt.me", email_confirmed_at: confirmed }, rows);
    f.deps.acceptInvite = (user) =>
      acceptInviteSecurely({
        who: user,
        log: () => {},
        otherSignIn: () => otherSignInMethods(mockMethods(c.methods), user.id, () => {}),
        accept: async () => {
          rows[user.email] = { ...rows[user.email], status: "active" };
          return true;
        },
        lockDown: () => lockDownAcceptedAccount(m.admin, user.id, "hire-token", () => {}),
        undo: async () => {
          rows[user.email] = { ...rows[user.email], status: "invited" };
          return true;
        },
      });
    const who = await resolveActor(f.deps);
    assert.equal(who.team, c.team, c.name);
    assert.equal(who.pendingInvite, !c.team, c.name);
    assert.equal(who.acceptProblem, c.problem, c.name);
    assert.equal(rows["sales@forecourt.me"].status, c.status, c.name);
    assert.deepEqual(m.calls, c.calls, c.name);
  }
});
