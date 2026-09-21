import nodeProcess from "node:process";

/**
 * Runtime env bag via `node:process` (not the free global).
 *
 * Vite's define plugin can replace bare `process.env` with `{}` when
 * `keepProcessEnv` is false. Dynamic `process.env[key]` then always misses
 * Vercel runtime secrets. Importing from `node:process` keeps a real Node
 * env object that serverless can populate at request time.
 */
function envBag(): NodeJS.ProcessEnv {
  return nodeProcess.env;
}

export function env(key: string): string | undefined {
  const v = envBag()[key]?.trim();
  return v || undefined;
}

/**
 * Prefer static property reads for secrets that must survive bundling.
 * Callers still fall through aliases via `env()` when needed.
 */
export function envStatic(
  ...keys: Array<keyof NodeJS.ProcessEnv | string>
): string | undefined {
  const bag = envBag();
  for (const key of keys) {
    const v = bag[key as string]?.trim();
    if (v) return v;
  }
  return undefined;
}

/**
 * Workspace preview vs deployed app. The deployer writes GROK_PROJECT_ID on
 * every publish; the sandbox preview never has it. Single source of truth for
 * the split — gate audience, gate endpoints and connector-token semantics all
 * key off this predicate.
 */
export function isWorkspacePreview(): boolean {
  return !env("GROK_PROJECT_ID");
}
