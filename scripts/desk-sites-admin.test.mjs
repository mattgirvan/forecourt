/**
 * desk-template 0006_sites_admin.sql in PGlite on top of 0001 to 0005 and the
 * 0005 backfill: site status, the switcher feed (archived never listed) and
 * the Admin tab RPCs. Every role gets allowed and denied cases.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { projectRoot } from "./with-app-env.mjs";

const root = join(projectRoot(), "desk-template", "supabase");
const MIGS = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();

const STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated;
`;

const P = {
  salesA: "sam@desk.test", floorAB: "pat@desk.test", mgrA: "lim@desk.test", mgrAll: "all@desk.test",
  owner: "boss@desk.test", salesC: "cal@desk.test", adminA: "adm@desk.test", other: "intruder@other.test", anon: null,
};

async function desk() {
  const d = new PGlite();
  await d.exec(STUB);
  for (const f of MIGS) await d.exec(readFileSync(join(root, "migrations", f), "utf8"));
  await d.exec(readFileSync(join(root, "migrations", "0006_sites_admin.sql"), "utf8")); // re-run
  await d.exec(`grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);
  await d.exec(`
    insert into staff_users (email, role, site) values
      ('sam@desk.test','sales','A'), ('pat@desk.test','progressor',null), ('lim@desk.test','management','A'),
      ('all@desk.test','management',null), ('boss@desk.test','principal',null), ('cal@desk.test','sales','C'),
      ('adm@desk.test','admin','A');
    insert into stock (id, vin, vehicle, car_type, site) values ('sA','VA','Fabia','New','A'), ('sB','VB','Enyaq','New','B'), ('sC','VC','Superb','Used','C');
  `);
  await d.exec(readFileSync(join(root, "backfill", "0005_sites.backfill.sql"), "utf8"));
  await d.exec(`
    delete from staff_sites where email = 'pat@desk.test';
    insert into staff_sites (email, site_code) values ('pat@desk.test','A'), ('pat@desk.test','B');
    update staff_users set all_sites = false where email = 'lim@desk.test';
    insert into sites (code, name, status) values ('N','Northbridge Vans','setting_up'), ('X','Old Yard','archived');
  `);
  return d;
}

async function as(d, email, sql) {
  await d.exec("begin");
  try {
    await d.query("select set_config('request.jwt.claims', $1, true)", [email ? JSON.stringify({ email }) : "{}"]);
    await d.exec(email ? "set local role authenticated" : "set local role anon");
    const r = await d.query(sql);
    await d.exec("commit");
    return { rows: r.rows };
  } catch (e) {
    await d.exec("rollback");
    return { err: e.message, rows: [] };
  }
}
const ok = async (d, who, sql) => !(await as(d, who, sql)).err;
const links = async (d, email) => (await d.query(`select string_agg(site_code, ',' order by site_code) l from staff_sites where email = '${email}'`)).rows[0].l ?? "";
const flag = async (d, email) => (await d.query(`select all_sites from staff_users where email = '${email}'`)).rows[0].all_sites;
const set = (email, sites, all = false) => `select admin_set_staff_sites('${email}', array[${sites.map((s) => `'${s}'`).join(",")}]::text[], ${all})`;

const matrix = [];
const check = (role, kase, got, want) => {
  matrix.push({ role, kase, ok: JSON.stringify(got) === JSON.stringify(want) });
  assert.deepEqual(got, want, `${role}: ${kase}`);
};

test("switcher feed and access flags", async () => {
  const d = await desk();
  const sites = async (who) => (await as(d, who, "select code || ':' || status s from my_site_list()")).rows.map((r) => r.s).join(",");
  const acc = async (who) => { const r = (await as(d, who, "select * from my_site_access()")).rows[0]; return r ? `${r.all_sites}/${r.can_switch}` : "none"; };
  check("manager, All sites", "switcher lists live and setting up, never archived", await sites(P.mgrAll), "A:live,B:live,C:live,N:setting_up");
  check("manager, All sites", "can switch, sees all", await acc(P.mgrAll), "true/true");
  check("manager, limited to A", "switcher lists A only", await sites(P.mgrA), "A:live");
  check("manager, limited to A", "can switch, not all sites", await acc(P.mgrA), "false/true");
  check("admin, site A", "can switch (admin)", await acc(P.adminA), "false/true");
  check("sales, 1 site (A)", "no switcher", await acc(P.salesA), "false/false");
  check("progressor, 2 sites (A,B)", "fixed label data: A,B; no switcher", `${await sites(P.floorAB)}|${await acc(P.floorAB)}`, "A:live,B:live|false/false");
  check("owner (principal)", "sees all, can switch, archived hidden", `${await sites(P.owner)}|${await acc(P.owner)}`, "A:live,B:live,C:live,N:setting_up|true/true");
  check("another tenant's staff", "no sites", await sites(P.other), "");
  check("anonymous", "DENIED my_site_list", (await as(d, P.anon, "select * from my_site_list()")).err ? "denied" : "allowed", "denied");
  check("manager, All sites", "DENIED archive a site from the client", await ok(d, P.mgrAll, "update sites set status='archived' where code='A'"), true);
  check("manager, All sites", "...and nothing changed (no write policy)", (await d.query("select status from sites where code='A'")).rows[0].status, "live");
});

test("admin tab: assigning staff to sites", async () => {
  const d = await desk();
  const list = async (who) => (await as(d, who, "select email || '=' || array_to_string(sites, '+') e from admin_staff_list()")).rows.map((r) => r.e).join(",");

  // limited manager
  check("manager, limited to A", "lists only staff on A (sites shown: A only)", await list(P.mgrA), "adm@desk.test=A,lim@desk.test=A,pat@desk.test=A,sam@desk.test=A");
  check("manager, limited to A", "DENIED see staff only on C", (await list(P.mgrA)).includes("cal@"), false);
  check("manager, limited to A", "remove A from pat keeps B (unseen site untouched)", (await ok(d, P.mgrA, set(P.floorAB, []))) && (await links(d, P.floorAB)), "B");
  check("manager, limited to A", "DENIED re-add pat once pat is on none of their sites", await ok(d, P.mgrA, set(P.floorAB, ["A"])), false);
  check("manager, All sites", "puts pat back on A", (await ok(d, P.mgrAll, set(P.floorAB, ["A", "B"]))) && (await links(d, P.floorAB)), "A,B");
  check("manager, limited to A", "DENIED give sam site B", await ok(d, P.mgrA, set(P.salesA, ["A", "B"])), false);
  check("manager, limited to A", "DENIED tick All sites", await ok(d, P.mgrA, set(P.salesA, ["A"], true)), false);
  check("manager, limited to A", "DENIED change own sites", await ok(d, P.mgrA, set(P.mgrA, ["A", "B"])), false);
  check("manager, limited to A", "DENIED change cal (site C)", await ok(d, P.mgrA, set(P.salesC, ["A"])), false);
  check("manager, limited to A", "DENIED change the All sites manager", await ok(d, P.mgrA, set(P.mgrAll, ["A"])), false);
  check("manager, limited to A", "DENIED write staff_sites directly", (await ok(d, P.mgrA, "insert into staff_sites values ('cal@desk.test','A')")) && (await links(d, P.salesC)) !== "C", false);

  // admin role behaves like a limited manager
  check("admin, site A", "assign sam to A", await ok(d, P.adminA, set(P.salesA, ["A"])), true);
  check("admin, site A", "DENIED assign site C", await ok(d, P.adminA, set(P.salesA, ["A", "C"])), false);

  // all-sites manager
  check("manager, All sites", "puts sam on A and B (several sites)", (await ok(d, P.mgrAll, set(P.salesA, ["A", "B"]))) && (await links(d, P.salesA)), "A,B");
  check("manager, All sites", "All sites stays unticked unless chosen", await flag(d, P.salesA), false);
  check("manager, All sites", "ticks All sites for the limited manager", (await ok(d, P.mgrAll, set(P.mgrA, ["A"], true))) && (await flag(d, P.mgrA)), true);
  check("manager, All sites", "unticks it again", (await ok(d, P.mgrAll, set(P.mgrA, ["A"], false))) && (await flag(d, P.mgrA)), false);
  check("manager, All sites", "assign a Setting up site", await ok(d, P.mgrAll, set(P.salesC, ["C", "N"])), true);
  check("manager, All sites", "DENIED assign an archived site", await ok(d, P.mgrAll, set(P.salesC, ["X"])), false);
  check("manager, All sites", "DENIED unknown site", await ok(d, P.mgrAll, set(P.salesC, ["ZZ"])), false);
  check("manager, All sites", "DENIED change the principal", await ok(d, P.mgrAll, set(P.owner, ["A"])), false);

  // owner
  check("owner (principal)", "changes the All sites manager", await ok(d, P.owner, set(P.mgrAll, ["A"], true)), true);

  // no admin rights
  check("sales, 1 site (A)", "DENIED staff list (empty)", await list(P.salesA), "");
  check("sales, 1 site (A)", "DENIED assign sites", await ok(d, P.salesA, set(P.salesA, ["A", "B", "C"], true)), false);
  check("progressor, 2 sites (A,B)", "DENIED assign sites", await ok(d, P.floorAB, set(P.salesA, ["B"])), false);
  check("another tenant's staff", "DENIED assign and list", `${await ok(d, P.other, set(P.salesA, ["A"]))}|${await list(P.other)}`, "false|");
  check("anonymous", "DENIED assign", await ok(d, P.anon, set(P.salesA, ["A"])), false);
});

test("print role matrix", () => {
  for (const m of matrix) console.log(`MATRIX\t${m.role}\t${m.kase}\t${m.ok ? "PASS" : "FAIL"}`);
});
