/**
 * desk-template migrations 0001 to 0005 run for real in PGlite. Site scoping
 * (0005_sites.sql): every role gets allowed and denied cases for reads, writes,
 * cross-site and cross-tenant leaks. Also: 0005 changes nothing before the
 * backfill, and re-runs cleanly.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { projectRoot } from "./with-app-env.mjs";

const migDir = join(projectRoot(), "desk-template", "supabase", "migrations");
const MIGS = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
const backfillSql = readFileSync(join(projectRoot(), "desk-template", "supabase", "backfill", "0005_sites.backfill.sql"), "utf8");

const STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated;
`;

const P = {
  salesA: "sam@desk.test",        // sales, site A
  floorAB: "pat@desk.test",       // progressor, sites A and B
  mgrA: "lim@desk.test",          // management, limited to A
  mgrAll: "all@desk.test",        // management, All sites
  owner: "boss@desk.test",        // principal
  salesC: "cal@desk.test",        // sales, site C
  other: "intruder@other.test",   // staff on ANOTHER tenant's desk
  customer: "buyer@mail.test",    // customer with an order at A
  anon: null,
};

async function desk({ backfill }) {
  const d = new PGlite();
  await d.exec(STUB);
  for (const f of MIGS) await d.exec(readFileSync(join(migDir, f), "utf8"));
  await d.exec(readFileSync(join(migDir, "0005_sites.sql"), "utf8")); // re-run must be clean
  await d.exec(`grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
    grant usage, select on all sequences in schema public to anon, authenticated;`);
  await d.exec(`
    insert into staff_users (email, role, site) values
      ('sam@desk.test','sales','A'), ('pat@desk.test','progressor',null),
      ('lim@desk.test','management','A'), ('all@desk.test','management',null),
      ('boss@desk.test','principal',null), ('cal@desk.test','sales','C');
    insert into orders (id, customer_name, customer_email, vehicle, customer_type, car_type, site, salesperson_email) values
      ('A1','Ann','buyer@mail.test','Fabia','Cash','New','A','sam@desk.test'),
      ('A2','Al','a2@mail.test','Kamiq','Cash','New','A','lim@desk.test'),
      ('B1','Bea','b1@mail.test','Enyaq','Finance','New','B','sam@desk.test'),
      ('C1','Cy','c1@mail.test','Superb','Lease','Used','C','cal@desk.test');
    insert into stock (id, vin, vehicle, car_type, site) values
      ('sA','VINA','Fabia','New','A'), ('sB','VINB','Enyaq','New','B'), ('sC','VINC','Superb','Used','C');
    insert into messages (order_id, sender, text) values ('A1','dealer','hi A'), ('B1','dealer','hi B'), ('C1','dealer','hi C');
    insert into briefs (name, site) values ('brief A','A'), ('brief C','C'), ('shared brief', null);
  `);
  if (backfill) {
    await d.exec(backfillSql);
    // Matt's setup after the backfill: pat on A and B, lim limited to A (untick All sites).
    await d.exec(`
      delete from staff_sites where email = 'pat@desk.test';
      insert into staff_sites (email, site_code) values ('pat@desk.test','A'), ('pat@desk.test','B');
      update staff_users set all_sites = false where email = 'lim@desk.test';
      insert into staff_sites (email, site_code) values ('lim@desk.test','A') on conflict do nothing;
    `);
  }
  return d;
}

async function as(d, email, sql) {
  await d.exec("begin");
  try {
    await d.query("select set_config('request.jwt.claims', $1, true)", [email ? JSON.stringify({ email, role: "authenticated" }) : "{}"]);
    await d.exec(email ? "set local role authenticated" : "set local role anon");
    const r = await d.query(sql);
    return { rows: r.rows, n: r.affectedRows ?? r.rows.length };
  } catch (e) {
    return { err: e.message, rows: [], n: 0 };
  } finally {
    await d.exec("rollback");
  }
}
const ids = async (d, who, t, col = "id") => (await as(d, who, `select ${col} as k from ${t} order by 1`)).rows.map((r) => r.k).join(",");
const wrote = async (d, who, sql) => { const r = await as(d, who, sql); return !r.err && r.n > 0; };

const INS_ORDER = (site, sp) => `insert into orders (id, customer_name, customer_email, vehicle, customer_type, car_type, site, salesperson_email) values ('N${site}','N','n@mail.test','Octavia','Cash','New','${site}','${sp}')`;
const INS_STOCK = (site) => `insert into stock (id, vin, vehicle, car_type, site) values ('n${site}','NEW${site}','Elroq','New','${site}')`;

const matrix = [];
const check = (role, kase, got, want) => {
  matrix.push({ role, kase, expect: want, ok: JSON.stringify(got) === JSON.stringify(want) });
  assert.deepEqual(got, want, `${role}: ${kase}`);
};

test("before the backfill nothing changes (legacy desk)", async () => {
  const d = await desk({ backfill: false });
  check("legacy limited manager", "reads every site's orders", await ids(d, P.mgrA, "orders"), "A1,A2,B1,C1");
  check("legacy sales", "reads own book across sites", await ids(d, P.salesA, "orders"), "A1,B1");
  check("legacy host/progressor", "reads all stock", await ids(d, P.floorAB, "stock"), "sA,sB,sC");
  check("legacy sales", "insert own deal at any site", await wrote(d, P.salesA, INS_ORDER("C", P.salesA)), true);
  check("legacy anon", "reads nothing", await ids(d, P.anon, "orders"), "");
});

test("site scoping on: every role, allowed and denied", async () => {
  const d = await desk({ backfill: true });

  // sales on one site
  check("sales, 1 site (A)", "reads own deal at A", await ids(d, P.salesA, "orders"), "A1");
  check("sales, 1 site (A)", "DENIED own deal moved to B (cross-site)", (await ids(d, P.salesA, "orders")).includes("B1"), false);
  check("sales, 1 site (A)", "DENIED other rep's deal at A", (await ids(d, P.salesA, "orders")).includes("A2"), false);
  check("sales, 1 site (A)", "reads stock A only", await ids(d, P.salesA, "stock"), "sA");
  check("sales, 1 site (A)", "reads messages A only", await ids(d, P.salesA, "messages", "text"), "hi A");
  check("sales, 1 site (A)", "reads briefs A + shared", await ids(d, P.salesA, "briefs", "name"), "brief A,shared brief");
  check("sales, 1 site (A)", "insert deal at A", await wrote(d, P.salesA, INS_ORDER("A", P.salesA)), true);
  check("sales, 1 site (A)", "DENIED insert deal at B", await wrote(d, P.salesA, INS_ORDER("B", P.salesA)), false);
  check("sales, 1 site (A)", "DENIED move own A deal to B", await wrote(d, P.salesA, "update orders set site='B' where id='A1'"), false);
  check("sales, 1 site (A)", "DENIED update deal at B", await wrote(d, P.salesA, "update orders set notes='x' where id='B1'"), false);
  check("sales, 1 site (A)", "DENIED message into B thread", await wrote(d, P.salesA, "insert into messages (order_id, sender, text) values ('B1','dealer','leak')"), false);
  check("sales, 1 site (A)", "DENIED link self to site C", await wrote(d, P.salesA, "insert into staff_sites (email, site_code) values ('sam@desk.test','C')"), false);
  check("sales, 1 site (A)", "DENIED tick own All sites", await wrote(d, P.salesA, "update staff_users set all_sites=true where email='sam@desk.test'"), false);
  check("sales, 1 site (A)", "my_sites is A", (await as(d, P.salesA, "select code from my_sites()")).rows.map((r) => r.code).join(","), "A");

  // staff on several sites
  check("progressor, 2 sites (A,B)", "reads orders A,B", await ids(d, P.floorAB, "orders"), "A1,A2,B1");
  check("progressor, 2 sites (A,B)", "DENIED orders at C", (await ids(d, P.floorAB, "orders")).includes("C1"), false);
  check("progressor, 2 sites (A,B)", "reads stock A,B", await ids(d, P.floorAB, "stock"), "sA,sB");
  check("progressor, 2 sites (A,B)", "update stock at B", await wrote(d, P.floorAB, "update stock set keys='Cabinet A' where id='sB'"), true);
  check("progressor, 2 sites (A,B)", "DENIED update stock at C", await wrote(d, P.floorAB, "update stock set keys='x' where id='sC'"), false);
  check("progressor, 2 sites (A,B)", "DENIED move stock A to C", await wrote(d, P.floorAB, "update stock set site='C' where id='sA'"), false);
  check("progressor, 2 sites (A,B)", "DENIED insert stock at C", await wrote(d, P.floorAB, INS_STOCK("C")), false);
  check("progressor, 2 sites (A,B)", "DENIED write deals (role rule kept)", await wrote(d, P.floorAB, "update orders set notes='x' where id='A1'"), false);
  check("progressor, 2 sites (A,B)", "reads messages A,B", await ids(d, P.floorAB, "messages", "text"), "hi A,hi B");

  // manager limited to A
  check("manager, limited to A", "reads all deals at A", await ids(d, P.mgrA, "orders"), "A1,A2");
  check("manager, limited to A", "DENIED deals at B and C", await ids(d, P.mgrA, "orders where site <> 'A'"), "");
  check("manager, limited to A", "update deal at A", await wrote(d, P.mgrA, "update orders set notes='ok' where id='A1'"), true);
  check("manager, limited to A", "DENIED update deal at C", await wrote(d, P.mgrA, "update orders set notes='x' where id='C1'"), false);
  check("manager, limited to A", "DENIED insert deal at B", await wrote(d, P.mgrA, INS_ORDER("B", P.mgrA)), false);
  check("manager, limited to A", "DENIED messages at B,C", await ids(d, P.mgrA, "messages", "text"), "hi A");
  check("manager, limited to A", "DENIED delete deal at C", await wrote(d, P.mgrA, "delete from orders where id='C1'"), false);
  await d.exec("insert into sites (code, name) values ('D','Site D'); insert into stock (id, vin, vehicle, car_type, site) values ('sD','VIND','Kodiaq','New','D')");
  check("manager, limited to A", "DENIED new site D (not automatic)", await ids(d, P.mgrA, "stock"), "sA");

  // all-sites manager
  check("manager, All sites", "reads every site's deals", await ids(d, P.mgrAll, "orders"), "A1,A2,B1,C1");
  check("manager, All sites", "gets new site D automatically", await ids(d, P.mgrAll, "stock"), "sA,sB,sC,sD");
  check("manager, All sites", "update deal at C", await wrote(d, P.mgrAll, "update orders set notes='ok' where id='C1'"), true);
  check("manager, All sites", "DENIED add a site (service role only)", await wrote(d, P.mgrAll, "insert into sites (code, name) values ('E','E')"), false);

  // owner (principal)
  check("owner (principal)", "reads every site", await ids(d, P.owner, "orders"), "A1,A2,B1,C1");
  check("owner (principal)", "insert deal at D", await wrote(d, P.owner, INS_ORDER("D", P.owner)), true);
  check("owner (principal)", "reads all messages", await ids(d, P.owner, "messages", "text"), "hi A,hi B,hi C");
  check("owner (principal)", "DENIED edit staff links from client", await wrote(d, P.owner, "insert into staff_sites (email, site_code) values ('cal@desk.test','A')"), false);

  // sales on another site, sees nothing of A
  check("sales, 1 site (C)", "reads own C deal only", await ids(d, P.salesC, "orders"), "C1");
  check("sales, 1 site (C)", "DENIED stock at A,B", await ids(d, P.salesC, "stock"), "sC");

  // another tenant
  check("another tenant's staff", "DENIED read orders", await ids(d, P.other, "orders"), "");
  check("another tenant's staff", "DENIED read stock/messages/briefs", [await ids(d, P.other, "stock"), await ids(d, P.other, "messages"), await ids(d, P.other, "briefs")].join("|"), "||");
  check("another tenant's staff", "DENIED insert deal", await wrote(d, P.other, INS_ORDER("A", P.other)), false);
  check("another tenant's staff", "DENIED sites list", await ids(d, P.other, "sites", "code"), "");

  // customer (unchanged)
  check("customer", "reads own order", await ids(d, P.customer, "orders"), "A1");
  check("customer", "DENIED other orders and stock", await ids(d, P.customer, "stock"), "");

  // anonymous
  check("anonymous", "DENIED every table", [await ids(d, P.anon, "orders"), await ids(d, P.anon, "stock"), await ids(d, P.anon, "sites", "code"), await ids(d, P.anon, "staff_sites", "email")].join("|"), "|||");
  check("anonymous", "DENIED insert deal", await wrote(d, P.anon, INS_ORDER("A", "x")), false);
  check("anonymous", "DENIED call can_see_site", !!(await as(d, P.anon, "select can_see_site('A')")).err, true);
});

test("print role matrix", () => {
  for (const m of matrix) console.log(`MATRIX\t${m.role}\t${m.kase}\t${m.ok ? "PASS" : "FAIL"}`);
});
