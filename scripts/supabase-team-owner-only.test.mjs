/**
 * supabase/team-owner-only.sql, run for real in PGlite on top of the repo's
 * Supabase SQL. Only owners change the team; an invite grants nothing until
 * accepted with mailbox proof dated after it; re-running portal.sql or
 * staff.sql never brings back a revoked person; a revoked hello@ stays
 * revoked; every staff policy calls (select public.is_team()).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { projectRoot } from "./with-app-env.mjs";

const sqlDir = join(projectRoot(), "supabase");
const read = (f) => readFileSync(join(sqlDir, f), "utf8");

const STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
`;

const U = {
  hello: { id: "00000000-0000-0000-0000-000000000001", email: "hello@forecourt.me" },
  owner2: { id: "00000000-0000-0000-0000-000000000002", email: "boss@forecourt.me" },
  operator: { id: "00000000-0000-0000-0000-000000000003", email: "ops@forecourt.me" },
  invited: { id: "00000000-0000-0000-0000-000000000004", email: "sales@forecourt.me" },
  stranger: { id: "00000000-0000-0000-0000-000000000005", email: "stranger@forecourt.me" },
  dealer: { id: "00000000-0000-0000-0000-000000000006", email: "sam@dealer.test" },
};

const ORDER = ["control-plane.sql", "billing.sql", "team-owner-only.sql", "portal.sql", "staff.sql", "build.sql", "archive.sql", "email-log.sql", "enquiries.sql"];

async function db() {
  const d = new PGlite();
  await d.exec(STUB);
  for (const f of ORDER) await d.exec(read(f));
  // Safe to run more than once.
  await d.exec(read("team-owner-only.sql"));
  await d.exec(`
    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to anon, authenticated, service_role;
    grant all on all sequences in schema public to anon, authenticated, service_role;
    insert into auth.users values
      ('${U.hello.id}', '${U.hello.email}', now()),
      ('${U.owner2.id}', '${U.owner2.email}', now()),
      ('${U.operator.id}', '${U.operator.email}', now()),
      ('${U.invited.id}', '${U.invited.email}', now()),
      ('${U.stranger.id}', '${U.stranger.email}', now()),
      ('${U.dealer.id}', '${U.dealer.email}', now());
    insert into team_members (email, role, status) values
      ('${U.owner2.email}', 'owner', 'active'),
      ('${U.operator.email}', 'operator', 'active'),
      ('${U.invited.email}', 'owner', 'invited');
    insert into team_emails (email) values ('${U.operator.email}'), ('${U.invited.email}');
  `);
  return d;
}

const now = () => Math.floor(Date.now() / 1000);

/** Run as a signed-in Supabase request (role plus JWT claims, like PostgREST). */
async function as(d, who, sql, params = [], amr = [{ method: "password", timestamp: now() }]) {
  const claims = { sub: who.id, email: who.email, role: "authenticated", amr };
  await d.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
  await d.exec("set role authenticated");
  try {
    return await d.query(sql, params);
  } finally {
    await d.exec("reset role");
    await d.query("select set_config('request.jwt.claims', '', false)");
  }
}
const isTeam = async (d, who) => (await as(d, who, "select public.is_team() as t")).rows[0].t;
const isOwner = async (d, who) => (await as(d, who, "select public.is_team_owner() as t")).rows[0].t;
const row = async (d, email) => (await d.query("select * from team_members where email = $1", [email])).rows[0];
const changed = async (d, who, sql, params) => {
  try {
    return (await as(d, who, sql, params)).affectedRows ?? 0;
  } catch {
    return -1;
  }
};

test("who is staff and who is owner", async () => {
  const d = await db();
  assert.equal(await isTeam(d, U.hello), true);
  assert.equal(await isOwner(d, U.hello), true);
  assert.equal(await isOwner(d, U.owner2), true);
  assert.equal(await isTeam(d, U.operator), true);
  assert.equal(await isOwner(d, U.operator), false);
  assert.equal(await isTeam(d, U.invited), false, "an invite grants nothing until accepted");
  assert.equal(await isOwner(d, U.invited), false);
  assert.equal(await isTeam(d, U.stranger), false);
  assert.equal(await isTeam(d, U.dealer), false);
  // hello@ needs a confirmed email; a token claiming hello@ for another user id is not enough.
  assert.equal(await isOwner(d, { id: U.stranger.id, email: U.hello.email }), false);
  await d.exec(`update auth.users set email_confirmed_at = null where id = '${U.hello.id}'`);
  assert.equal(await isTeam(d, U.hello), false);
  assert.equal(await isOwner(d, U.hello), false);
});

test("an operator cannot promote themselves, add an owner, revoke hello@ or edit team_emails", async () => {
  const d = await db();
  const op = U.operator;
  assert.ok((await changed(d, op, "update team_members set role = 'owner' where email = $1", [op.email])) <= 0);
  assert.ok((await changed(d, op, "insert into team_members (email, role, status) values ('outsider@evil.test', 'owner', 'invited')")) <= 0);
  assert.ok((await changed(d, op, "update team_members set status = 'revoked' where email = 'hello@forecourt.me'")) <= 0);
  assert.ok((await changed(d, op, "delete from team_members where email = 'hello@forecourt.me'")) <= 0);
  assert.ok((await changed(d, op, "insert into team_emails (email) values ('outsider@evil.test')")) <= 0);
  assert.ok((await changed(d, op, "delete from team_emails where email = $1", [U.invited.email])) <= 0);
  assert.equal((await row(d, op.email)).role, "operator");
  assert.equal((await row(d, U.hello.email)).status, "active");
  assert.equal(await row(d, "outsider@evil.test"), undefined);
  // An operator can still read the team list (staff), and do staff work.
  assert.equal((await as(d, op, "select count(*)::int as n from team_members")).rows[0].n, 4);
});

test("an unaccepted invite cannot change anything, even when invited as owner", async () => {
  const d = await db();
  const inv = U.invited;
  assert.ok((await changed(d, inv, "update team_members set status = 'active' where email = $1", [inv.email])) <= 0);
  assert.ok((await changed(d, inv, "insert into team_members (email, role, status) values ('pal@evil.test', 'owner', 'invited')")) <= 0);
  assert.ok((await changed(d, inv, "update team_members set status = 'revoked' where email = 'hello@forecourt.me'")) <= 0);
  assert.equal((await row(d, inv.email)).status, "invited");
  // They can see their own row only.
  assert.deepEqual((await as(d, inv, "select email, status from team_members")).rows, [{ email: inv.email, status: "invited" }]);
  // Staff-only data stays shut.
  assert.equal((await as(d, inv, "select count(*)::int as n from tenants")).rows[0].n, 0);
});

test("an owner can invite, change roles and revoke, but cannot switch access on or touch hello@", async () => {
  const d = await db();
  const boss = U.owner2;
  assert.equal(await changed(d, boss, "insert into team_members (email, role, status, invited_at) values ('new@forecourt.me', 'operator', 'invited', '2000-01-01')"), 1);
  const fresh = await row(d, "new@forecourt.me");
  assert.ok(Date.now() - new Date(fresh.invited_at).getTime() < 60_000, "invited_at comes from the database clock, not the request");
  assert.equal(await changed(d, boss, "update team_members set role = 'owner' where email = $1", [U.operator.email]), 1);
  assert.equal(await changed(d, boss, "update team_members set status = 'revoked' where email = $1", [U.operator.email]), 1);
  // Nobody signed in can make a row active: not a new one, not a revoked one, not an invite.
  assert.equal(await changed(d, boss, "insert into team_members (email, role, status) values ('x@forecourt.me', 'owner', 'active')"), -1);
  assert.equal(await changed(d, boss, "update team_members set status = 'active' where email = $1", [U.operator.email]), -1);
  assert.equal(await changed(d, boss, "update team_members set status = 'active' where email = $1", [U.invited.email]), -1);
  // Restoring is a fresh invite with a new invited_at.
  assert.equal(await changed(d, boss, "update team_members set status = 'invited' where email = $1", [U.operator.email]), 1);
  assert.ok((await row(d, U.operator.email)).invited_at);
  // hello@ is only changed in the SQL editor.
  assert.equal(await changed(d, boss, "update team_members set status = 'revoked' where email = 'hello@forecourt.me'"), -1);
  assert.equal(await changed(d, boss, "update team_members set role = 'operator' where email = 'hello@forecourt.me'"), -1);
  assert.equal(await changed(d, boss, "delete from team_members where email = 'hello@forecourt.me'"), -1);
  assert.equal(await changed(d, boss, "update team_members set name = 'Matt' where email = 'hello@forecourt.me'"), 1, "non-access fields are fine");
  assert.equal(await changed(d, boss, "insert into team_emails (email) values ('new@forecourt.me')"), 1);
});

test("accepting an invite needs mailbox proof dated after the invite", async () => {
  const d = await db();
  const inv = U.invited;
  await d.exec(`update team_members set invited_at = now() - interval '1 hour' where email = '${inv.email}'`);
  const since = Math.floor(new Date((await row(d, inv.email)).invited_at).getTime() / 1000);
  const accept = async (amr, who = inv) => (await as(d, who, "select public.accept_team_invite() as ok", [], amr)).rows[0].ok;
  // A password sign-in proves nothing about the mailbox.
  assert.equal(await accept([{ method: "password", timestamp: now() }]), false);
  // An email code from BEFORE the invite (for example a stranger who pre-registered the address) is not enough.
  assert.equal(await accept([{ method: "otp", timestamp: since - 60 }]), false);
  // No amr at all, or junk.
  assert.equal(await accept(null), false);
  assert.equal(await accept([{ method: "otp", timestamp: "soon" }]), false);
  // A token whose email is not this user's sign-in address.
  assert.equal(await accept([{ method: "otp", timestamp: now() }], { id: U.stranger.id, email: inv.email }), false);
  assert.equal((await row(d, inv.email)).status, "invited");
  assert.equal(await isTeam(d, inv), false);
  // An email code after the invite: accepted.
  assert.equal(await accept([{ method: "password", timestamp: now() }, { method: "otp", timestamp: now() }]), true);
  const r = await row(d, inv.email);
  assert.equal(r.status, "active");
  assert.ok(r.accepted_at);
  assert.equal(await isTeam(d, inv), true);
  assert.equal(await isOwner(d, inv), true, "the role on the invite");
  // Accepting twice, or with no invite, does nothing.
  assert.equal(await accept([{ method: "otp", timestamp: now() }]), false);
  assert.equal(await accept([{ method: "magiclink", timestamp: now() }], U.dealer), false);
  // A revoked person cannot accept their way back in.
  await d.exec(`update team_members set status = 'revoked' where email = '${U.operator.email}'`);
  assert.equal(await accept([{ method: "otp", timestamp: now() }], U.operator), false);
  // anon cannot call it at all.
  await d.exec("set role anon");
  await assert.rejects(d.query("select public.accept_team_invite()"));
  await d.exec("reset role");
});

test("re-running portal.sql or staff.sql never brings back a revoked stranger with a team_emails row", async () => {
  const d = await db();
  await d.exec(`
    insert into team_members (email, role, status) values ('${U.stranger.email}', 'owner', 'revoked');
    insert into team_emails (email) values ('${U.stranger.email}');
  `);
  for (const f of ["portal.sql", "staff.sql", "portal.sql"]) {
    await d.exec(read(f));
    assert.equal(await isTeam(d, U.stranger), false, f);
    assert.equal((await row(d, U.stranger.email)).status, "revoked", f);
  }
  // Even with nobody active (the first-run fallback), a revoked or invited row beats team_emails.
  await d.exec("update team_members set status = 'revoked' where status = 'active' and email <> 'hello@forecourt.me'");
  await d.exec("delete from team_members where email = 'hello@forecourt.me'");
  assert.equal(await isTeam(d, U.stranger), false);
  assert.equal(await isTeam(d, U.invited), false);
  // A deleted row is not recreated from team_emails by staff.sql any more.
  await d.exec(`delete from team_members where email = '${U.stranger.email}'`);
  await d.exec(read("staff.sql"));
  assert.equal(await row(d, U.stranger.email), undefined);
  assert.equal((await row(d, U.hello.email)).status, "active", "staff.sql seeds hello@ when it has no row");
  // portal.sql and staff.sql refuse to run without team-owner-only.sql.
  const bare = new PGlite();
  await bare.exec(STUB);
  for (const f of ["control-plane.sql", "billing.sql"]) await bare.exec(read(f));
  await assert.rejects(bare.exec(read("portal.sql")), /team-owner-only\.sql first/);
});

test("a revoked hello@ stays revoked: staff.sql re-run and the app's owner seed leave it alone", async () => {
  const d = await db();
  await d.exec("update team_members set status = 'revoked' where email = 'hello@forecourt.me'");
  await d.exec(read("staff.sql"));
  await d.exec(read("team-owner-only.sql"));
  // The app's seed (service role): insert, never overwrite.
  await d.exec("set role service_role");
  await d.exec("insert into team_members (email, name, role, status) values ('hello@forecourt.me', 'Matt Girvan', 'owner', 'active') on conflict (email) do nothing");
  await d.exec("reset role");
  assert.equal((await row(d, U.hello.email)).status, "revoked");
  assert.equal(await isTeam(d, U.hello), false);
  assert.equal(await isOwner(d, U.hello), false);
  // hello@ can still read its own (revoked) row, so the app sees why.
  assert.deepEqual((await as(d, U.hello, "select status from team_members")).rows, [{ status: "revoked" }]);
  // The lockout fix in the README brings it back.
  await d.exec("update team_members set status = 'active' where email = 'hello@forecourt.me'");
  assert.equal(await isOwner(d, U.hello), true);
});

test("every staff policy is wrapped as (select is_team()) and the functions pin search_path", async () => {
  const d = await db();
  const pols = (await d.query("select tablename, policyname, cmd, coalesce(qual, '') as q, coalesce(with_check, '') as w from pg_policies where schemaname = 'public'")).rows;
  const unwrapped = (s) => s.replace(/\(\s*SELECT\s+(public\.)?is_team(_owner)?\(\)\s+AS\s+is_team(_owner)?\s*\)/gi, "").match(/is_team(_owner)?\(\)/);
  const staff = pols.filter((p) => /is_team/.test(p.q + p.w));
  assert.ok(staff.length >= 14, `found ${staff.length} staff policies`);
  for (const p of staff) assert.equal(unwrapped(p.q + " " + p.w), null, `${p.tablename} / ${p.policyname}: ${p.q} ${p.w}`);
  // Only owners write team_members and team_emails.
  const writes = pols.filter((p) => ["team_members", "team_emails"].includes(p.tablename) && p.cmd !== "SELECT");
  assert.equal(writes.length, 6);
  for (const p of writes) assert.match(p.q + p.w, /is_team_owner/, p.policyname);
  assert.equal(pols.filter((p) => /team write/.test(p.policyname)).length, 0);
  // The check file's section 6 (unwrapped policies) comes back empty.
  const check = read("team-owner-only.check.sql");
  const section6 = check.slice(check.indexOf("-- 6."));
  assert.equal((await d.query(section6.slice(section6.indexOf("select")))).rows.length, 0);
  for (const fn of ["is_team", "is_team_owner", "accept_team_invite"]) {
    const { rows } = await d.query("select proconfig from pg_proc where proname = $1", [fn]);
    assert.deepEqual(rows[0].proconfig, ['search_path=""'], fn);
  }
});

test("only team-owner-only.sql and the hotfix define is_team(), and their copies are identical", () => {
  const body = (f) => {
    const t = read(f);
    const start = t.indexOf("create or replace function public.is_team()");
    assert.ok(start >= 0, f);
    return t.slice(start, t.indexOf("$$;", t.indexOf("as $$", start)) + 3);
  };
  assert.equal(body("team-domain-hotfix.sql"), body("team-owner-only.sql"));
  for (const f of ["portal.sql", "staff.sql", "build.sql", "email-log.sql", "enquiries.sql"]) {
    assert.doesNotMatch(read(f), /create or replace function (public\.)?is_team/i, f);
    assert.doesNotMatch(read(f), /like '%@forecourt\.me'/, f);
  }
  assert.doesNotMatch(read("staff.sql"), /from team_emails\s*\n?\s*on conflict/, "staff.sql no longer copies team_emails into team_members");
});

test("the check file runs read-only, and the rollback goes back to #41", async () => {
  const d = await db();
  const before = (await d.query("select count(*)::int as n from team_members")).rows[0].n;
  await d.exec(read("team-owner-only.check.sql"));
  assert.equal((await d.query("select count(*)::int as n from team_members")).rows[0].n, before);
  await d.exec(read("team-owner-only.rollback.sql"));
  await d.exec(read("team-owner-only.rollback.sql"));
  assert.equal((await d.query("select to_regprocedure('public.is_team_owner()') as f")).rows[0].f, null);
  // #41's rule again: an invite counts, and any staff member can write the team.
  assert.equal(await isTeam(d, U.invited), true);
  assert.equal(await changed(d, U.operator, "update team_members set role = 'owner' where email = $1", [U.operator.email]), 1);
  // And it can be applied again on top.
  await d.exec(read("team-owner-only.sql"));
  assert.equal(await isTeam(d, U.invited), false);
});
