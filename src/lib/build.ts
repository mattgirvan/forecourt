import { BRANDS, type BrandId } from "@/lib/brands";
import { FEATURES, defaultFeaturesFor, normalizeBilling, normalizePlan, type BillingKind, type PlanId } from "@/lib/catalog";

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

export function packGaps(pack: TenantPack, plan: PlanId = "site"): string[] {
  const gaps: string[] = [];
  if (!pack.name.trim()) gaps.push("Dealership name");
  if (!pack.domain.trim()) gaps.push("The web address they want");
  if (!pack.franchise.word.trim() || !pack.franchise.accent) gaps.push("Primary franchise / colours");
  if (!pack.brief.logoReady) gaps.push("Logo (or go live on the group mark)");
  if (!pack.staff.some((s) => s.email.includes("@"))) gaps.push("At least one staff email");
  if (plan === "group" && pack.sites.length < 2) gaps.push("Two or more sites");
  if ((plan === "franchise" || plan === "group") && pack.ingest === "excel") {
    gaps.push("Manufacturer ingest — credentials, or keep Excel for week one");
  }
  return gaps;
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
4. New Supabase \`forecourt-${pack.slug}\`. Paste \`0001_core.sql\` then \`0002_roles.sql\`.
5. Insert staff_users from the pack. Magic link. Site URL = preview then their domain.
6. Vercel → custom domain \`${pack.domain || "portal.…"}\`.
7. Put the preview URL back on the order. Stage → Preview. They click around. Then Live.
`;
}
