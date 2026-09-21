/**
 * Phase 1 desk scaffold: create desk-<slug> from mattgirvan/forecourt-desk
 * and write the locked tenant.json. No Supabase / Vercel yet.
 */
import nodeProcess from "node:process";
import { tenantJson, type TenantPack } from "@/lib/build";

export const DESK_TEMPLATE_OWNER = "mattgirvan";
export const DESK_TEMPLATE_REPO = "forecourt-desk";
export const DESK_OWNER = "mattgirvan";

export const GH_TOKEN_MISSING =
  "Desk scaffold is not configured. Set GH_TEMPLATE_TOKEN on the server (Vercel) with permission to create private repos from the forecourt-desk template.";

/**
 * Env keys accepted for the GitHub template PAT.
 * Prefer unprefixed Vercel secrets; NITRO_GH_TEMPLATE_TOKEN is the Nitro
 * runtimeConfig path (Vercel Vite+Nitro docs).
 */
export const GH_TEMPLATE_TOKEN_KEYS = [
  "GH_TEMPLATE_TOKEN",
  "GITHUB_TEMPLATE_TOKEN",
  "FORECOURT_GH_TEMPLATE_TOKEN",
  "GROK_GH_TEMPLATE_TOKEN",
  "NITRO_GH_TEMPLATE_TOKEN",
] as const;

/** Staff diagnostic: only surface keys whose names match this. Never values. */
export const STAFF_ENV_DIAG_RE = /GH|TOKEN|GROK|VERCEL|SUPABASE/i;

/** Control-plane app_settings key for optional PAT fallback (service-role only). */
export const GH_TEMPLATE_TOKEN_SETTING_KEY = "GH_TEMPLATE_TOKEN";

export type ScaffoldResult = {
  owner: string;
  repo: string;
  htmlUrl: string;
  created: boolean;
  tenantJsonWritten: boolean;
  logoWritten: boolean;
};

export type GhTokenSource = "env" | "supabase" | "none";

type GhFile = { sha: string; content?: string };

function envBag(): NodeJS.ProcessEnv {
  // Prefer the live Node process bag. Avoid bare `process.env` so Vite cannot
  // replace the identifier with `{}` when keepProcessEnv is off on an env.
  return (globalThis as { process?: NodeJS.Process }).process?.env ?? nodeProcess.env;
}

function firstNonEmpty(...candidates: Array<string | undefined | null>): string | undefined {
  for (const raw of candidates) {
    const v = raw?.trim();
    if (v) return v;
  }
  return undefined;
}

/**
 * Static + dynamic reads of the template PAT from process.env.
 *
 * - Static property names survive bundlers that only keep referenced keys.
 * - Dynamic `bag[key]` survives when a define plugin inlined static members
 *   to undefined at build time while the live bag still has the secret.
 */
function readGhTokenFromProcessEnv(): string | undefined {
  const bag = envBag();
  const staticHit = firstNonEmpty(
    bag.GH_TEMPLATE_TOKEN,
    bag.GITHUB_TEMPLATE_TOKEN,
    bag.FORECOURT_GH_TEMPLATE_TOKEN,
    bag.GROK_GH_TEMPLATE_TOKEN,
    bag.NITRO_GH_TEMPLATE_TOKEN,
  );
  if (staticHit) return staticHit;

  for (const key of GH_TEMPLATE_TOKEN_KEYS) {
    const v = bag[key]?.trim();
    if (v) return v;
  }
  return undefined;
}

/**
 * Optional fail-closed fallback: service-role read of control-plane app_settings.
 * Only used when process.env / Nitro do not expose the PAT. Never returns a
 * value if the service role key is missing or the row is empty.
 */
async function readGhTokenFromSupabase(): Promise<string | undefined> {
  // Lazy imports so unit tests never need Vite `import.meta.env` / Supabase.
  const { env } = await import("@/lib/env.server");
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? env("GROK_SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return undefined;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL } = await import("@/lib/sb");
    const sb = createClient(SUPABASE_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb
      .from("app_settings")
      .select("value")
      .eq("key", GH_TEMPLATE_TOKEN_SETTING_KEY)
      .maybeSingle();
    if (error || !data) return undefined;
    const v = typeof data.value === "string" ? data.value.trim() : "";
    return v || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read the GitHub template token at request time.
 * Order: process.env (static+dynamic aliases, incl. NITRO_) → (async) Supabase app_settings.
 * Never log or echo the secret to the client.
 */
function readGhTokenSync(): { token?: string; source: GhTokenSource } {
  const fromEnv = readGhTokenFromProcessEnv();
  if (fromEnv) return { token: fromEnv, source: "env" };
  return { source: "none" };
}

export async function resolveGhTemplateToken(): Promise<{
  token?: string;
  source: GhTokenSource;
}> {
  const sync = readGhTokenSync();
  if (sync.token) return sync;
  const fromSb = await readGhTokenFromSupabase();
  if (fromSb) return { token: fromSb, source: "supabase" };
  return { source: "none" };
}

/** Staff UI only — yes/no, never the secret. */
export function isGhTemplateTokenConfigured(): boolean {
  return Boolean(readGhTokenSync().token);
}

/**
 * Staff-only diagnostic: names (never values) of process.env keys matching
 * STAFF_ENV_DIAG_RE. Helps tell "Vercel never injected the secret" from
 * "bundler emptied the bag" from "only NITRO_/system keys present".
 */
export function listStaffEnvKeyNames(): string[] {
  const bag = envBag();
  const names: string[] = [];
  for (const key of Object.keys(bag)) {
    if (STAFF_ENV_DIAG_RE.test(key)) names.push(key);
  }
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

export function ghTokenSourceLabel(): GhTokenSource {
  return readGhTokenSync().source;
}

/** Fail closed — never pretend a desk was stood up without a token. */
export function requireGhTemplateToken(): string {
  const { token } = readGhTokenSync();
  if (!token) throw new Error(GH_TOKEN_MISSING);
  return token;
}

/** Async fail-closed (includes optional Supabase fallback). */
export async function requireGhTemplateTokenAsync(): Promise<string> {
  const { token } = await resolveGhTemplateToken();
  if (!token) throw new Error(GH_TOKEN_MISSING);
  return token;
}

export function deskRepoName(slug: string): string {
  const clean = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `desk-${clean || "site"}`;
}

export function deskHtmlUrl(repo: string): string {
  return `https://github.com/${DESK_OWNER}/${repo}`;
}

async function gh(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`https://api.github.com${path}`, { ...init, headers });
}

async function repoExists(token: string, repo: string): Promise<boolean> {
  const res = await gh(token, `/repos/${DESK_OWNER}/${repo}`);
  if (res.status === 404) return false;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub could not check ${repo}: ${res.status} ${body.slice(0, 200)}`);
  }
  return true;
}

async function createFromTemplate(token: string, repo: string): Promise<void> {
  const res = await gh(token, `/repos/${DESK_TEMPLATE_OWNER}/${DESK_TEMPLATE_REPO}/generate`, {
    method: "POST",
    body: JSON.stringify({
      owner: DESK_OWNER,
      name: repo,
      private: true,
      include_all_branches: false,
    }),
  });
  if (res.status === 201 || res.status === 202) return;
  if (res.status === 422 && (await repoExists(token, repo))) return;
  const body = await res.text();
  throw new Error(
    `Could not create ${repo} from ${DESK_TEMPLATE_OWNER}/${DESK_TEMPLATE_REPO}: ${res.status} ${body.slice(0, 300)}`,
  );
}

async function waitForRepo(token: string, repo: string, attempts = 20): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (await repoExists(token, repo)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for ${repo} to appear after template generate.`);
}

function contentsPath(path: string): string {
  return path
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
}

async function getFile(token: string, repo: string, path: string): Promise<GhFile | null> {
  const res = await gh(token, `/repos/${DESK_OWNER}/${repo}/contents/${contentsPath(path)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Could not read ${path} in ${repo}: ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as GhFile;
}

async function putFile(
  token: string,
  repo: string,
  path: string,
  content: string | Buffer,
  message: string,
): Promise<void> {
  const existing = await getFile(token, repo, path);
  const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const body: Record<string, string> = {
    message,
    content: bytes.toString("base64"),
  };
  if (existing?.sha) body.sha = existing.sha;
  const res = await gh(token, `/repos/${DESK_OWNER}/${repo}/contents/${contentsPath(path)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not write ${path} to ${repo}: ${res.status} ${text.slice(0, 300)}`);
  }
}

/** Optional logo: pack.brief.logoUrl as https URL or data: URL. */
export async function resolveLogoBytes(
  pack: TenantPack,
): Promise<{ bytes: Buffer; path: string } | null> {
  const brief = pack.brief as TenantPack["brief"] & { logoUrl?: string };
  const url = typeof brief.logoUrl === "string" ? brief.logoUrl.trim() : "";
  if (!url) return null;

  if (url.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.+)$/i.exec(url);
    if (!m) return null;
    const mime = m[1]!.toLowerCase();
    const ext = mime.includes("png")
      ? "png"
      : mime.includes("jpeg") || mime.includes("jpg")
        ? "jpg"
        : "svg";
    return { bytes: Buffer.from(m[2]!, "base64"), path: `public/brand/logo.${ext}` };
  }

  if (!/^https:\/\//i.test(url)) return null;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 2_000_000) return null;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const ext = ct.includes("png")
    ? "png"
    : ct.includes("jpeg") || ct.includes("jpg")
      ? "jpg"
      : url.toLowerCase().endsWith(".png")
        ? "png"
        : url.toLowerCase().endsWith(".jpg") || url.toLowerCase().endsWith(".jpeg")
          ? "jpg"
          : "svg";
  return { bytes: buf, path: `public/brand/logo.${ext}` };
}

export async function scaffoldDeskRepo(pack: TenantPack): Promise<ScaffoldResult> {
  const token = await requireGhTemplateTokenAsync();
  const repo = deskRepoName(pack.slug);
  const existed = await repoExists(token, repo);
  let created = false;
  if (!existed) {
    await createFromTemplate(token, repo);
    await waitForRepo(token, repo);
    created = true;
  }

  const json = `${JSON.stringify(tenantJson(pack), null, 2)}\n`;
  await putFile(
    token,
    repo,
    "tenant.json",
    json,
    created
      ? `Lock brand pack for ${pack.name || pack.slug}`
      : `Update brand pack for ${pack.name || pack.slug}`,
  );

  let logoWritten = false;
  try {
    const logo = await resolveLogoBytes(pack);
    if (logo) {
      await putFile(
        token,
        repo,
        logo.path,
        logo.bytes,
        `Add brand logo for ${pack.name || pack.slug}`,
      );
      logoWritten = true;
    }
  } catch {
    /* logo is optional */
  }

  return {
    owner: DESK_OWNER,
    repo,
    htmlUrl: deskHtmlUrl(repo),
    created,
    tenantJsonWritten: true,
    logoWritten,
  };
}

export function nextHumanSteps(slug: string, domain: string): string[] {
  const repo = deskRepoName(slug);
  return [
    `Create a new Supabase project named forecourt-${slug} (never reuse Aberdeen).`,
    `Paste desk migrations 0001 → 0004 in order, then insert staff_users from tenant.json.`,
    `Link Vercel to ${DESK_OWNER}/${repo}, set Supabase env, deploy.`,
    `Point custom domain ${domain || "portal.…"} and paste the preview URL back on this order.`,
  ];
}
