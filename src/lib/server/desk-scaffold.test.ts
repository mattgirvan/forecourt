import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DESK_OWNER,
  DESK_TEMPLATE_REPO,
  deskHtmlUrl,
  deskRepoName,
  GH_TOKEN_MISSING,
  nextHumanSteps,
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
