import { BRANDS, type BrandId } from "@/lib/brands";
import { FEATURES, INGEST, defaultFeaturesFor, normalizeBilling, normalizePlan, type BillingKind, type PlanId } from "@/lib/catalog";

export const BUILD_STAGES = [
  {
    id: "paid",
    label: "Paid",
    n: "01",
    customer: "We’ve got the order.",
    staff: "Money in. Open the file and start the pack.",
  },
  {
    id: "brief",
    label: "Brief",
    n: "02",
    customer: "A few things we still need from you.",
    staff: "Book the call. Colours, people, domain, ingest.",
  },
  {
    id: "pack",
    label: "Pack",
    n: "03",
    customer: "We’re putting your name on the desk.",
    staff: "Fill tenant.json. This is the product, not App.jsx.",
  },
  {
    id: "build",
    label: "Build",
    n: "04",
    customer: "Your desk is being stood up. New database, your colours.",
    staff: "Clone forecourt-desk, new Supabase, Vercel. Never clone Aberdeen.",
  },
  {
    id: "preview",
    label: "Preview",
    n: "05",
    customer: "Have a click. Tell us if it’s you.",
    staff: "Preview URL. Not on their domain yet.",
  },
  {
    id: "live",
    label: "Live",
    n: "06",
    customer: "Your link. Staff sign in with a code.",
    staff: "Domain live. Logins sent. Done.",
  },
] as const;

export type BuildStage = (typeof BUILD_STAGES)[number]["id"];

export function isBuildStage(v: unknown): v is BuildStage {
  return BUILD_STAGES.some((s) => s.id === v);
}

export function stageIndex(id: string | null | undefined) {
  const i = BUILD_STAGES.findIndex((s) => s.id === id);
  return i < 0 ? -1 : i;
}

export function stageMeta(id: string | null | undefined) {
  if (!id || id === "briefing") {
    return { id: "briefing" as const, label: "Not started", n: "00", customer: "", staff: "" };
  }
  return BUILD_STAGES.find((s) => s.id === id) ?? BUILD_STAGES[0];
}

export type PackStaff = {
  name: string;
  email: string;
  role: string;
  site: string;
  franchise?: string;
};

export type TenantPack = {
  slug: string;
  name: string;
  legal: string;
  groupMark: string;
  phone: string;
  email: string;
  domain: string;
  sites: string[];
  franchise: {
    id: string;
    word: string;
    label: string;
    accent: string;
    glow: string;
    ink: string;
  };
  franchises: { id: string; word: string; sites?: string[] }[];
  ingest: string;
  features: Record<string, boolean>;
  staff: PackStaff[];
  seedDemo: false;
  brief: {
    logoReady: boolean;
    meetingPreference: string;
    customerNotes: string;
  };
};

export function emptyPack(): TenantPack {
  return {
    slug: "site",
    name: "",
    legal: "",
    groupMark: "",
    phone: "",
    email: "",
    domain: "",
    sites: ["Main"],
    franchise: {
      id: "independent",
      word: "INDEPENDENT",
      label: "Independent",
      accent: "#D9A24B",
      glow: "rgba(217, 162, 75, 0.36)",
      ink: "#20160A",
    },
    franchises: [],
    ingest: "excel",
    features: defaultFeaturesFor("site", "trial"),
    staff: [],
    seedDemo: false,
    brief: { logoReady: false, meetingPreference: "", customerNotes: "" },
  };
}

export function applyBrand(pack: TenantPack, id: string): TenantPack {
  const b = (BRANDS as Record<string, (typeof BRANDS)[BrandId]>)[id];
  if (!b) {
    return {
      ...pack,
      franchise: { ...emptyPack().franchise },
    };
  }
  return {
    ...pack,
    franchise: { id: b.id, word: b.word, label: b.label, accent: b.accent, glow: b.glow, ink: b.ink },
  };
}

export function parseSites(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw !== "string") return ["Main"];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    /* comma list */
  }
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : ["Main"];
}

export function parseStaff(raw: unknown): PackStaff[] {
  if (Array.isArray(raw)) {
    return raw.map((row) => {
      if (typeof row === "string") return { name: "", email: row, role: "sales", site: "Main" };
      const r = row as PackStaff;
      return {
        name: r.name ?? "",
        email: r.email ?? "",
        role: r.role ?? "sales",
        site: r.site ?? "Main",
        franchise: r.franchise,
      };
    });
  }
  if (typeof raw === "string") {
    try {
      return parseStaff(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

export function packFromTenant(t: {
  slug?: string | null;
  name?: string | null;
  legal?: string | null;
  group_name?: string | null;
  phone?: string | null;
  email?: string | null;
  domain?: string | null;
  sites?: string | null;
  features?: string | null;
  ingest?: string | null;
  plan?: string | null;
  billing?: string | null;
  staff_json?: string | null;
  principal_name?: string | null;
  pack_json?: string | null;
}): TenantPack {
  if (t.pack_json) {
    try {
      const parsed = JSON.parse(t.pack_json) as Partial<TenantPack>;
      if (parsed && parsed.name) return { ...emptyPack(), ...parsed, seedDemo: false, brief: { ...emptyPack().brief, ...parsed.brief } };
    } catch {
      /* fall through */
    }
  }
  const plan = normalizePlan(t.plan);
  const billing = normalizeBilling(plan, t.billing) as BillingKind;
  let features: Record<string, boolean> = defaultFeaturesFor(plan, billing);
  try {
    if (t.features) features = { ...features, ...(JSON.parse(t.features) as Record<string, boolean>) };
  } catch {
    /* keep */
  }
  const sites = parseSites(t.sites);
  const staff = parseStaff(t.staff_json);
  if (t.principal_name && !staff.some((s) => s.role === "principal" || s.role === "management")) {
    staff.unshift({ name: t.principal_name, email: t.email ?? "", role: plan === "group" ? "principal" : "management", site: sites[0] ?? "Main" });
  }
  const mark = (t.group_name || t.name || "FC")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return {
    ...emptyPack(),
    slug: t.slug || "site",
    name: t.name || "",
    legal: t.legal || "",
    groupMark: mark,
    phone: t.phone || "",
    email: t.email || "",
    domain: t.domain || "",
    sites,
    ingest: t.ingest || "excel",
    features,
    staff,
    seedDemo: false,
  };
}

export function tenantJson(pack: TenantPack) {
  const { brief: _b, ...rest } = pack;
  return rest;
}

/** Atlas glass tips — keep copy exact. */
export const PACK_GAP_TIPS = {
  domain: "Add the web address for your desk.",
  logo: "Add your logo (SVG or PNG).",
  franchise: "Pick your franchise colours.",
  staff: "Add at least one staff seat.",
  name: "Add your site name.",
  legal: "Add the legal entity name.",
  contact: "Add a phone number and inbox.",
  sites: "Add at least one site.",
  sitesGroup: "Add two or more sites for a group.",
  ingest: "Choose how stock will come in.",
  staffRoles: "Staff seats on a trial need a trial role (sales, management, host, or progressor).",
} as const;

export const PACK_GAPS_SUMMARY = "Add a web address and at least one staff seat before we can build.";
export const PACK_LOCKED_HELPER = "We'll unlock this when the pack has everything needed to build your desk.";
export const PACK_READY_HELPER = "Pack looks ready — send it when you want us to build.";

const TRIAL_ROLE_IDS = new Set(["sales", "management", "host", "progressor"]);

export function packGaps(
  pack: TenantPack,
  plan: PlanId = "site",
  billing: BillingKind = "subscription",
): string[] {
  const gaps: string[] = [];
  if (!pack.name.trim()) gaps.push(PACK_GAP_TIPS.name);
  if (!pack.domain.trim()) gaps.push(PACK_GAP_TIPS.domain);
  if (!pack.legal.trim()) gaps.push(PACK_GAP_TIPS.legal);
  if (!pack.phone.trim() || !pack.email.includes("@")) gaps.push(PACK_GAP_TIPS.contact);
  const sites = pack.sites.map((s) => s.trim()).filter(Boolean);
  if (sites.length === 0) gaps.push(PACK_GAP_TIPS.sites);
  if (plan === "group" && sites.length < 2) gaps.push(PACK_GAP_TIPS.sitesGroup);
  if (!pack.franchise.word.trim() || !pack.franchise.accent) gaps.push(PACK_GAP_TIPS.franchise);
  if (!pack.brief.logoReady) gaps.push(PACK_GAP_TIPS.logo);
  const staffOk = pack.staff.filter((s) => s.email.includes("@"));
  if (staffOk.length === 0) gaps.push(PACK_GAP_TIPS.staff);
  const trial = plan === "site" && billing === "trial";
  if (trial && staffOk.some((s) => !TRIAL_ROLE_IDS.has(s.role))) {
    gaps.push(PACK_GAP_TIPS.staffRoles);
  }
  if (!INGEST.some((i) => i.id === pack.ingest)) gaps.push(PACK_GAP_TIPS.ingest);
  return gaps;
}

/** Glass tip under the button: one tip, or the multi-gap summary. */
export function packGapsTip(gaps: string[]): string | null {
  if (gaps.length === 0) return null;
  if (gaps.length === 1) return gaps[0]!;
  return PACK_GAPS_SUMMARY;
}

export function packGapsHelper(gaps: string[]): string {
  return gaps.length === 0 ? PACK_READY_HELPER : PACK_LOCKED_HELPER;
}

export function brandOptions() {
  return (Object.keys(BRANDS) as BrandId[]).map((id) => {
    const b = BRANDS[id];
    return { id, label: b.label, word: b.word, accent: b.accent, glow: b.glow, ink: b.ink };
  });
}

export function featureList() {
  return FEATURES;
}

export function buildBriefMarkdown(pack: TenantPack, extras: { plan: string; billing: string; tenantId: number }) {
  const json = JSON.stringify(tenantJson(pack), null, 2);
  return `# Build ${pack.name}

Never clone Aberdeen. Template is mattgirvan/forecourt-desk.
Repo: desk-${pack.slug}
Plan: ${extras.plan} · ${extras.billing}
Control-plane tenant: ${extras.tenantId}

## Pack

\`\`\`json
${json}
\`\`\`

## Do this

1. \`gh repo create mattgirvan/desk-${pack.slug} --private --template mattgirvan/forecourt-desk\`
2. Drop the JSON above into \`tenant.json\`. \`seedDemo: false\`.
3. Logo at \`public/brand/logo.svg\` if they sent one.
4. New Supabase \`forecourt-${pack.slug}\`. Paste migrations \`0001\` → \`0004\` in order.
5. Insert staff_users from the pack. Magic link. Site URL = preview then their domain.
6. Vercel → custom domain \`${pack.domain || "portal.…"}\`.
7. Put the preview URL back on the order. Stage → Preview. They click around. Then Live.
`;
}
