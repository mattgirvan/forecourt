/** supabase/plan-changes.sql (group build PR 5) in PGlite, run twice. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { projectRoot } from "./with-app-env.mjs";

const sql = readFileSync(join(projectRoot(), "supabase", "plan-changes.sql"), "utf8");
const ins = (to, status = "pending_payment") =>
  `insert into plan_changes(tenant_id, from_plan, to_plan, direction, status, effective, requested_by) values (1, 'site', '${to}', 'upgrade', '${status}', 'after_payment', 'a@b.c')`;

test("plan_changes is re-runnable and allows one open upgrade per account", async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create table public.tenants (id serial primary key); insert into tenants default values;`);
  await db.exec(sql);
  await db.exec(sql);
  await db.exec(ins("group"));
  await assert.rejects(db.exec(ins("franchise")));
  await db.exec(`update plan_changes set status = 'applied'`);
  await db.exec(ins("franchise"));
  await assert.rejects(db.exec(ins("site", "applied").replace("'site', 'site'", "'site', 'site'")));
  await assert.rejects(db.exec(ins("group", "paused")));
  const rls = await db.query(`select relrowsecurity from pg_class where relname = 'plan_changes'`);
  assert.equal(rls.rows[0].relrowsecurity, true);
  await db.close();
});
