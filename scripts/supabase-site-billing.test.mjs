/** supabase/site-billing.sql (group build PR 3) run twice in PGlite on a stub tenants table. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { projectRoot } from "./with-app-env.mjs";

const sql = readFileSync(join(projectRoot(), "supabase", "site-billing.sql"), "utf8");

test("site billing SQL is safe to re-run and enforces its rules", async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create table public.tenants (id serial primary key, name text); insert into tenants(name) values ('Hartley');`);
  await db.exec(sql);
  await db.exec(sql);
  await db.exec(`insert into tenant_sites(tenant_id, code, name) values (1, 'HMS', 'Hartley Motors Showroom')`);
  const { rows } = await db.query(`select status from tenant_sites`);
  assert.equal(rows[0].status, "setting_up");
  await assert.rejects(db.exec(`insert into tenant_sites(tenant_id, code, name, status) values (1, 'X', 'X', 'paused')`));
  await assert.rejects(db.exec(`insert into tenant_sites(tenant_id, code, name) values (1, 'HMS', 'dup')`));
  await db.exec(`insert into site_billing_events(tenant_id, site_code, to_status, event_key) values (1, 'HMS', 'live', 'k1')`);
  await assert.rejects(db.exec(`insert into site_billing_events(tenant_id, site_code, to_status, event_key) values (1, 'HMS', 'live', 'k1')`));
  const rls = await db.query(`select relname, relrowsecurity from pg_class where relname in ('tenant_sites','site_billing_events') order by 1`);
  assert.deepEqual(rls.rows.map((r) => r.relrowsecurity), [true, true]);
  await db.close();
});
