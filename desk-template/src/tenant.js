import raw from "../tenant.json";

export const tenant = raw;

export function groupMark() {
  if (tenant.groupMark) return String(tenant.groupMark).toUpperCase();
  const stop = new Set([
    "motor",
    "motors",
    "group",
    "company",
    "co",
    "ltd",
    "limited",
    "the",
    "automotive",
    "cars",
    "plc",
  ]);
  const words = String(tenant.name || "You")
    .replace(/[.,+]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !stop.has(w.toLowerCase()));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] || "YOU").slice(0, 2).toUpperCase();
}

export function featureOn(id) {
  return tenant.features?.[id] !== false;
}

export function applyBrand(root = document.documentElement) {
  const f = tenant.franchise || {};
  root.style.setProperty("--accent", f.accent || "#D9A24B");
  root.style.setProperty("--accent-ink", f.ink || "#20160A");
  root.style.setProperty("--glow", f.glow || "rgba(217, 162, 75, 0.36)");
}
