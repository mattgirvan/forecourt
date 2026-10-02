/** A new checkout expires older open sessions for the same site. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { expireOpenSessions } from "./checkout-sessions.ts";

function fake(statuses: Record<string, string>, failOn: string[] = []) {
  const expired: string[] = [];
  return {
    expired,
    deps: {
      retrieve: async (id: string) => {
        if (failOn.includes(id)) throw new Error("No such checkout.session");
        return { id, status: statuses[id] ?? "open" };
      },
      expire: async (id: string) => void expired.push(id),
      log: { warn: () => {} },
    },
  };
}

test("only open sessions are expired; complete and expired ones are left alone", async () => {
  const f = fake({ cs_open: "open", cs_done: "complete", cs_old: "expired" });
  const r = await expireOpenSessions(f.deps, ["cs_open", "cs_done", "cs_old"]);
  assert.deepEqual(f.expired, ["cs_open"]);
  assert.deepEqual(r, { expired: ["cs_open"], skipped: ["cs_done", "cs_old"], failed: [] });
});

test("never throws, skips blanks, non-session ids and repeats", async () => {
  const f = fake({}, ["cs_gone"]);
  const r = await expireOpenSessions(f.deps, [null, "", "preview-1", "cs_gone", "cs_a", "cs_a"]);
  assert.deepEqual(f.expired, ["cs_a"]);
  assert.deepEqual(r.failed, ["cs_gone"]);
});
