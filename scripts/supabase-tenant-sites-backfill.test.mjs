/** 04 tenant_sites backup and backfill (group build PR 4), run twice in PGlite. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { projectRoot } from "./with-app-env.mjs";

const read = (f) => readFileSync(join(projectRoot(), "supabase", f), "utf8");

test("tenant_sites backfill keeps live accounts paid, skips site plans, and re-runs safely", async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create table public.tenants (id serial primary key, name text, plan text, status text, sites text not null default '[]', site_count int default 1, stripe_subscription_id text, created_at timestamptz default '2026-09-01');
    insert into tenants(name, plan, status, sites) values
      ('Ridgeway Motors', 'group', 'live', '["North","South",{"code":"RET","name":"Retail","status":"setting_up"}]'),
      ('Hartley', 'franchise', 'building', '["Motors Showroom","Motors Used"]'),
      ('Solo', 'site', 'live', '["Main"]'),
      ('Broken', 'group', 'live', 'not json');`);
  await db.exec(read("site-billing.sql"));
  await db.exec(read("tenant-sites.backup.sql"));
  await db.exec(read("tenant-sites.backfill.sql"));
  await db.exec(`update tenant_sites set status = 'archived' where code = 'South'`);
  await db.exec(read("tenant-sites.backfill.sql"));
  const { rows } = await db.query(`select tenant_id, code, status, live_at is not null as has_live from tenant_sites order by tenant_id, code`);
  assert.deepEqual(rows, [
    { tenant_id: 1, code: "North", status: "live", has_live: true },
    { tenant_id: 1, code: "RET", status: "setting_up", has_live: false },
    { tenant_id: 1, code: "South", status: "archived", has_live: true },
    { tenant_id: 2, code: "Motors Showroom", status: "setting_up", has_live: false },
    { tenant_id: 2, code: "Motors Used", status: "setting_up", has_live: false },
  ]);
  const b = await db.query(`select count(*)::int as n from backup_04_tenants`);
  assert.equal(b.rows[0].n, 4);
  await db.close();
});

test("desk backfill script does nothing without --yes", () => {
  const out = execFileSync("bash", [join(projectRoot(), "scripts/golive/desk-sites-backfill.sh"), "--desk", "demo"], { env: { ...process.env, DESK_DB_URL: "postgres://nowhere.invalid/x" }, encoding: "utf8" });
  assert.match(out, /Dry run for demo\. Nothing was changed/);
});
