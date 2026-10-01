/**
 * The DB fallback must fail safely on a deployed host with no DATABASE_URL:
 * no PGLite start (its data file is not bundled there), no unhandled
 * rejection, one clear log line, and a typed error for code that needs the DB.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

type DbModule = typeof import("./db.ts");

let fresh = 0;
async function loadDb(env: Record<string, string | undefined>): Promise<{
  db: DbModule;
  warnings: string[];
  errors: string[];
}> {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const g = globalThis as Record<string, unknown>;
  delete g.__dbNotConfiguredLogged__;
  delete g.__pgBootstrapPromise__;
  const warnings: string[] = [];
  const errors: string[] = [];
  const origWarn = console.warn;
  const origError = console.error;
  console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
  console.error = (...args: unknown[]) => errors.push(args.join(" "));
  try {
    fresh += 1;
    const db = (await import(`./db.ts?case=${fresh}`)) as DbModule;
    return { db, warnings, errors };
  } finally {
    console.warn = origWarn;
    console.error = origError;
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("deployed without DATABASE_URL: no PGLite, one log line, typed errors", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const { db, warnings, errors } = await loadDb({
      DATABASE_URL: undefined,
      VERCEL: "1",
      VERCEL_ENV: "production",
    });
    assert.equal(db.dbSource, "none");
    assert.equal(db.dbConfigured, false);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /DATABASE_URL is not configured/);
    assert.deepEqual(errors, []);

    await db.ensureDbReady(); // nothing to start, must resolve
    await assert.rejects(db.getSql(), (err: unknown) => db.isDbNotConfigured(err));
    await assert.rejects(db.getPglite(), (err: unknown) => db.isDbNotConfigured(err));

    // Give any stray promise a chance to surface as unhandled.
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("blank DATABASE_URL on a deployed host counts as unset", async () => {
  const { db } = await loadDb({ DATABASE_URL: "   ", VERCEL: undefined, VERCEL_ENV: "preview" });
  assert.equal(db.dbSource, "none");
});

test("DATABASE_URL set: Neon path, no warning", async () => {
  const { db, warnings } = await loadDb({
    DATABASE_URL: "postgres://user:pass@localhost:5432/app",
    VERCEL: "1",
  });
  assert.equal(db.dbSource, "neon");
  assert.equal(db.dbConfigured, true);
  assert.deepEqual(warnings, []);
});

test("503 answer for DB features is short, JSON and uncached", async () => {
  const { db } = await loadDb({ DATABASE_URL: undefined, VERCEL: "1" });
  const res = db.dbUnavailableResponse();
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "DB_NOT_CONFIGURED");
  assert.doesNotMatch(body.error, /[\u2013\u2014]/);
});
