/**
 * supabase/team-domain-hotfix.sql, run for real in PGlite on top of the repo's
 * Supabase SQL. is_team() must never trust the @forecourt.me domain: only a
 * team_members row (active or invited, never revoked), a confirmed
 * hello@forecourt.me, or the exact-address first-run fallback.
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
  stranger: { id: "00000000-0000-0000-0000-000000000002", email: "stranger@forecourt.me" },
  invited: { id: "00000000-0000-0000-0000-000000000003", email: "ops@forecourt.me" },
  revoked: { id: "00000000-0000-0000-0000-000000000004", email: "gone@forecourt.me" },
  dealer: { id: "00000000-0000-0000-0000-000000000005", email: "sam@dealer.test" },
};

async function db({ hotfix = true, helloConfirmed = true } = {}) {
  const d = new PGlite();
  await d.exec(STUB);
  for (const f of ["control-plane.sql", "billing.sql", "portal.sql", "staff.sql", "build.sql", "archive.sql"]) await d.exec(read(f));
  if (hotfix) {
    // Safe to run more than once.
    await d.exec(read("team-domain-hotfix.sql"));
    await d.exec(read("team-domain-hotfix.sql"));
  }
  await d.exec(`
    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to anon, authenticated, service_role;
    insert into auth.users values
      ('${U.hello.id}', '${U.hello.email}', ${helloConfirmed ? "now()" : "null"}),
      ('${U.stranger.id}', '${U.stranger.email}', now()),
      ('${U.invited.id}', '${U.invited.email}', now()),
      ('${U.revoked.id}', '${U.revoked.email}', now()),
      ('${U.dealer.id}', '${U.dealer.email}', now());
    insert into team_members (email, role, status) values
      ('${U.invited.email}', 'operator', 'invited'),
      ('${U.revoked.email}', 'owner', 'revoked')
    on conflict (email) do update set status = excluded.status, role = excluded.role;
  `);
  return d;
}

async function isTeam(d, who) {
  await d.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: who.id, email: who.email, role: "authenticated" })]);
  await d.exec("set role authenticated");
  try {
    return (await d.query("select is_team() as t")).rows[0].t;
  } finally {
    await d.exec("reset role");
    await d.query("select set_config('request.jwt.claims', '', false)");
  }
}

test("hotfix: a fresh @forecourt.me signup is not staff; invited is, revoked is not", async () => {
  const d = await db();
  assert.equal(await isTeam(d, U.stranger), false);
  assert.equal(await isTeam(d, U.invited), true);
  assert.equal(await isTeam(d, U.revoked), false);
  assert.equal(await isTeam(d, U.dealer), false);
  assert.equal(await isTeam(d, U.hello), true);
  // A stranger cannot read or write team_members through RLS.
  await d.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: U.stranger.id, email: U.stranger.email, role: "authenticated" })]);
  await d.exec("set role authenticated");
  const seen = (await d.query("select email from team_members")).rows;
  await d.exec("reset role");
  assert.deepEqual(seen, []);
});

test("hotfix: hello@forecourt.me needs a confirmed email, with or without its owner row", async () => {
  const d = await db({ helloConfirmed: false });
  // Not with its seeded owner row (staff.sql), nor without it (the team_emails fallback).
  assert.equal(await isTeam(d, U.hello), false);
  await d.exec("delete from team_members where email = 'hello@forecourt.me'");
  assert.equal(await isTeam(d, U.hello), false);
  await d.exec(`update auth.users set email_confirmed_at = now() where id = '${U.hello.id}'`);
  assert.equal(await isTeam(d, U.hello), true);
  // A token claiming hello@ for a different user id is not enough.
  assert.equal(await isTeam(d, { id: U.stranger.id, email: U.hello.email }), false);
});

test("hotfix: with no active member, only an exact team_emails address passes, never the domain", async () => {
  const d = await db();
  await d.exec("update team_members set status = 'invited' where status = 'active'");
  await d.exec("delete from team_members where email = 'ops@forecourt.me'");
  await d.exec("insert into team_emails (email) values ('listed@forecourt.me') on conflict do nothing");
  assert.equal(await isTeam(d, { id: "00000000-0000-0000-0000-000000000009", email: "listed@forecourt.me" }), true);
  assert.equal(await isTeam(d, U.stranger), false);
});

test("before the hotfix (the rollback) the domain was trusted with no active member; the hotfix and staff.sql both close it", async () => {
  const d = await db({ hotfix: false });
  await d.exec(read("team-domain-hotfix.rollback.sql"));
  await d.exec("update team_members set status = 'invited' where status = 'active'");
  assert.equal(await isTeam(d, U.stranger), true, "rollback restores the old rule");
  await d.exec(read("team-domain-hotfix.sql"));
  assert.equal(await isTeam(d, U.stranger), false);
  // staff.sql alone (a re-run) also has no domain rule.
  const fresh = await db({ hotfix: false });
  await fresh.exec("update team_members set status = 'invited' where status = 'active'");
  assert.equal(await isTeam(fresh, U.stranger), false);
  for (const f of ["team-domain-hotfix.sql", "staff.sql", "portal.sql"]) {
    assert.doesNotMatch(read(f), /like '%@forecourt\.me'/, f);
  }
});
