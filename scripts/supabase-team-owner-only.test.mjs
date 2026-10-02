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
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, phone text);
create table auth.sessions (id uuid primary key, user_id uuid not null);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null, provider text not null);
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, factor_type text not null, status text not null);
-- Stub only: every user gets one session whose id is the user id (session_id in the claims below).
create function auth.stub_session() returns trigger language plpgsql as $s$ begin insert into auth.sessions values (new.id, new.id) on conflict do nothing; return new; end $s$;
create trigger stub_session after insert on auth.users for each row execute function auth.stub_session();
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
  const claims = { sub: who.id, email: who.email, role: "authenticated", amr, session_id: who.id };
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

test("nobody signed in can rename a row's email, not even an owner, and nobody can become hello@", async () => {
  const d = await db();
  const boss = U.owner2;
  // Renaming an active row would hand the new address access with no invite.
  assert.equal(await changed(d, boss, "update team_members set email = 'mate@evil.test' where email = $1", [U.operator.email]), -1);
  assert.equal(await changed(d, boss, "update team_members set email = 'mate@evil.test' where email = $1", [U.invited.email]), -1);
  assert.ok((await changed(d, U.operator, "update team_members set email = 'mate@evil.test' where email = $1", [U.operator.email])) <= 0, "operator: RLS or the trigger");
  assert.equal(await row(d, "mate@evil.test"), undefined);
  assert.equal((await row(d, U.operator.email)).status, "active");
  // Not to hello@ either, even when hello@ has no row; and no signed-in insert of hello@.
  await d.exec("delete from team_members where email = 'hello@forecourt.me'");
  assert.equal(await changed(d, boss, "update team_members set email = 'hello@forecourt.me' where email = $1", [U.operator.email]), -1);
  assert.equal(await changed(d, boss, "insert into team_members (email, role, status) values ('hello@forecourt.me', 'operator', 'invited')"), -1);
  assert.equal(await row(d, U.hello.email), undefined);
  // Same case, different spelling, is not a rename.
  assert.equal(await changed(d, boss, "update team_members set email = 'OPS@forecourt.me', name = 'Ops' where email = $1", [U.operator.email]), 1);
  // The SQL editor (postgres) can still fix an address by hand.
  await d.exec(`update team_members set email = 'ops2@forecourt.me' where email = '${U.operator.email}'`);
  assert.equal((await row(d, "ops2@forecourt.me")).status, "active");
});

test("an account with a phone number cannot accept: an SMS code is also amr otp", async () => {
  const d = await db();
  await d.exec(`update team_members set invited_at = now() - interval '1 hour' where email = '${U.invited.email}'`);
  await d.exec(`update auth.users set phone = '447700900123' where id = '${U.invited.id}'`);
  const accept = async () => (await as(d, U.invited, "select public.accept_team_invite() as ok", [], [{ method: "otp", timestamp: now() }])).rows[0].ok;
  assert.equal(await accept(), false);
  assert.equal((await row(d, U.invited.email)).status, "invited");
  await d.exec(`update auth.users set phone = '' where id = '${U.invited.id}'`);
  assert.equal(await accept(), true);
});

test("an account with Google, a phone identity or a verified authenticator cannot accept", async () => {
  const d = await db();
  await d.exec(`update team_members set invited_at = now() - interval '1 hour' where email = '${U.invited.email}'`);
  const accept = async () => (await as(d, U.invited, "select public.accept_team_invite() as ok", [], [{ method: "otp", timestamp: now() }])).rows[0].ok;
  await d.exec(`insert into auth.identities (user_id, provider) values ('${U.invited.id}', 'email')`);
  for (const provider of ["google", "phone"]) {
    await d.exec(`insert into auth.identities (user_id, provider) values ('${U.invited.id}', '${provider}')`);
    assert.equal(await accept(), false, provider);
    assert.equal((await row(d, U.invited.email)).status, "invited");
    await d.exec(`delete from auth.identities where provider = '${provider}'`);
  }
  await d.exec(`insert into auth.mfa_factors (user_id, factor_type, status) values ('${U.invited.id}', 'totp', 'verified')`);
  assert.equal(await accept(), false, "verified factor");
  await d.exec("update auth.mfa_factors set status = 'unverified'");
  // Someone else's Google link does not block this account; an unfinished factor does not either.
  await d.exec(`insert into auth.identities (user_id, provider) values ('${U.stranger.id}', 'google')`);
  assert.equal(await accept(), true);
  assert.equal((await row(d, U.invited.email)).status, "active");
});

test("a passkey in auth.webauthn_credentials blocks accepting; without that table the check is skipped", async () => {
  // Without the table (older Auth versions): accepting works as before.
  const plain = await db();
  await plain.exec(`update team_members set invited_at = now() - interval '1 hour' where email = '${U.invited.email}'`);
  assert.equal((await plain.query("select to_regclass('auth.webauthn_credentials') as t")).rows[0].t, null);
  assert.equal((await as(plain, U.invited, "select public.accept_team_invite() as ok", [], [{ method: "otp", timestamp: now() }])).rows[0].ok, true);
  // With the table, as Supabase Auth creates it.
  const d = await db();
  await d.exec("create table auth.webauthn_credentials (id uuid primary key default gen_random_uuid(), user_id uuid not null, credential_id bytea not null default ''::bytea)");
  await d.exec(`update team_members set invited_at = now() - interval '1 hour' where email = '${U.invited.email}'`);
  const accept = async () => (await as(d, U.invited, "select public.accept_team_invite() as ok", [], [{ method: "otp", timestamp: now() }])).rows[0].ok;
  await d.exec(`insert into auth.webauthn_credentials (user_id) values ('${U.invited.id}')`);
  assert.equal(await accept(), false, "own passkey present");
  assert.equal((await row(d, U.invited.email)).status, "invited");
  await d.exec(`delete from auth.webauthn_credentials; insert into auth.webauthn_credentials (user_id) values ('${U.stranger.id}')`);
  assert.equal(await accept(), true, "someone else's passkey does not count");
});

test("accepting needs the sign-in guard: a no-op with the stand-in, refused by a real guard that says no", async () => {
  const d = await db();
  await d.exec(`update team_members set invited_at = now() - interval '1 hour' where email = '${U.invited.email}'`);
  await d.exec(REAL_GUARD);
  await d.exec(`update auth.users set email_confirmed_at = null where id = '${U.invited.id}'`);
  const accept = async () => (await as(d, U.invited, "select public.accept_team_invite() as ok", [], [{ method: "otp", timestamp: now() }])).rows[0].ok;
  assert.equal(await accept(), false, "real guard says no");
  assert.equal((await row(d, U.invited.email)).status, "invited");
  await d.exec(`update auth.users set email_confirmed_at = now() where id = '${U.invited.id}'`);
  assert.equal(await accept(), true, "real guard says yes");
  const src = read("team-owner-only.sql");
  const body = src.slice(src.indexOf("create or replace function public.accept_team_invite()"));
  assert.ok(body.indexOf("if not public.auth_email_verified() then") < body.indexOf("select t.invited_at into since"));
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
  const section6 = check.slice(check.indexOf("-- 6."), check.indexOf("-- 7."));
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

test("the Confirm signup email carries the code and a type=signup link, like the magic link one", () => {
  const signup = read("confirm-signup.html");
  assert.match(signup, /\{\{ \.Token \}\}/);
  assert.match(signup, /token_hash=\{\{ \.TokenHash \}\}&type=signup/);
  assert.equal(signup.replace("type=signup", "type=email"), read("magic-link.html"));
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

/** The check file's section 7, as { item: state }. */
const guardState = async (d) => {
  const check = read("team-owner-only.check.sql");
  const s7 = check.slice(check.indexOf("-- 7."));
  const { rows } = await d.query(s7.slice(s7.indexOf("select")));
  return Object.fromEntries(rows.map((r) => [r.item, r.state]));
};
const GUARDED = { auth_email_verified: "placeholder (always yes)", is_team: "calls the guard, checks the session", is_team_owner: "calls the guard, checks the session" };
/** Stands in for #38's signin-verified-guard.sql: confirmed email only. */
const REAL_GUARD = `create or replace function public.auth_email_verified() returns boolean language sql stable security definer set search_path = ''
  as $$ select auth.uid() is not null and exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null) /* simulated real guard */ $$;`;
const DEALER_POLICIES = ["own tenants", "own orders", "own provision", "dealer customer notes", "dealer write customer notes", "dealer messages", "dealer send messages", "dealer events", "dealer write events", "dealer meetings"];
const guardBody = async (d) => (await d.query("select prosrc from pg_proc where oid = to_regprocedure('public.auth_email_verified()')")).rows[0]?.prosrc ?? null;

test("a signed-out session loses staff access at once, not when its token expires", async () => {
  const d = await db();
  assert.equal(await isTeam(d, U.operator), true);
  assert.equal(await isOwner(d, U.owner2), true);
  // Supabase deletes the session row on sign-out (including "sign out other sessions").
  await d.exec(`delete from auth.sessions where user_id in ('${U.operator.id}', '${U.owner2.id}')`);
  assert.equal(await isTeam(d, U.operator), false, "the old token no longer works against the database");
  assert.equal(await isOwner(d, U.owner2), false);
  assert.equal((await as(d, U.operator, "select count(*)::int as n from team_members")).rows[0].n, 1, "only their own row, like any signed-in user");
  // Someone else's live session id in the token does not count.
  const borrowed = { ...U.operator };
  await d.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: U.operator.id, email: U.operator.email, role: "authenticated", session_id: U.hello.id })]);
  await d.exec("set role authenticated");
  assert.equal((await d.query("select public.is_team() as t")).rows[0].t, false);
  // No session_id claim at all (an old or hand-made token): not staff.
  await d.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: U.hello.id, email: U.hello.email, role: "authenticated" })]);
  assert.equal((await d.query("select public.is_team() as t, public.is_team_owner() as o")).rows[0].t, false);
  await d.exec("reset role");
  // A new sign-in makes a new session: access is back.
  await d.exec(`insert into auth.sessions values ('${borrowed.id}', '${borrowed.id}')`);
  assert.equal(await isTeam(d, U.operator), true);
  // Policies still call (select public.is_team()), worked out once per query.
  const pol = (await d.query("select qual from pg_policies where tablename = 'tenants' and policyname = 'team tenants'")).rows[0].qual;
  assert.match(pol, /SELECT (public\.)?is_team\(\)/);
});

test("the guard stand-in: created only if missing, before is_team(), in both files, and reported by the check", async () => {
  const d = await db();
  assert.deepEqual(await guardState(d), GUARDED);
  assert.match(await guardBody(d), /^\s*select true \/\* forecourt placeholder/);
  for (const f of ["team-owner-only.sql", "team-domain-hotfix.sql"]) {
    const sql = read(f);
    const block = sql.indexOf("if to_regprocedure('public.auth_email_verified()') is null then");
    assert.ok(block > 0, f);
    assert.ok(block < sql.indexOf("create or replace function public.is_team()"), `${f}: the stand-in comes before is_team()`);
    assert.doesNotMatch(sql, /create or replace function (public\.)?auth_email_verified/i, `${f} never replaces the guard`);
  }
  // Same block, word for word, in both files.
  const block = (f) => {
    const s = read(f);
    const a = s.indexOf("do $$\nbegin\n  if to_regprocedure('public.auth_email_verified()')");
    return s.slice(a, s.indexOf("end;\n$$;", a));
  };
  assert.equal(block("team-domain-hotfix.sql"), block("team-owner-only.sql"));
  // The dealer files (#38) carry the same block, before their first use of the guard.
  for (const f of ["control-plane.sql", "portal.sql", "build.sql"]) {
    const sql = read(f);
    assert.equal(block(f), block("team-owner-only.sql"), f);
    assert.ok(sql.indexOf("if to_regprocedure('public.auth_email_verified()') is null then") < sql.indexOf("(select public.auth_email_verified())"), `${f}: the stand-in comes first`);
    assert.doesNotMatch(sql, /create or replace function (public\.)?auth_email_verified/i, `${f} never replaces the guard`);
  }
  // Re-runs keep exactly one stand-in and change nothing.
  await d.exec(read("team-owner-only.sql"));
  await d.exec(read("team-domain-hotfix.sql"));
  assert.equal((await d.query("select count(*)::int as n from pg_proc where proname = 'auth_email_verified'")).rows[0].n, 1);
  assert.deepEqual(await guardState(d), GUARDED);
});

test("the real guard is never overwritten: every SQL file, in any order, after the guard", async () => {
  const d = await db();
  await d.exec(`update auth.users set email_confirmed_at = null where id = '${U.operator.id}'`);
  assert.equal(await isTeam(d, U.operator), true, "the stand-in says yes");
  await d.exec(REAL_GUARD);
  const real = await guardBody(d);
  assert.equal(await isTeam(d, U.operator), false, "the real guard bites");
  const all = [...ORDER, "team-domain-hotfix.sql"];
  for (const files of [all, [...all].reverse(), ["staff.sql", "team-domain-hotfix.sql", "portal.sql", "team-owner-only.sql", "build.sql"]]) {
    for (const f of files) await d.exec(read(f));
    assert.equal(await guardBody(d), real, files.join(", "));
    assert.equal(await isTeam(d, U.operator), false, files.join(", "));
    assert.equal(await isTeam(d, U.owner2), true, "confirmed staff still get in");
    assert.deepEqual(await guardState(d), { ...GUARDED, auth_email_verified: "real guard" });
    // Every dealer policy (#38) still needs the guard.
    const dealer = (await d.query("select policyname, qual, with_check from pg_policies where policyname = any($1)", [DEALER_POLICIES])).rows;
    assert.equal(dealer.length, DEALER_POLICIES.length, files.join(", "));
    for (const p of dealer) assert.match(`${p.qual ?? ""} ${p.with_check ?? ""}`, /auth_email_verified/, `${p.policyname}: ${files.join(", ")}`);
  }
  // The rollback keeps the real guard too, and its is_team() still calls it.
  await d.exec(read("team-owner-only.rollback.sql"));
  assert.equal(await guardBody(d), real);
  assert.equal(await isTeam(d, U.operator), false);
  assert.deepEqual(await guardState(d), {
    auth_email_verified: "real guard",
    is_team: "calls the guard, DOES NOT check the session",
    is_team_owner: "missing",
  });
  await d.exec(read("team-owner-only.sql"));
  assert.deepEqual(await guardState(d), { ...GUARDED, auth_email_verified: "real guard" });
});

test("the rollback never drops the stand-in, and puts it back if it went missing", async () => {
  const d = await db();
  await d.exec(read("team-owner-only.rollback.sql"));
  assert.match(await guardBody(d), /forecourt placeholder/);
  assert.match(read("team-owner-only.rollback.sql"), /if to_regprocedure\('public\.auth_email_verified\(\)'\) is null then/);
  assert.doesNotMatch(read("team-owner-only.rollback.sql"), /drop function[^;]*auth_email_verified/i);
  // Since #38 the dealer policies use it, so Postgres refuses a plain drop.
  await assert.rejects(d.exec("drop function public.auth_email_verified()"), /other objects depend on it/);
  // Dropped by hand with cascade (which also removes those dealer policies):
  // every staff check errors until it is back.
  await d.exec("drop function public.auth_email_verified() cascade");
  await assert.rejects(isTeam(d, U.operator), /auth_email_verified/);
  assert.equal((await guardState(d)).auth_email_verified, "missing");
  await d.exec(read("team-owner-only.rollback.sql"));
  assert.equal(await isTeam(d, U.operator), true);
  await d.exec("drop function public.auth_email_verified() cascade");
  await d.exec(read("team-owner-only.sql"));
  assert.deepEqual(await guardState(d), GUARDED);
});

test("the check shows when an old copy (like #41's original hotfix) stripped the guard", async () => {
  const d = await db();
  // #41's original is_team(): no guard call, no session check.
  await d.exec(read("team-owner-only.rollback.sql").replace("public.auth_email_verified()\n    and (select email from me) <> ''", "(select email from me) <> ''"));
  assert.equal((await guardState(d)).is_team, "DOES NOT call the guard, DOES NOT check the session");
  await d.exec(read("team-domain-hotfix.sql"));
  assert.equal((await guardState(d)).is_team, GUARDED.is_team, "main's hotfix copy repairs it");
});

