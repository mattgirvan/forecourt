import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  assertEmailVerified,
  emailVerified,
  UNVERIFIED_EMAIL_MESSAGE,
  type UserLike,
} from "./verified-email.ts";

const EMAIL = "dealer@example.co.uk";
const emailId = (over: Record<string, unknown> = {}) => ({
  provider: "email",
  identity_data: { email: EMAIL, email_verified: false, ...over },
});
const google = (verified: unknown, email = EMAIL) => ({
  provider: "google",
  identity_data: { email, email_verified: verified },
});
const user = (identities: unknown[], over: Partial<UserLike> = {}): UserLike => ({
  email: EMAIL,
  email_confirmed_at: "2026-09-01T10:00:00Z",
  identities: identities as UserLike["identities"],
  ...over,
});

describe("emailVerified: email code accounts are never locked out", () => {
  it("email identity, email_confirmed_at set (autoconfirm sets it at signup)", () => {
    assert.equal(emailVerified(user([emailId()])), true);
  });
  it("email identity, identity says email_verified even if the user column is empty", () => {
    assert.equal(
      emailVerified(user([emailId({ email_verified: true })], { email_confirmed_at: null })),
      true,
    );
  });
  it("case and spaces in the email do not matter", () => {
    assert.equal(
      emailVerified(
        user([emailId({ email: " Dealer@Example.co.uk " })], { email: "DEALER@example.co.uk" }),
      ),
      true,
    );
  });
  it("email identity that was never confirmed is not proof", () => {
    assert.equal(emailVerified(user([emailId()], { email_confirmed_at: null })), false);
  });
  it("email identity for a different address is not proof", () => {
    assert.equal(emailVerified(user([emailId({ email: "other@example.co.uk" })])), false);
  });
});

describe("emailVerified: Google", () => {
  it("Google only, Google verified the same email", () => {
    assert.equal(emailVerified(user([google(true)])), true);
    assert.equal(emailVerified(user([google("true")])), true);
  });
  it("email code plus a verified Google login", () => {
    assert.equal(emailVerified(user([emailId(), google(true)])), true);
  });
  it("Google only, Google did not verify: refused even though autoconfirm set email_confirmed_at", () => {
    assert.equal(emailVerified(user([google(false)])), false);
    assert.equal(emailVerified(user([google(undefined)])), false);
  });
  it("Google verified a different email: not proof", () => {
    assert.equal(emailVerified(user([google(true, "someone@gmail.com")])), false);
  });
  it("an unverified Google identity linked onto an email code account spoils it", () => {
    // The bypass Atlas found: link, then add a password or passkey. The rule
    // looks at the identities, so a later password or passkey session fails too.
    assert.equal(emailVerified(user([emailId(), google(false)])), false);
    assert.equal(
      emailVerified(user([emailId({ email_verified: true }), google(undefined)])),
      false,
    );
  });
  it("any other provider must also say verified", () => {
    assert.equal(
      emailVerified(user([emailId(), { provider: "github", identity_data: { email: EMAIL } }])),
      false,
    );
    assert.equal(
      emailVerified(
        user([{ provider: "github", identity_data: { email: EMAIL, email_verified: true } }]),
      ),
      false,
    );
  });
});

describe("emailVerified: edge cases", () => {
  it("no user, no email, no identities", () => {
    assert.equal(emailVerified(null), false);
    assert.equal(emailVerified(user([emailId()], { email: "" })), false);
    assert.equal(emailVerified(user([])), false);
    assert.equal(emailVerified(user([], { identities: null })), false);
  });
  it("assertEmailVerified throws the plain message", () => {
    assert.throws(() => assertEmailVerified(user([google(false)])), {
      message: UNVERIFIED_EMAIL_MESSAGE,
    });
    assert.doesNotThrow(() => assertEmailVerified(user([emailId()])));
    assert.doesNotMatch(UNVERIFIED_EMAIL_MESSAGE, /[\u2013\u2014]/);
  });
});

// ---------------------------------------------------------------------------
// Invariant: scan ALL of src/ for every sign-in, session lookup and token use,
// rather than naming files. Anything new fails here until it is classified.
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name) && !/\.test\./.test(name))
      out.push(p.split(path.sep).join("/"));
  }
  return out;
}
const FILES = walk("src").map((file) => ({ file, src: readFileSync(file, "utf8") }));
const STAFF_ACTOR = "src/lib/server/staff-actor.ts";
const isServerFile = (file: string, src: string) =>
  file.startsWith("src/lib/server/") ||
  file.startsWith("src/routes/api/") ||
  /\.server\.tsx?$/.test(file) ||
  /createServerFn\(/.test(src);
const GUARD_CALL = /await (actor|uid|verifiedUser)\((data\.)?(token|accessToken)\)/;
/** True when `name` is defined somewhere in src and its body starts with a guard call. */
function guardedFunction(name: string): boolean {
  for (const { src } of FILES) {
    const start = src.search(new RegExp(`(async )?function ${name}\\(|const ${name} = createServerFn\\(`));
    if (start === -1) continue;
    const next = src.slice(start + 1).search(/\n(export |function |async function )/);
    const body = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
    if (GUARD_CALL.test(body)) return true;
  }
  return false;
}
const BEARER = /Bearer \$\{|["'`]Bearer ["'`]\s*\+/;
const hits = (re: RegExp) =>
  FILES.filter(({ src }) => re.test(src))
    .map(({ file }) => file)
    .sort();

describe("auth invariant: every token-to-user lookup is the guarded one", () => {
  it("the scan really covers the app", () => {
    assert.ok(FILES.length > 50, `scanned ${FILES.length} files`);
    assert.ok(FILES.some((f) => f.file === STAFF_ACTOR));
  });

  it("only staff-actor.ts turns a token into a Supabase user", () => {
    assert.deepEqual(hits(/\.auth\.(getUser|getClaims)\(|\/auth\/v1\/user\b|\/auth\/v1\/token\b/), [
      STAFF_ACTOR,
    ]);
  });

  it("only staff-actor.ts builds a Supabase client that acts as the signed-in user", () => {
    assert.deepEqual(hits(/global:\s*\{\s*headers:\s*\{\s*Authorization/), [STAFF_ACTOR]);
  });

  it("in staff-actor.ts the token client is private and every getUser is checked", () => {
    const src = readFileSync(STAFF_ACTOR, "utf8");
    assert.doesNotMatch(src, /export\s+(async\s+)?function\s+sbFor|export\s*\{[^}]*\bsbFor\b/);
    assert.equal(
      src.match(/\bsbFor\(token\)/g)?.length,
      1,
      "sbFor(token) is called once, in verifiedUser",
    );
    const body = src.slice(
      src.indexOf("export async function verifiedUser"),
      src.indexOf("export async function actor"),
    );
    assert.match(body, /sbFor\(token\)/);
    assert.match(
      body,
      /\.auth\.getUser\(token\)[\s\S]*assertEmailVerified\(data\.user\)[\s\S]*return \{ sb, user: data\.user \}/,
    );
    assert.equal(src.match(/\.auth\.getUser\(/g)?.length, 1);
    assert.match(
      src,
      /export async function actor\(token: string\) \{\s*const \{ sb, user \} = await verifiedUser\(token\);/,
    );
  });

  it("every server function that takes a token gets its user through verifiedUser", () => {
    const users = FILES.filter(({ src }) => /from "@\/lib\/server\/staff-actor"/.test(src))
      .map(({ file }) => file)
      .sort();
    for (const { file, src } of FILES) {
      if (!isServerFile(file, src) || file === STAFF_ACTOR) continue;
      const chunks = src.split(/createServerFn\(/).slice(1);
      chunks.forEach((chunk, i) => {
        const end = chunk.search(/\n(export |function |async function )/);
        const handler = end === -1 ? chunk : chunk.slice(0, end);
        if (!/\bdata\.token\b/.test(handler)) return;
        if (!GUARD_CALL.test(handler)) {
          // A thin delegate is fine if the function it hands the token to is guarded.
          const callee = handler.match(/\b(\w+)\((?:\{ data: \{ token: )?data\.token\b/)?.[1];
          assert.ok(callee && guardedFunction(callee), `${file} server function #${i + 1} uses data.token without a guard`);
        }
        assert.ok(users.includes(file), `${file} must import its guard from staff-actor.ts`);
      });
    }
    // build and build-api use the one actor() from staff-actor.ts (#42), which
    // calls verifiedUser; commerce's uid() calls verifiedUser itself.
    for (const file of ["src/lib/server/build.ts", "src/lib/server/build-api.ts"]) {
      const src = readFileSync(file, "utf8");
      assert.match(src, /import \{ actor \} from "@\/lib\/server\/staff-actor";/, `${file} imports the shared actor`);
      assert.doesNotMatch(src, /function actor\(/, `${file} has no local actor`);
    }
    assert.match(
      readFileSync("src/lib/server/commerce.ts", "utf8"),
      /async function uid\(token: string\) \{\s*const \{ sb, user \} = await verifiedUser\(token\);/,
      "commerce uid() goes through verifiedUser",
    );
  });

  it("every Bearer header in the app is classified", () => {
    const known: Record<string, string> = {
      [STAFF_ACTOR]: "the guarded user client",
      "src/lib/server/desk-scaffold.ts": "GitHub API token, not a sign-in",
      "src/lib/auth/client.ts": "template preview gate (VITE_AUTH_ENABLED), not Supabase",
      "src/lib/auth/verify.server.ts": "template preview gate (VITE_AUTH_ENABLED), not Supabase",
      "src/lib/app-data/client.server.ts": "template connector gate token, not a sign-in",
    };
    // Template literals (`Bearer ${t}`) and concatenation ("Bearer " + t, 'Bearer ' + t, `Bearer ` + t).
    assert.deepEqual(hits(BEARER), Object.keys(known).sort());
  });

  it("the Bearer scan catches every spelling", () => {
    for (const src of ["`Bearer ${token}`", '"Bearer " + token', "'Bearer ' + token", "`Bearer ` + token", '"Bearer "+token']) {
      assert.match(src, BEARER, src);
    }
  });

  it("the template preview gate never reaches Forecourt data", () => {
    assert.deepEqual(hits(/\bjwtVerify\(/), ["src/lib/auth/gate-identity.server.ts"]);
    for (const { file, src } of FILES) {
      if (!file.startsWith("src/lib/server/") && !file.startsWith("src/routes/")) continue;
      if (file === "src/routes/api/auth/$.ts") continue; // the template gate's own endpoint
      assert.doesNotMatch(
        src,
        /from "@\/lib\/auth\/(middleware|server|verify\.server|gate-[\w-]+\.server)"/,
        file,
      );
    }
  });
});

describe("auth invariant: staff is never decided by the email domain", () => {
  const DOMAIN_TS = /endsWith\(\s*["'`]@forecourt\.me|@forecourt\\\.me\$|includes\(\s*["'`]@forecourt\.me|["'`]%@forecourt\.me/;
  it("looksLikeTeam is gone everywhere", () => {
    assert.deepEqual(hits(/\blooksLikeTeam\b/), []);
  });
  it("the only domain test is onForecourtDomain in team.ts", () => {
    assert.deepEqual(hits(DOMAIN_TS), ["src/lib/team.ts"]);
    const team = readFileSync("src/lib/team.ts", "utf8");
    const fn = team.slice(team.indexOf("export function onForecourtDomain"));
    assert.match(fn.slice(0, fn.indexOf("\n}")), /endsWith\("@forecourt\.me"\)/);
    assert.equal(team.match(/@forecourt\.me"\)/g)?.length, 1, "no other domain test in team.ts");
  });
  it("onForecourtDomain never decides access (only skips our own inboxes for customer emails)", () => {
    const callers = FILES.filter(({ file, src }) => file !== "src/lib/team.ts" && /\bonForecourtDomain\(/.test(src)).map(({ file }) => file);
    assert.deepEqual(callers, ["src/lib/server/journey-email.ts"]);
  });
  it("every server team decision goes through the one actor() (resolveActor, #42)", () => {
    for (const file of ["src/lib/server/build.ts", "src/lib/server/build-api.ts", "src/lib/server/commerce.ts", "src/lib/server/portal.ts"]) {
      const src = readFileSync(file, "utf8");
      assert.match(src, /const \{[^}]*\bteam\b[^}]*\} = await actor\((data\.token|accessToken)\)/, file);
      assert.doesNotMatch(src, /\bteamAccess\(/, `${file} decides staff itself`);
    }
    assert.match(readFileSync(STAFF_ACTOR, "utf8"), /resolveActor\(/);
  });
  it("no is_team() in the repo SQL trusts the domain (except #41's own emergency rollback)", () => {
    for (const f of readdirSync("supabase").filter((x) => x.endsWith(".sql"))) {
      if (f === "team-domain-hotfix.rollback.sql") continue;
      const sql = readFileSync(path.join("supabase", f), "utf8");
      for (const m of sql.matchAll(/create or replace function (?:public\.)?is_team\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/g)) {
        assert.doesNotMatch(m[1], /like\s+'%@|ilike|ends_with|right\(|split_part/i, `${f} is_team() uses the email domain`);
      }
    }
  });
});

describe("auth invariant: every sign-in and browser session read", () => {
  const SIGN_IN =
    /\.auth\.(signInWith\w+|signUp|verifyOtp|exchangeCodeForSession|setSession|signInAnonymously)\(/;
  const SESSION_READ = /\.auth\.(getSession|onAuthStateChange|refreshSession)\(/;

  it("browser session reads only happen in browser code", () => {
    for (const file of hits(SESSION_READ)) {
      const src = readFileSync(file, "utf8");
      assert.equal(isServerFile(file, src), false, `${file} reads a browser session on the server`);
    }
    assert.deepEqual(hits(SESSION_READ), [
      "src/lib/sb-session.tsx",
      "src/lib/sb.ts",
      "src/routes/login.tsx",
    ]);
  });

  it("the server only sends codes (admin invite), it never signs anyone in", () => {
    for (const { file, src } of FILES) {
      if (!isServerFile(file, src)) continue;
      const calls = src.match(new RegExp(SIGN_IN.source, "g")) ?? [];
      const adminSends = src.match(/admin\.auth\.signInWithOtp\(/g) ?? [];
      assert.equal(calls.length, adminSends.length, `${file} signs someone in on the server`);
    }
  });

  it("every browser sign-in is checked by the server before the page trusts it", () => {
    const signInFiles = FILES.filter(
      ({ file, src }) => SIGN_IN.test(src) && !isServerFile(file, src),
    );
    assert.ok(signInFiles.length >= 2);
    for (const { file, src } of signInFiles) {
      if (/\bwhoAmI\(/.test(src)) continue;
      const exported = [...src.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]);
      const helpers = exported.filter((name) => {
        const start = src.indexOf(`function ${name}(`);
        const next = src.indexOf("\nexport ", start + 1);
        return SIGN_IN.test(src.slice(start, next === -1 ? undefined : next));
      });
      assert.ok(helpers.length > 0, `${file} signs in without asking the server`);
      for (const name of helpers) {
        const callers = FILES.filter(
          (f) => f.file !== file && new RegExp(`\\b${name}\\(`).test(f.src),
        );
        assert.ok(callers.length > 0, `${name} has callers`);
        for (const c of callers)
          assert.match(c.src, /\bwhoAmI\(/, `${c.file} uses ${name} but never asks the server`);
      }
    }
  });

  it("login signs out an account the server refuses", () => {
    const login = readFileSync("src/routes/login.tsx", "utf8");
    assert.match(login, /UNVERIFIED_EMAIL_MESSAGE[\s\S]*auth\.signOut\(\)/);
  });
});

describe("database mirror: supabase/signin-verified-guard.sql", () => {
  const sql = readFileSync("supabase/signin-verified-guard.sql", "utf8");
  const code = sql.replace(/--[^\n]*/g, "");
  const rb = readFileSync("supabase/signin-verified-guard.rollback.sql", "utf8");
  const rbCode = rb.replace(/--[^\n]*/g, "");
  const PLACEHOLDER = "$body$ select true /* forecourt placeholder: signin-verified-guard.sql replaces this */ $body$";
  it("replaces auth_email_verified() with the identity rule for auth.uid()", () => {
    assert.match(code, /create or replace function public\.auth_email_verified\(\)/);
    assert.match(code, /select auth\.uid\(\) is not null and public\.email_verified_for\(auth\.uid\(\)\);/);
    assert.match(code, /from auth\.identities/);
    assert.match(code, /security definer/);
    assert.doesNotMatch(sql, /forecourt placeholder/, "the real body never carries the stand-in marker");
  });
  it("never defines is_team(), is_team_owner() or accept_team_invite(), and never touches the team policies", () => {
    assert.doesNotMatch(code, /function\s+(public\.)?(is_team|is_team_owner|accept_team_invite|team_members_guard)\s*\(/i);
    assert.doesNotMatch(code, /policy[^;]*\bon\s+(public\.)?(team_members|team_emails)\b/i);
    assert.doesNotMatch(code, /"team write (members|team_emails)"/);
  });
  it("the helpers use an empty search_path with qualified names", () => {
    for (const fn of ["auth_email_verified", "email_verified_for"]) {
      const m = code.match(new RegExp(`create or replace function public\\.${fn}\\([^)]*\\)[\\s\\S]*?as \\$\\$`));
      assert.ok(m, fn);
      assert.match(m[0], /set search_path = ''/, fn);
    }
    const helper = code.slice(code.indexOf("function public.email_verified_for"), code.indexOf("function public.auth_email_verified"));
    assert.doesNotMatch(helper, /\bfrom (users|identities)\b/, "names auth.users and auth.identities");
  });
  it("rollback puts the stand-in back word for word and never drops it", () => {
    assert.match(rbCode, /create or replace function public\.auth_email_verified\(\)/);
    assert.ok(rbCode.includes(PLACEHOLDER), "the stand-in body");
    assert.ok(readFileSync("supabase/team-owner-only.sql", "utf8").includes(PLACEHOLDER), "same as team-owner-only.sql");
    assert.doesNotMatch(rbCode, /drop function[^;]*auth_email_verified/i);
    assert.match(rbCode, /drop function if exists public\.email_verified_for\(uuid\);/);
    assert.ok(rbCode.indexOf(PLACEHOLDER) < rbCode.indexOf("drop function if exists public.email_verified_for"), "stand-in first, then the drop");
    assert.doesNotMatch(rbCode, /function\s+(public\.)?(is_team|is_team_owner|accept_team_invite)\s*\(|\bpolicy\b/i);
    assert.doesNotMatch(rb, /like\s+'%@/);
  });
  it("says Confirm email ON is required first", () => {
    assert.match(sql, /REQUIRED FIRST: turn Confirm email ON/);
    assert.match(readFileSync("supabase/README.md", "utf8"), /REQUIRED FIRST[\s\S]*\*\*Confirm email\*\* ON/);
  });
  const OWNER: Record<string, string> = {
    tenants: "control-plane.sql",
    orders: "control-plane.sql",
    provision_steps: "control-plane.sql",
    notes: "portal.sql",
    messages: "portal.sql",
    build_events: "build.sql",
    meetings: "build.sql",
  };
  const policy = (src: string, name: string, table: string) =>
    src.match(new RegExp(`create policy "${name}" on (?:public\\.)?${table}[\\s\\S]*?;`))?.[0];
  for (const [table, name] of [
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
  ]) {
    it(`dealer policy "${name}" on ${table} requires it, in ${OWNER[table]} and the same in the guard`, () => {
      const own = policy(readFileSync(path.join("supabase", OWNER[table]), "utf8"), name, table);
      assert.ok(own, `${OWNER[table]} defines it`);
      assert.match(own, /\(select public\.auth_email_verified\(\)\)/);
      assert.equal(policy(sql, name, table), own, "the guard copies it word for word");
    });
  }
  it("covers every dealer (auth.uid) policy in the repo", () => {
    const all = readdirSync("supabase")
      .filter((f) => f.endsWith(".sql") && !f.startsWith("signin-verified-guard") && !f.endsWith(".verify.sql"))
      .map((f) => readFileSync(path.join("supabase", f), "utf8"))
      .join("\n");
    const dealerPolicies = [...all.matchAll(/create policy "([^"]+)" on (\w+)[^;]*auth\.uid\(\)[^;]*;/g)]
      .filter((m) => !["team_members", "team_emails"].includes(m[2]))
      .map((m) => m[1]);
    assert.ok(dealerPolicies.length >= 10);
    for (const name of dealerPolicies) assert.match(code, new RegExp(`create policy "${name}"`), name);
  });
  it("has a rollback and a safety check that shows which check is on, and no dashes", () => {
    assert.match(sql, /signin-verified-guard\.rollback\.sql/);
    const check = readFileSync("supabase/signin-verified-guard.check.sql", "utf8");
    assert.match(check, /would_be_refused/);
    assert.match(check, /'placeholder \(always yes\)'/);
    for (const f of [sql, rb, check]) assert.doesNotMatch(f, /[\u2013\u2014]/);
  });
});

describe("sign-in page keeps the email code as the backup", () => {
  const login = readFileSync("src/routes/login.tsx", "utf8");
  it("still sends and verifies email codes", () => {
    assert.match(login, /signInWithOtp\(/);
    assert.match(login, /verifyOtp\(/);
  });
  it("offers Google through Supabase OAuth only, never Apple", () => {
    assert.match(login, /signInWithOAuth\(\{\s*provider: "google"/);
    assert.doesNotMatch(login, /provider: "apple"/);
  });
  it("the browser client opts in to Supabase passkeys", () => {
    assert.match(readFileSync("src/lib/sb.ts", "utf8"), /experimental: \{ passkey: true \}/);
  });
});
