import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DESK_OWNER,
  DESK_TEMPLATE_REPO,
  deskHtmlUrl,
  deskRepoName,
  GH_TOKEN_MISSING,
  isGhTemplateTokenConfigured,
  nextHumanSteps,
  requireGhTemplateToken,
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
  const keys = [
    "GH_TEMPLATE_TOKEN",
    "GITHUB_TEMPLATE_TOKEN",
    "FORECOURT_GH_TEMPLATE_TOKEN",
    "GROK_GH_TEMPLATE_TOKEN",
  ] as const;

  function clear() {
    for (const k of keys) delete process.env[k];
  }

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
  });
});
