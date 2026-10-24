#!/usr/bin/env node
// Template catch-up DRY RUN. Read only, never writes anywhere.
//
//   node scripts/desk-template-catchup.mjs
//
// Lists every customer desk repo (mattgirvan/desk-*) and compares its
// supabase/migrations folder with the forecourt-desk template. Prints which
// desks are behind and which migration files they are missing. It does not
// push code, open PRs or touch any database. Uses the gh CLI login.
import { execFileSync } from "node:child_process";

const OWNER = "mattgirvan";
const TEMPLATE = "forecourt-desk";

function gh(path) {
  try {
    return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch {
    return null;
  }
}

function migrations(repo) {
  const list = gh(`repos/${OWNER}/${repo}/contents/supabase/migrations`);
  return Array.isArray(list) ? list.filter((f) => f.name.endsWith(".sql")).map((f) => ({ name: f.name, sha: f.sha })) : null;
}

export function compare(template, desk) {
  const have = new Map(desk.map((f) => [f.name, f.sha]));
  const missing = template.filter((f) => !have.has(f.name)).map((f) => f.name);
  const changed = template.filter((f) => have.has(f.name) && have.get(f.name) !== f.sha).map((f) => f.name);
  return { missing, changed };
}

function main() {
  const tmpl = migrations(TEMPLATE);
  if (!tmpl) {
    console.error(`Could not read ${OWNER}/${TEMPLATE}. Is gh signed in?`);
    process.exit(1);
  }
  const repos = (gh(`user/repos?per_page=100&affiliation=owner`) ?? [])
    .filter((r) => r.owner?.login === OWNER).map((r) => r.name)
    .filter((n) => n.startsWith("desk-"));
  console.log(`Template ${TEMPLATE}: ${tmpl.map((f) => f.name).join(", ")}`);
  if (!repos.length) {
    console.log("Customer desks found: 0. Nothing to catch up.");
    return;
  }
  let behind = 0;
  for (const repo of repos) {
    const have = migrations(repo);
    if (!have) {
      console.log(`${repo}: could not read supabase/migrations, check by hand`);
      behind++;
      continue;
    }
    const { missing, changed } = compare(tmpl, have);
    if (!missing.length && !changed.length) console.log(`${repo}: up to date`);
    else {
      behind++;
      console.log(`${repo}: missing ${missing.join(", ") || "none"}, different ${changed.join(", ") || "none"}`);
    }
  }
  console.log(`Customer desks found: ${repos.length}, behind the template: ${behind}. Dry run, nothing changed.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
