/**
 * supabase/signin-verified-guard.sql, run for real in PGlite on top of the
 * repo's Supabase SQL, main's team-domain-hotfix.sql (#41) and
 * team-owner-only.sql (#42).
 * - The guard only replaces #42's stand-in auth_email_verified() with the
 *   real check. It never defines is_team(), is_team_owner() or
 *   accept_team_invite(), and never touches the team_members or team_emails
 *   policies.
 * - Staff is #42's rule plus a proven email: never the email domain.
 * - Dealer policies need a proven email, in the guard and in the files that
 *   own them, so re-running any SQL file keeps the check on.
 * - Email code accounts keep access (including old identities with no
 *   email_verified key); an unverified Google identity spoils the account.
 * - accept_team_invite() refuses an unproven email, a Google-first hire and
 *   a passkey.
 * - The rollback puts the stand-in back and never drops it.
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
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, phone text, last_sign_in_at timestamptz, created_at timestamptz default now());
create table auth.sessions (id uuid primary key, user_id uuid not null);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users (id) on delete cascade, provider text not null, identity_data jsonb);
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, factor_type text not null, status text not null);
create table auth.webauthn_credentials (id uuid primary key default gen_random_uuid(), user_id uuid not null);
-- Stub only: every user gets one session whose id is the user id (session_id in the claims below).
create function auth.stub_session() returns trigger language plpgsql as $s$ begin insert into auth.sessions values (new.id, new.id) on conflict do nothing; return new; end $s$;
create trigger stub_session after insert on auth.users for each row execute function auth.stub_session();
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
`;

const ORDER = ["control-plane.sql", "billing.sql", "team-owner-only.sql", "portal.sql", "staff.sql", "build.sql", "archive.sql", "email-log.sql", "enquiries.sql"];
const PLACEHOLDER = " select true /* forecourt placeholder: signin-verified-guard.sql replaces this */ ";
const DEALER_POLICIES = [
  ["tenants", "own tenants"],
  ["orders", "own orders"],
  ["provision_steps", "own provision"],
  ["notes", "dealer customer notes"],
  ["notes", "dealer write customer notes"],
  ["messages", "dealer messages"],
  ["messages", "dealer send messages"],
  ["build_events", "dealer events"],
  ["build_events", "dealer write events"],
  ["meetings", "dealer meetings"],
];

const email = (addr, extra = {}) => ["email", { email: addr, ...extra }];
const google = (addr, verified) => ["google", { email: addr, email_verified: verified }];
let n = 0;
const id = () => `00000000-0000-0000-0000-${String(++n).padStart(12, "0")}`;
const U = {
  hello: { id: id(), email: "hello@forecourt.me", confirmed: true, ids: [email("hello@forecourt.me", { email_verified: true })] },
  stranger: { id: id(), email: "stranger@forecourt.me", confirmed: true, ids: [email("stranger@forecourt.me", { email_verified: true })] },
  active: { id: id(), email: "ops@forecourt.me", confirmed: true, ids: [email("ops@forecourt.me")] },
  invited: { id: id(), email: "new@forecourt.me", confirmed: true, ids: [email("new@forecourt.me")] },
  revoked: { id: id(), email: "gone@forecourt.me", confirmed: true, ids: [email("gone@forecourt.me")] },
  opsGoogleBad: { id: id(), email: "ops2@forecourt.me", confirmed: true, ids: [email("ops2@forecourt.me"), google("ops2@forecourt.me", false)] },
  otpOld: { id: id(), email: "old@dealer.test", confirmed: true, ids: [email("old@dealer.test")] },
  otpNew: { id: id(), email: "new@dealer.test", confirmed: false, ids: [email("new@dealer.test", { email_verified: true })] },
  googleOk: { id: id(), email: "g@gmail.test", confirmed: true, ids: [google("g@gmail.test", true)] },
  googleBad: { id: id(), email: "bad@dealer.test", confirmed: true, ids: [google("bad@dealer.test", false)] },
  linked: { id: id(), email: "victim@dealer.test", confirmed: true, ids: [email("victim@dealer.test", { email_verified: true }), google("victim@dealer.test", false)] },
  never: { id: id(), email: "never@dealer.test", confirmed: false, ids: [email("never@dealer.test", { email_verified: false })] },
};
const DEALERS = ["otpOld", "otpNew", "googleOk", "googleBad", "linked", "never"];
const UNPROVEN = ["opsGoogleBad", "googleBad", "linked", "never"];

async function db({ guard = true } = {}) {
  const d = new PGlite();
  await d.exec(STUB);
  // A new database in README order, then the live path: main's hotfix, then #42 again.
  for (const f of [...ORDER, "team-domain-hotfix.sql", "team-owner-only.sql"]) await d.exec(read(f));
  await d.exec(`
    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to anon, authenticated, service_role;
    grant usage, select on all sequences in schema public to anon, authenticated, service_role;
  `);
  for (const u of Object.values(U)) {
    await d.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, $3)", [u.id, u.email, u.confirmed ? new Date().toISOString() : null]);
    for (const [provider, data] of u.ids) {
      await d.query("insert into auth.identities (user_id, provider, identity_data) values ($1, $2, $3)", [u.id, provider, JSON.stringify(data)]);
    }
  }
  await d.exec(`
    insert into team_members (email, role, status) values
      ('ops@forecourt.me', 'operator', 'active'),
      ('new@forecourt.me', 'operator', 'invited'),
      ('ops2@forecourt.me', 'operator', 'active'),
      ('gone@forecourt.me', 'owner', 'revoked')
    on conflict (email) do update set status = excluded.status, role = excluded.role;
  `);
  for (const k of DEALERS) {
    const { rows } = await d.query("insert into tenants (user_id, slug, name) values ($1, $2, $3) returning id", [U[k].id, k.toLowerCase(), k]);
    await d.query("insert into messages (tenant_id, body) values ($1, 'hi')", [rows[0].id]);
  }
  if (guard) {
    // Safe to run more than once.
    await d.exec(read("signin-verified-guard.sql"));
    await d.exec(read("signin-verified-guard.sql"));
  }
  return d;
}

const now = () => Math.floor(Date.now() / 1000);
async function as(d, who, sql, amr = [{ method: "otp", timestamp: now() }]) {
  await d.exec("begin");
  try {
    const claims = who ? { sub: who.id, email: who.email, role: "authenticated", session_id: who.id, amr } : {};
    await d.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await d.exec(who ? "set local role authenticated" : "set local role anon");
    return (await d.query(sql)).rows;
  } finally {
    await d.exec("rollback");
  }
}
/** Like as(), but keeps the changes (for accept_team_invite). */
async function asCommit(d, who, sql, amr = [{ method: "otp", timestamp: now() + 5 }]) {
  const claims = { sub: who.id, email: who.email, role: "authenticated", session_id: who.id, amr };
  await d.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
  await d.exec("set role authenticated");
  try {
    return (await d.query(sql)).rows;
  } finally {
    await d.exec("reset role");
  }
}
const isTeam = async (d, who) => (await as(d, who, "select public.is_team() as t"))[0].t;
const isOwner = async (d, who) => (await as(d, who, "select public.is_team_owner() as t"))[0].t;
const count = async (d, who, table) => (await as(d, who, `select count(*)::int as c from public.${table}`))[0].c;
const guardBody = async (d) => (await d.query("select prosrc from pg_proc where oid = to_regprocedure('public.auth_email_verified()')")).rows[0]?.prosrc ?? null;
const lastSection = (f) => {
  const s = read(f);
  return s.slice(s.lastIndexOf("select 'auth_email_verified' as item,"));
};
const guardState = async (d) =>
  Object.fromEntries((await d.query(lastSection("signin-verified-guard.check.sql"))).rows.map((r) => [r.item, r.state]));
const teamPolicies = async (d) =>
  (await d.query("select tablename, policyname, cmd, qual, with_check from pg_policies where tablename in ('team_members', 'team_emails') order by 1, 2")).rows;
const dealerPolicies = async (d) =>
  (await d.query("select tablename, policyname, qual, with_check from pg_policies where policyname = any($1) order by 1, 2", [DEALER_POLICIES.map((p) => p[1])])).rows;
const fnSrc = async (d, name) => (await d.query(`select prosrc from pg_proc where oid = to_regprocedure('public.${name}()')`)).rows[0]?.prosrc ?? null;

test("guard: only replaces auth_email_verified(); never is_team(), is_team_owner(), accept_team_invite() or the team policies", async () => {
  const sql = read("signin-verified-guard.sql");
  assert.doesNotMatch(sql, /function\s+(public\.)?(is_team|is_team_owner|accept_team_invite|team_members_guard)\s*\(/i);
  assert.doesNotMatch(sql, /policy[^;]*\bon\s+(public\.)?(team_members|team_emails)\b/i);
  assert.doesNotMatch(sql, /forecourt placeholder/);
  assert.match(sql, /create or replace function public\.auth_email_verified\(\)/);
  const before = await db({ guard: false });
  const after = await db();
  for (const f of ["is_team", "is_team_owner", "accept_team_invite", "team_members_guard"]) {
    assert.equal(await fnSrc(after, f), await fnSrc(before, f), f);
  }
  assert.deepEqual(await teamPolicies(after), await teamPolicies(before));
  assert.equal(await guardBody(before), PLACEHOLDER);
  assert.match(await guardBody(after), /public\.email_verified_for\(auth\.uid\(\)\)/);
  assert.deepEqual(await guardState(before), { auth_email_verified: "placeholder (always yes)", is_team: "calls the guard, checks the session", is_team_owner: "calls the guard, checks the session" });
  assert.deepEqual(await guardState(after), { auth_email_verified: "real guard", is_team: "calls the guard, checks the session", is_team_owner: "calls the guard, checks the session" });
});

test("guard: staff is #42's rule plus a proven email, never the domain", async () => {
  const d = await db();
  assert.equal(await isTeam(d, U.hello), true);
  assert.equal(await isOwner(d, U.hello), true);
  assert.equal(await isTeam(d, U.active), true, "active, email code (old identity, no email_verified key)");
  assert.equal(await isTeam(d, U.invited), false, "an invite grants nothing until accepted (#42)");
  assert.equal(await isTeam(d, U.stranger), false, "a confirmed @forecourt.me address alone is not staff");
  assert.equal(await isTeam(d, U.revoked), false);
  assert.equal(await isTeam(d, U.opsGoogleBad), false, "an active member with an unverified Google identity is refused");
  assert.equal(await isTeam(d, U.otpOld), false);
  assert.equal(await isTeam(d, null), false);
  // With no active member, only an exact team_emails address with a proven email passes.
  await d.exec("update team_members set status = 'revoked' where status = 'active'");
  await d.exec("delete from team_members where email in ('hello@forecourt.me', 'ops2@forecourt.me', 'ops@forecourt.me')");
  await d.exec("insert into team_emails (email) values ('stranger@forecourt.me'), ('ops2@forecourt.me') on conflict do nothing");
  assert.equal(await isTeam(d, U.stranger), true, "exact team_emails address");
  assert.equal(await isTeam(d, U.opsGoogleBad), false, "the team_emails fallback also needs a proven email");
  await d.exec("delete from team_emails where email = 'stranger@forecourt.me'");
  assert.equal(await isTeam(d, U.stranger), false, "the domain alone, still no");
});

test("guard: same answer as #42's stand-in for every account with a proven email", async () => {
  const before = await db({ guard: false });
  const after = await db();
  for (const [k, u] of Object.entries(U)) {
    const proven = !UNPROVEN.includes(k);
    assert.equal(await isTeam(after, u), proven ? await isTeam(before, u) : false, `${k} is_team`);
    assert.equal(await isOwner(after, u), proven ? await isOwner(before, u) : false, `${k} is_team_owner`);
  }
});

test("guard: dealers need a proven email; email code accounts keep access", async () => {
  const d = await db();
  const expect = { otpOld: 1, otpNew: 1, googleOk: 1, googleBad: 0, linked: 0, never: 0 };
  for (const k of DEALERS) {
    assert.equal(await count(d, U[k], "tenants"), expect[k], `${k} tenants`);
    assert.equal(await count(d, U[k], "messages"), expect[k], `${k} messages`);
  }
  assert.equal(await count(d, U.hello, "tenants"), DEALERS.length, "staff see every tenant");
  assert.equal(await count(d, null, "tenants"), 0, "anon sees nothing");
  await assert.rejects(
    as(d, U.googleBad, `insert into public.tenants (user_id, slug, name) values ('${U.googleBad.id}', 'zz', 'zz')`),
    /row-level security/,
  );
  const ok = await as(d, U.otpOld, "insert into public.messages (tenant_id, body) select id, 'yo' from public.tenants limit 1 returning id");
  assert.equal(ok.length, 1);
});

test("dealer policies: the guard copies them word for word, and every SQL file in any order keeps the check on", async () => {
  // Word for word: each statement in the guard is the one in the file that owns it.
  const guard = read("signin-verified-guard.sql");
  const stmt = (src, name) => {
    const a = src.indexOf(`drop policy if exists "${name}" on `);
    return src.slice(a, src.indexOf(";", src.indexOf(`create policy "${name}" on `, a)) + 1);
  };
  const owner = { tenants: "control-plane.sql", orders: "control-plane.sql", provision_steps: "control-plane.sql", notes: "portal.sql", messages: "portal.sql", build_events: "build.sql", meetings: "build.sql" };
  for (const [table, name] of DEALER_POLICIES) {
    const own = stmt(read(owner[table]), name);
    assert.match(own, /\(select public\.auth_email_verified\(\)\)/, `${owner[table]}: ${name}`);
    assert.equal(stmt(guard, name), own, name);
  }
  const d = await db();
  const real = await guardBody(d);
  const pol = await dealerPolicies(d);
  assert.equal(pol.length, DEALER_POLICIES.length);
  for (const p of pol) assert.match(`${p.qual ?? ""} ${p.with_check ?? ""}`, /auth_email_verified/, p.policyname);
  const all = [...ORDER, "team-domain-hotfix.sql"];
  for (const files of [all, [...all].reverse(), ["build.sql", "portal.sql", "control-plane.sql", "team-owner-only.sql"]]) {
    for (const f of files) await d.exec(read(f));
    assert.equal(await guardBody(d), real, files.join(", "));
    assert.deepEqual(await dealerPolicies(d), pol, files.join(", "));
    assert.equal(await count(d, U.linked, "tenants"), 0, files.join(", "));
    assert.equal(await count(d, U.otpOld, "tenants"), 1, files.join(", "));
    assert.equal(await isTeam(d, U.opsGoogleBad), false, files.join(", "));
    assert.equal((await guardState(d)).auth_email_verified, "real guard");
  }
});

test("dealer files carry #42's create-if-missing stand-in, word for word, before first use", async () => {
  const block = (f) => {
    const s = read(f);
    const a = s.indexOf("do $$\nbegin\n  if to_regprocedure('public.auth_email_verified()')");
    assert.ok(a >= 0, f);
    return { at: a, text: s.slice(a, s.indexOf("end;\n$$;", a)) };
  };
  const ref = block("team-owner-only.sql").text;
  for (const f of ["control-plane.sql", "portal.sql", "build.sql"]) {
    const s = read(f);
    const b = block(f);
    assert.equal(b.text, ref, f);
    assert.ok(b.at < s.indexOf("auth_email_verified())"), `${f}: the stand-in comes before its first use`);
    assert.doesNotMatch(s, /create or replace function (public\.)?auth_email_verified/i, `${f} never replaces the guard`);
  }
  // A brand-new database: control-plane.sql runs first and still works.
  const d = new PGlite();
  await d.exec(STUB);
  await d.exec(read("control-plane.sql"));
  assert.equal(await guardBody(d), PLACEHOLDER);
});

test("accept_team_invite with the guard: unproven email, Google-first hire and passkey are refused; an email code accepts", async () => {
  const d = await db();
  const accept = async (who) => (await asCommit(d, who, "select public.accept_team_invite() as ok"))[0].ok;
  const status = async (addr) => (await d.query("select status from team_members where email = $1", [addr])).rows[0].status;
  // Not proven: never confirmed.
  await d.exec(`update auth.users set email_confirmed_at = null where id = '${U.invited.id}'`);
  assert.equal(await accept(U.invited), false, "unproven email");
  await d.exec(`update auth.users set email_confirmed_at = now() where id = '${U.invited.id}'`);
  // A passkey on the account.
  await d.exec(`insert into auth.webauthn_credentials (user_id) values ('${U.invited.id}')`);
  assert.equal(await accept(U.invited), false, "passkey");
  await d.exec(`delete from auth.webauthn_credentials where user_id = '${U.invited.id}'`);
  // Google added first (verified, so the guard itself says yes): #42 still refuses.
  await d.query("insert into auth.identities (user_id, provider, identity_data) values ($1, 'google', $2)", [U.invited.id, JSON.stringify({ email: U.invited.email, email_verified: true })]);
  assert.deepEqual(await as(d, U.invited, "select public.auth_email_verified() as v"), [{ v: true }]);
  assert.equal(await accept(U.invited), false, "Google-first hire");
  assert.equal(await status(U.invited.email), "invited");
  await d.query("delete from auth.identities where user_id = $1 and provider = 'google'", [U.invited.id]);
  // Email code only: accepted.
  assert.equal(await accept(U.invited), true);
  assert.equal(await status(U.invited.email), "active");
  // Then they add Google (verified) on the Account page: still staff.
  await d.query("insert into auth.identities (user_id, provider, identity_data) values ($1, 'google', $2)", [U.invited.id, JSON.stringify({ email: U.invited.email, email_verified: true })]);
  assert.equal(await isTeam(d, U.invited), true);
});

test("guard: nobody can ask about another user's account", async () => {
  const d = await db();
  await assert.rejects(as(d, U.googleBad, `select public.email_verified_for('${U.otpOld.id}')`), /permission denied/);
  assert.deepEqual(await as(d, U.otpOld, "select public.auth_email_verified() as v"), [{ v: true }]);
  assert.deepEqual(await as(d, U.linked, "select public.auth_email_verified() as v"), [{ v: false }]);
});

test("check.sql is read only, lists exactly the accounts the guard refuses, and shows which check is on", async () => {
  const d = await db({ guard: false });
  const [list] = read("signin-verified-guard.check.sql").split(/;\s*\n/).filter((s) => s.replace(/--.*$/gm, "").trim());
  const rows = (await d.query(list)).rows;
  assert.deepEqual(rows.map((r) => r.email).sort(), ["bad@dealer.test", "never@dealer.test", "ops2@forecourt.me", "victim@dealer.test"]);
  assert.equal(rows.find((r) => r.email === "ops2@forecourt.me").is_staff, true);
  assert.doesNotMatch(read("signin-verified-guard.check.sql").replace(/--.*$/gm, ""), /\b(insert|update|delete|drop|create|alter|grant|revoke)\b/i);
  // The last section is #42's check section 7, word for word.
  assert.equal(lastSection("signin-verified-guard.check.sql").trim(), lastSection("team-owner-only.check.sql").trim());
});

test("rollback puts the stand-in back word for word, never drops it, and leaves everything else alone", async () => {
  const d = await db();
  const fnsBefore = {};
  for (const f of ["is_team", "is_team_owner", "accept_team_invite"]) fnsBefore[f] = await fnSrc(d, f);
  const polBefore = await dealerPolicies(d);
  const teamBefore = await teamPolicies(d);
  await d.exec(read("signin-verified-guard.rollback.sql"));
  await d.exec(read("signin-verified-guard.rollback.sql"));
  assert.equal(await guardBody(d), PLACEHOLDER);
  assert.equal((await guardState(d)).auth_email_verified, "placeholder (always yes)");
  for (const f of Object.keys(fnsBefore)) assert.equal(await fnSrc(d, f), fnsBefore[f], f);
  assert.deepEqual(await dealerPolicies(d), polBefore);
  assert.deepEqual(await teamPolicies(d), teamBefore);
  const left = (await d.query("select proname from pg_proc where proname in ('auth_email_verified', 'email_verified_for') order by 1")).rows;
  assert.deepEqual(left, [{ proname: "auth_email_verified" }]);
  assert.doesNotMatch(read("signin-verified-guard.rollback.sql").replace(/--.*$/gm, ""), /drop function[^;]*auth_email_verified/i);
  // Back to #42's stand-in answers, never the domain.
  const ref = await db({ guard: false });
  for (const [k, u] of Object.entries(U)) assert.equal(await isTeam(d, u), await isTeam(ref, u), k);
  assert.equal(await isTeam(d, U.stranger), false, "domain still not trusted after rollback");
  for (const k of DEALERS) assert.equal(await count(d, U[k], "tenants"), 1, k);
  // And the guard can go back on afterwards.
  await d.exec(read("signin-verified-guard.sql"));
  assert.equal((await guardState(d)).auth_email_verified, "real guard");
  assert.equal(await count(d, U.linked, "tenants"), 0);
});
