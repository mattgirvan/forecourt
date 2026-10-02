/**
 * resolveActor (the office's one staff lookup) against the real Supabase SQL
 * in PGlite, not mocks: deps run as the signed-in user (RLS) or the service
 * role, the way staff-actor.ts does.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { resolveActor, type ActorDeps } from "./team-actor.ts";

const sql = (f: string) => readFileSync(new URL(`../../../supabase/${f}`, import.meta.url), "utf8");

const STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, phone text);
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
`;

type User = { id: string; email: string; email_confirmed_at: string | null };
const HELLO: User = { id: "00000000-0000-0000-0000-000000000001", email: "hello@forecourt.me", email_confirmed_at: "2026-01-01T00:00:00Z" };
const SALES: User = { id: "00000000-0000-0000-0000-000000000002", email: "sales@forecourt.me", email_confirmed_at: "2026-01-01T00:00:00Z" };

async function db() {
  const d = new PGlite();
  await d.exec(STUB);
  for (const f of ["control-plane.sql", "billing.sql", "team-owner-only.sql", "portal.sql", "staff.sql"]) await d.exec(sql(f));
  await d.exec(`
    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to anon, authenticated, service_role;
    insert into auth.users values ('${HELLO.id}', '${HELLO.email}', now()), ('${SALES.id}', '${SALES.email}', now());
  `);
  return d;
}

/** The same deps as staff-actor.ts, over PGlite. `admin` = service role available. */
function deps(d: PGlite, user: User, opts: { admin: boolean; amr: { method: string; timestamp: number }[] }): ActorDeps {
  const asUser = async <T>(q: string, params: unknown[] = []) => {
    const claims = { sub: user.id, email: user.email, role: "authenticated", amr: opts.amr };
    await d.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
    await d.exec("set role authenticated");
    try {
      return (await d.query<T>(q, params)).rows;
    } finally {
      await d.exec("reset role");
      await d.query("select set_config('request.jwt.claims', '', false)");
    }
  };
  const asAdmin = async <T>(q: string, params: unknown[] = []) => {
    await d.exec("set role service_role");
    try {
      return (await d.query<T>(q, params)).rows;
    } finally {
      await d.exec("reset role");
    }
  };
  const read = opts.admin ? asAdmin : asUser;
  type Row = { email: string; role: string; status: string; name: string };
  return {
    getUser: async () => user,
    getMember: async (email) => (await read<Row>("select email, role, status, name from team_members where email = $1", [email]))[0] ?? null,
    touchMember: () => {},
    seedOwner: async (email) => {
      if (!opts.admin) return;
      await asAdmin(
        "insert into team_members (email, name, role, status) values ($1, 'Matt Girvan', 'owner', 'active') on conflict (email) do nothing",
        [email],
      );
    },
    acceptInvite: async () => (await asUser<{ ok: boolean }>("select public.accept_team_invite() as ok"))[0]?.ok === true,
  };
}

const now = () => Math.floor(Date.now() / 1000);
const status = async (d: PGlite, email: string) =>
  (await d.query<{ status: string }>("select status from team_members where email = $1", [email])).rows[0]?.status;

test("real SQL: a revoked hello@ stays revoked, with or without the service role", async () => {
  for (const admin of [true, false]) {
    const d = await db();
    await d.exec("update team_members set status = 'revoked' where email = 'hello@forecourt.me'");
    const who = await resolveActor(deps(d, HELLO, { admin, amr: [{ method: "otp", timestamp: now() }] }));
    assert.equal(who.team, false, `admin=${admin}`);
    assert.equal(who.role, null);
    assert.equal(await status(d, HELLO.email), "revoked", "never silently recreated or reactivated");
  }
});

test("real SQL: hello@ with no row is seeded once as owner; an existing row is never overwritten", async () => {
  const d = await db();
  await d.exec("delete from team_members where email = 'hello@forecourt.me'");
  const first = await resolveActor(deps(d, HELLO, { admin: true, amr: [] }));
  assert.deepEqual({ team: first.team, role: first.role }, { team: true, role: "owner" });
  assert.equal(await status(d, HELLO.email), "active");
  await d.exec("update team_members set status = 'revoked' where email = 'hello@forecourt.me'");
  assert.equal((await resolveActor(deps(d, HELLO, { admin: true, amr: [] }))).team, false);
  assert.equal(await status(d, HELLO.email), "revoked");
});

test("real SQL: an invite is accepted only with an email code or link after the invite", async () => {
  const d = await db();
  await d.exec("insert into team_members (email, role, status) values ('sales@forecourt.me', 'operator', 'invited')");
  await d.exec("update team_members set invited_at = now() - interval '10 minutes' where email = 'sales@forecourt.me'");
  const before = now() - 3600;
  const refused = await resolveActor(deps(d, SALES, { admin: false, amr: [{ method: "otp", timestamp: before }] }));
  assert.deepEqual({ team: refused.team, pendingInvite: refused.pendingInvite }, { team: false, pendingInvite: true });
  const pw = await resolveActor(deps(d, SALES, { admin: false, amr: [{ method: "password", timestamp: now() }] }));
  assert.equal(pw.team, false);
  assert.equal(await status(d, SALES.email), "invited");
  const ok = await resolveActor(deps(d, SALES, { admin: false, amr: [{ method: "otp", timestamp: now() }] }));
  assert.deepEqual({ team: ok.team, role: ok.role, pendingInvite: ok.pendingInvite }, { team: true, role: "operator", pendingInvite: false });
  assert.equal(await status(d, SALES.email), "active");
});
