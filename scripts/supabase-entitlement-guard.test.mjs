/**
 * supabase/entitlement-guard.sql, run for real in PGlite on top of the repo's
 * Supabase SQL (control-plane, billing, portal, staff, build, archive) with a
 * small stand-in for Supabase's auth schema and roles. Checks that customers
 * cannot change status, plan once paid, Stripe ids, trial or billing fields,
 * while staff (is_team), service_role and postgres still can.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { projectRoot } from "./with-app-env.mjs";

const sqlDir = join(projectRoot(), "supabase");
const read = (f) => readFileSync(join(sqlDir, f), "utf8");

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const STAFF = "00000000-0000-0000-0000-0000000000ff";

const SUPABASE_STUB = `
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

const GRANTS = `
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
`;

async function freshDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of ["control-plane.sql", "billing.sql", "team-owner-only.sql", "portal.sql", "staff.sql", "build.sql", "archive.sql"]) {
    await db.exec(read(f));
  }
  // Applied twice: the file says it is safe to run more than once.
  await db.exec(read("entitlement-guard.sql"));
  await db.exec(read("entitlement-guard.sql"));
  await db.exec(GRANTS);
  await db.exec(`
    insert into auth.users values ('${A}', 'a@dealer.test'), ('${B}', 'b@dealer.test'), ('${STAFF}', 'ops@forecourt.me');
    insert into team_members (email, role, status) values ('ops@forecourt.me', 'operator', 'active')
      on conflict (email) do update set status = 'active';
  `);
  return db;
}

/** Run `sql` as a Supabase request: role plus JWT claims, like PostgREST does. */
async function as(db, who, sql, params = []) {
  const claims =
    who === "service_role"
      ? { role: "service_role" }
      : { sub: who.id, email: who.email, role: "authenticated" };
  const role = who === "service_role" ? "service_role" : "authenticated";
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
  await db.exec(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}

const custA = { id: A, email: "a@dealer.test" };
const custB = { id: B, email: "b@dealer.test" };
const staff = { id: STAFF, email: "ops@forecourt.me" };

async function refused(promise, what) {
  await assert.rejects(promise, (err) => err?.code === "42501", what);
}

async function seedTenant(db, user, slug, status = "briefing") {
  const r = await db.query(
    `insert into tenants (user_id, slug, name, status, plan, billing) values ($1, $2, $2, $3, 'site', 'subscription') returning id`,
    [user, slug, status],
  );
  return r.rows[0].id;
}

test("customer can create a briefing site and edit their brief", async () => {
  const db = await freshDb();
  const r = await as(
    db,
    custA,
    `insert into tenants (user_id, slug, name, plan, billing, site_count, status)
     values ($1, 'a-motors', 'A Motors', 'group', 'subscription', 3, 'briefing') returning id`,
    [A],
  );
  const id = r.rows[0].id;
  // Every field the app lets a customer edit (upsertTenant, savePack, saveTenantFile).
  await as(
    db,
    custA,
    `update tenants set name = 'A Motors Ltd', legal = 'A Ltd', phone = '01224', email = 'x@a.test',
       domain = 'a.test', sites = '[1]', features = '{"x":1}', ingest = 'feed', pack_json = '{}',
       staff_json = '[]', group_name = 'A Group', principal_name = 'Ann',
       plan = 'site', billing = 'trial', site_count = 1, term_months = 12
     where id = $1`,
    [id],
  );
  const row = (await db.query("select name, plan, status from tenants where id = $1", [id])).rows[0];
  assert.deepEqual(row, { name: "A Motors Ltd", plan: "site", status: "briefing" });
  await db.close();
});

test("customer cannot create a site that is already paid, live or linked to Stripe", async () => {
  const db = await freshDb();
  const bad = [
    `insert into tenants (user_id, slug, name, status) values ('${A}', 's1', 'S', 'subscribed')`,
    `insert into tenants (user_id, slug, name, status) values ('${A}', 's2', 'S', 'live')`,
    `insert into tenants (user_id, slug, name, stripe_customer_id) values ('${A}', 's3', 'S', 'cus_x')`,
    `insert into tenants (user_id, slug, name, stripe_subscription_id) values ('${A}', 's4', 'S', 'sub_x')`,
    `insert into tenants (user_id, slug, name, trial_ends_at) values ('${A}', 's5', 'S', now())`,
    `insert into tenants (user_id, slug, name, signed_off_at) values ('${A}', 's6', 'S', now())`,
    `insert into tenants (user_id, slug, name, stage) values ('${A}', 's7', 'S', 'live')`,
    `insert into tenants (user_id, slug, name, research) values ('${A}', 's8', 'S', 'notes')`,
  ];
  for (const sql of bad) await refused(as(db, custA, sql), sql);
  await db.close();
});

test("customer cannot change status, Stripe ids, trial, billing dates or staff fields", async () => {
  const db = await freshDb();
  const id = await seedTenant(db, A, "a-motors");
  const bad = [
    "status = 'subscribed'",
    "status = 'live'",
    "stage = 'live'",
    "stripe_customer_id = 'cus_x'",
    "stripe_subscription_id = 'sub_x'",
    "trial_ends_at = now() + interval '10 years'",
    "signed_off_at = now()",
    "cancelled_at = now()",
    "archived_at = now()",
    "research = 'mine'",
    "preview_url = 'https://x'",
    "repo_slug = 'x'",
    "user_id = '" + B + "'",
    "slug = 'other'",
  ];
  for (const set of bad) await refused(as(db, custA, `update tenants set ${set} where id = $1`, [id]), set);
  const row = (await db.query("select status, stripe_subscription_id from tenants where id = $1", [id])).rows[0];
  assert.deepEqual(row, { status: "briefing", stripe_subscription_id: null });
  await db.close();
});

test("once paid, the package is fixed for the customer but the brief stays editable", async () => {
  const db = await freshDb();
  const id = await seedTenant(db, A, "a-motors", "subscribed");
  for (const set of ["plan = 'group'", "billing = 'trial'", "site_count = 9", "term_months = 1"]) {
    await refused(as(db, custA, `update tenants set ${set} where id = $1`, [id]), set);
  }
  await as(db, custA, "update tenants set name = 'New name', staff_json = '[1]', phone = '1' where id = $1", [id]);
  // Same value is not a change (upsert style writes still work).
  await as(db, custA, "update tenants set plan = 'site', status = 'subscribed' where id = $1", [id]);
  assert.equal((await db.query("select name from tenants where id = $1", [id])).rows[0].name, "New name");
  await db.close();
});

test("service role (webhook, payment confirmation) can write payment fields", async () => {
  const db = await freshDb();
  const id = await seedTenant(db, A, "a-motors");
  await as(
    db,
    "service_role",
    `update tenants set status = 'subscribed', plan = 'group', billing = 'subscription',
       stripe_customer_id = 'cus_1', stripe_subscription_id = 'sub_1', trial_ends_at = null, stage = 'paid'
     where id = $1`,
    [id],
  );
  const o = await as(
    db,
    custA,
    `insert into orders (user_id, tenant_id, plan, amount_pence, status) values ($1, $2, 'group', 100, 'pending') returning id`,
    [A, id],
  );
  const orderId = o.rows[0].id;
  await as(db, "service_role", `update orders set status = 'paid', stripe_session_id = 'cs_1' where id = $1`, [orderId]);
  await as(db, "service_role", `update tenants set status = 'cancelled' where stripe_subscription_id = 'sub_1'`);
  assert.equal((await db.query("select status from orders where id = $1", [orderId])).rows[0].status, "paid");
  assert.equal((await db.query("select status from tenants where id = $1", [id])).rows[0].status, "cancelled");
  await db.close();
});

test("staff (is_team) can still run the office: sign off, stage, research, archive", async () => {
  const db = await freshDb();
  const id = await seedTenant(db, A, "a-motors", "subscribed");
  await as(
    db,
    staff,
    `update tenants set status = 'live', stage = 'live', research = 'notes', archived_at = now(),
       signed_off_at = now(), plan = 'group' where id = $1`,
    [id],
  );
  const o = await db.query(
    `insert into orders (user_id, tenant_id, plan, amount_pence, status) values ($1, $2, 'site', 1, 'paid') returning id`,
    [A, id],
  );
  await as(db, staff, `update orders set status = 'refunded' where id = $1`, [o.rows[0].id]);
  assert.equal((await db.query("select status from tenants where id = $1", [id])).rows[0].status, "live");
  await db.close();
});

test("postgres (SQL editor) is not affected", async () => {
  const db = await freshDb();
  const id = await seedTenant(db, A, "a-motors");
  await db.query("update tenants set status = 'live', stripe_customer_id = 'cus_1' where id = $1", [id]);
  await db.query("delete from tenants where id = $1", [id]);
  await db.close();
});

test("customer orders: insert pending for their own site only, never update or delete", async () => {
  const db = await freshDb();
  const mine = await seedTenant(db, A, "a-motors");
  const theirs = await seedTenant(db, B, "b-motors");
  const ins = (vals) =>
    as(db, custA, `insert into orders (user_id, tenant_id, plan, amount_pence, status, stripe_session_id) values ${vals} returning id`);
  const ok = await ins(`('${A}', ${mine}, 'site', 249900, 'pending', null)`);
  const orderId = ok.rows[0].id;
  await refused(ins(`('${A}', ${mine}, 'site', 249900, 'paid', null)`), "insert paid");
  await refused(ins(`('${A}', ${mine}, 'site', 249900, 'pending', 'cs_x')`), "insert with session");
  await refused(ins(`('${A}', ${theirs}, 'site', 249900, 'pending', null)`), "insert for another account");
  for (const set of ["status = 'paid'", "stripe_session_id = 'cs_x'", "amount_pence = 1", "plan = 'group'"]) {
    await refused(as(db, custA, `update orders set ${set} where id = $1`, [orderId]), set);
  }
  await refused(as(db, custA, "delete from orders where id = $1", [orderId]), "delete order");
  assert.equal((await db.query("select status from orders where id = $1", [orderId])).rows[0].status, "pending");
  void custB;
  await db.close();
});

test("customer may remove an unpaid site (its orders keep, unlinked) but not a paid one", async () => {
  const db = await freshDb();
  const unpaid = await seedTenant(db, A, "a-draft");
  const paid = await seedTenant(db, A, "a-live", "subscribed");
  const o = await as(
    db,
    custA,
    `insert into orders (user_id, tenant_id, plan, amount_pence, status) values ($1, $2, 'site', 1, 'pending') returning id`,
    [A, unpaid],
  );
  await as(db, custA, "delete from tenants where id = $1", [unpaid]);
  const left = (await db.query("select tenant_id from orders where id = $1", [o.rows[0].id])).rows[0];
  assert.equal(left.tenant_id, null);
  await refused(as(db, custA, "delete from tenants where id = $1", [paid]), "delete paid site");
  await db.close();
});

test("entitlement-guard.verify.sql passes with the guard and fails without it, changing nothing", async () => {
  const verify = read("entitlement-guard.verify.sql");
  const seed = async (db) => {
    const id = await seedTenant(db, A, "a-motors", "subscribed");
    await db.query(
      `insert into orders (user_id, tenant_id, plan, amount_pence, status) values ($1, $2, 'site', 1, 'paid')`,
      [A, id],
    );
    return id;
  };
  const db = await freshDb();
  const id = await seed(db);
  await db.exec(verify);
  assert.equal((await db.query("select current_user")).rows[0].current_user, "postgres");
  assert.equal((await db.query("select status from tenants where id = $1", [id])).rows[0].status, "subscribed");
  await db.close();

  const bare = new PGlite();
  await bare.exec(SUPABASE_STUB);
  for (const f of ["control-plane.sql", "billing.sql", "team-owner-only.sql", "portal.sql", "staff.sql", "build.sql", "archive.sql"]) {
    await bare.exec(read(f));
  }
  await bare.exec(GRANTS);
  await bare.exec(`insert into auth.users values ('${A}', 'a@dealer.test')`);
  await seed(bare);
  await assert.rejects(bare.exec(verify), /GUARD MISSING/);
  await bare.close();
});
