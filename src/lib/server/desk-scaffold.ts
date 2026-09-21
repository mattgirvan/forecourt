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

/** Env keys accepted for the GitHub template PAT (static refs for bundlers). */
export const GH_TEMPLATE_TOKEN_KEYS = [
  "GH_TEMPLATE_TOKEN",
  "GITHUB_TEMPLATE_TOKEN",
  "FORECOURT_GH_TEMPLATE_TOKEN",
  "GROK_GH_TEMPLATE_TOKEN",
] as const;

export type ScaffoldResult = {
  owner: string;
  repo: string;
  htmlUrl: string;
  created: boolean;
  tenantJsonWritten: boolean;
  logoWritten: boolean;
};

type GhFile = { sha: string; content?: string };

/**
 * Read the GitHub template token at request time.
 *
 * - Reads via `node:process` (not bare `process.env`) so Vite cannot replace
 *   the env object with an empty `{}` snapshot when `keepProcessEnv` is off.
 * - Uses static property names (`env.GH_TEMPLATE_TOKEN`, …) so bundlers that
 *   only keep statically referenced keys still see the Vercel secret.
 * Never log or echo the secret to the client.
 */
function readGhToken(): string | undefined {
  const env = nodeProcess.env;
  const candidates = [
    env.GH_TEMPLATE_TOKEN,
    env.GITHUB_TEMPLATE_TOKEN,
    env.FORECOURT_GH_TEMPLATE_TOKEN,
    env.GROK_GH_TEMPLATE_TOKEN,
  ];
  for (const raw of candidates) {
    const v = raw?.trim();
    if (v) return v;
  }
  return undefined;
}

/** Staff UI only — yes/no, never the secret. */
export function isGhTemplateTokenConfigured(): boolean {
  return Boolean(readGhToken());
}

/** Fail closed — never pretend a desk was stood up without a token. */
export function requireGhTemplateToken(): string {
  const t = readGhToken();
  if (!t) throw new Error(GH_TOKEN_MISSING);
  return t;
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
  const token = requireGhTemplateToken();
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
