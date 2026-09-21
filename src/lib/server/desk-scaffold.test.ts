import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DESK_OWNER,
  DESK_TEMPLATE_REPO,
  deskHtmlUrl,
  deskRepoName,
  GH_TEMPLATE_TOKEN_KEYS,
  GH_TOKEN_MISSING,
  isGhTemplateTokenConfigured,
  listStaffEnvKeyNames,
  nextHumanSteps,
  requireGhTemplateToken,
  resolveGhTemplateToken,
} from "./desk-scaffold.ts";

describe("deskRepoName", () => {
  it("prefixes desk- and normalises slug", () => {
    assert.equal(deskRepoName("Harbour Park"), "desk-harbour-park");
    assert.equal(deskRepoName("harbour-park"), "desk-harbour-park");
    assert.equal(deskRepoName("  Ridgemont!!  "), "desk-ridgemont");
  });

  it("falls back when empty", () => {
    assert.equal(deskRepoName("   "), "desk-site");
  });
});

describe("deskHtmlUrl", () => {
  it("points at mattgirvan", () => {
    assert.equal(deskHtmlUrl("desk-harbour-park"), "https://github.com/mattgirvan/desk-harbour-park");
    assert.equal(DESK_OWNER, "mattgirvan");
    assert.equal(DESK_TEMPLATE_REPO, "forecourt-desk");
  });
});

describe("nextHumanSteps", () => {
  it("lists Supabase then Vercel (Phase 2 still manual)", () => {
    const steps = nextHumanSteps("harbour-park", "portal.harbourpark.example");
    assert.equal(steps.length, 4);
    assert.match(steps[0]!, /forecourt-harbour-park/);
    assert.match(steps[2]!, /mattgirvan\/desk-harbour-park/);
    assert.match(steps[3]!, /portal\.harbourpark\.example/);
  });
});

describe("fail-closed copy", () => {
  it("names GH_TEMPLATE_TOKEN", () => {
    assert.match(GH_TOKEN_MISSING, /GH_TEMPLATE_TOKEN/);
  });
});

describe("token helpers", () => {
  const keys = [...GH_TEMPLATE_TOKEN_KEYS];

  function clear() {
    for (const k of keys) delete process.env[k];
  }

  it("accepts documented aliases including NITRO_", () => {
    assert.deepEqual(
      [...GH_TEMPLATE_TOKEN_KEYS],
      [
        "GH_TEMPLATE_TOKEN",
        "GITHUB_TEMPLATE_TOKEN",
        "FORECOURT_GH_TEMPLATE_TOKEN",
        "GROK_GH_TEMPLATE_TOKEN",
        "NITRO_GH_TEMPLATE_TOKEN",
      ],
    );
  });

  it("isGhTemplateTokenConfigured reflects static aliases", () => {
    clear();
    assert.equal(isGhTemplateTokenConfigured(), false);
    assert.throws(() => requireGhTemplateToken(), (e: unknown) => {
      return e instanceof Error && e.message === GH_TOKEN_MISSING;
    });

    process.env.GROK_GH_TEMPLATE_TOKEN = "  test-token  ";
    assert.equal(isGhTemplateTokenConfigured(), true);
    assert.equal(requireGhTemplateToken(), "test-token");
    clear();

    process.env.GH_TEMPLATE_TOKEN = "primary";
    assert.equal(requireGhTemplateToken(), "primary");
    clear();

    process.env.NITRO_GH_TEMPLATE_TOKEN = "nitro-path";
    assert.equal(requireGhTemplateToken(), "nitro-path");
    clear();
  });

  it("listStaffEnvKeyNames returns matching names only", () => {
    clear();
    process.env.GH_TEMPLATE_TOKEN = "secret-value-must-not-leak";
    process.env.VERCEL_ENV = "production";
    process.env.UNRELATED_FOO = "nope";
    const names = listStaffEnvKeyNames();
    assert.ok(names.includes("GH_TEMPLATE_TOKEN"));
    assert.ok(names.includes("VERCEL_ENV"));
    assert.ok(!names.includes("UNRELATED_FOO"));
    assert.ok(!names.some((n) => n.includes("secret")));
    // Never return values — only names.
    assert.deepEqual(
      names.filter((n) => n === "GH_TEMPLATE_TOKEN" || n === "VERCEL_ENV").sort(),
      ["GH_TEMPLATE_TOKEN", "VERCEL_ENV"],
    );
    delete process.env.VERCEL_ENV;
    delete process.env.UNRELATED_FOO;
    clear();
  });

  it("resolveGhTemplateToken reports env source", async () => {
    clear();
    process.env.FORECOURT_GH_TEMPLATE_TOKEN = "alias";
    const r = await resolveGhTemplateToken();
    assert.equal(r.source, "env");
    assert.equal(r.token, "alias");
    clear();
    const missing = await resolveGhTemplateToken();
    assert.equal(missing.source, "none");
    assert.equal(missing.token, undefined);
  });
});
