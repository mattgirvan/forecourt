/**
 * desk-template 0007_forecourt_events.sql in PGlite on top of 0001 to 0006:
 * the outbox events for sites added, removed and restored and staff access
 * changes, the signed post (pg_net stubbed), and restore within 30 days.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { projectRoot } from "./with-app-env.mjs";

const root = join(projectRoot(), "desk-template", "supabase");
const MIGS = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
const SECRET = "s".repeat(40);

const STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated;
`;
const NET = `
create schema net;
create table net.sent (id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds int)
returns bigint language sql as $$ insert into net.sent (url, body, headers) values (url, body, headers) returning id $$;
`;

async function desk({ net = true, link = true } = {}) {
  const d = new PGlite({ extensions: { pgcrypto } });
  await d.exec(STUB);
  if (net) await d.exec(NET);
  for (const f of MIGS) await d.exec(readFileSync(join(root, "migrations", f), "utf8"));
  await d.exec(readFileSync(join(root, "migrations", "0007_forecourt_events.sql"), "utf8")); // re-run
  await d.exec(`grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on sites, staff_sites, staff_users to authenticated;`);
  await d.exec(`
    insert into staff_users (email, role, site) values ('boss@desk.test','principal',null), ('sam@desk.test','sales','A'), ('lim@desk.test','management','A');
    insert into sites (code, name, status) values ('A','Ridgeway North','live'), ('B','Ridgeway South','live');
  `);
  await d.exec(readFileSync(join(root, "backfill", "0005_sites.backfill.sql"), "utf8"));
  await d.exec("update staff_users set all_sites = false where email = 'lim@desk.test'");
  if (link) await d.exec(`insert into forecourt_link (endpoint, key_id, secret) values ('https://forecourt.me/api/desk/events', 'desk_rm', '${SECRET}')`);
  await d.exec("delete from forecourt_events; " + (net ? "delete from net.sent;" : ""));
  return d;
}

async function as(d, email, sql) {
  await d.exec("begin");
  try {
    await d.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ email })]);
    await d.exec("set local role authenticated");
    const r = await d.query(sql);
    await d.exec("commit");
    return { rows: r.rows };
  } catch (e) {
    await d.exec("rollback");
    return { err: e.message, rows: [] };
  }
}
const events = async (d) => (await d.query("select kind, coalesce(site_code, email) s, sent_at is not null sent from forecourt_events order by created_at, id")).rows.map((r) => `${r.kind}:${r.s}:${r.sent}`);

test("site added, removed and restored each queue one event and post it signed at commit", async () => {
  const d = await desk();
  await d.exec("insert into sites (code, name, status) values ('E','Ridgeway East','setting_up')");
  await d.exec("update sites set status = 'archived' where code = 'B'");
  await d.exec("update sites set name = 'Ridgeway South Yard' where code = 'B'");
  assert.deepEqual(await events(d), ["site_added:E:true", "site_removed:B:true"]);
  const r = await as(d, "boss@desk.test", "select admin_restore_site('B') s");
  assert.equal(r.rows[0].s, "live");
  assert.deepEqual((await events(d)).at(-1), "site_restored:B:true");
  const sent = (await d.query("select url, body, headers, body::text raw from net.sent order by id")).rows;
  assert.equal(sent.length, 3);
  const h = sent[0].headers;
  assert.equal(sent[0].url, "https://forecourt.me/api/desk/events");
  assert.equal(h["X-Forecourt-Desk"], "desk_rm");
  const want = createHmac("sha256", SECRET).update(`${h["X-Forecourt-Timestamp"]}.${sent[0].raw}`).digest("hex");
  assert.equal(h["X-Forecourt-Signature"], `v1=${want}`);
  assert.equal(sent[0].body.kind, "site_added");
  assert.deepEqual(sent[0].body.site, { code: "E", name: "Ridgeway East" });
  assert.match(sent[0].body.event_id, /^site_added:E:\d+$/);
});

test("staff access: one event per person per save, with the sites as saved", async () => {
  const d = await desk();
  const r = await as(d, "boss@desk.test", "select admin_set_staff_sites('sam@desk.test', array['A','B']::text[], false)");
  assert.equal(r.err, undefined);
  assert.deepEqual(await events(d), ["staff_access_changed:sam@desk.test:true"]);
  const body = (await d.query("select body from net.sent")).rows[0].body;
  assert.deepEqual(body.staff, { email: "sam@desk.test", all_sites: false, sites: ["A", "B"] });
  assert.equal(body.actor, "boss@desk.test");
  await d.exec("update staff_users set display_name = 'Sam' where email = 'sam@desk.test'");
  assert.equal((await events(d)).length, 1, "a name change is not an access change");
  await d.exec("update staff_users set all_sites = true where email = 'sam@desk.test'");
  assert.equal((await events(d)).length, 2);
});

test("restore within 30 days only, desk admins only", async () => {
  const d = await desk();
  await d.exec("update sites set status = 'archived' where code = 'B'");
  assert.match((await as(d, "sam@desk.test", "select admin_restore_site('B')")).err, /not allowed/);
  assert.match((await as(d, "lim@desk.test", "select admin_restore_site('B')")).err, /not allowed/, "manager limited to A cannot restore B");
  assert.deepEqual((await as(d, "boss@desk.test", "select code from admin_restorable_sites()")).rows, [{ code: "B" }]);
  await d.exec("update sites set archived_at = now() - interval '31 days' where code = 'B'");
  assert.match((await as(d, "boss@desk.test", "select admin_restore_site('B')")).err, /restore window closed/);
  assert.deepEqual((await as(d, "boss@desk.test", "select code from admin_restorable_sites()")).rows, []);
  assert.match((await as(d, "boss@desk.test", "select admin_restore_site('A')")).err, /not archived/);
});

test("setting up sites restore to setting up", async () => {
  const d = await desk();
  await d.exec("insert into sites (code, name, status) values ('E','Ridgeway East','setting_up'); update sites set status = 'archived' where code = 'E'");
  assert.equal((await as(d, "boss@desk.test", "select admin_restore_site('E') s")).rows[0].s, "setting_up");
});

test("no link row or no pg_net: events stay queued, nothing fails", async () => {
  const a = await desk({ link: false });
  await a.exec("insert into sites (code, name) values ('E','Ridgeway East')");
  assert.deepEqual(await events(a), ["site_added:E:false"]);
  const b = await desk({ net: false });
  await b.exec("insert into sites (code, name) values ('E','Ridgeway East')");
  assert.deepEqual(await events(b), ["site_added:E:false"]);
  assert.equal((await b.query("select last_error from forecourt_events")).rows[0].last_error, "pg_net not installed");
});

test("staff cannot read the link secret or the outbox", async () => {
  const d = await desk();
  assert.match((await as(d, "boss@desk.test", "select secret from forecourt_link")).err, /permission denied/);
  assert.match((await as(d, "boss@desk.test", "select * from forecourt_events")).err, /permission denied/);
  assert.match((await as(d, "boss@desk.test", "select forecourt_send('x')")).err, /permission denied/);
});
