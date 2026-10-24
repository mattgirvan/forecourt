import { ROLES, type Role } from "./roles.ts";

/**
 * Roles page (redesign slice 13). "What each role can do" is read from ROLES,
 * the one source of truth for the desk. There is no per account column for
 * custom access yet, so the switches show the access and do not change it.
 */
export const ROLE_ABILITIES = [
  { id: "stock", label: "See stock and prices", has: (r: Role) => (r.tabs as readonly string[]).includes("stock") },
  { id: "deals", label: "Edit deals and quotes", has: (r: Role) => (r.tabs as readonly string[]).includes("pipeline") && r.id !== "progressor" },
  { id: "customer", label: "See customer details", has: (r: Role) => (r.tabs as readonly string[]).includes("customer") },
  { id: "gp", label: "See GP and margins", has: (r: Role) => r.seesGp === "Yes" },
  { id: "month", label: "See month end numbers", has: (r: Role) => (r.tabs as readonly string[]).includes("overview") && r.id !== "sales" },
] as const;

export type StaffEntry = { name?: string; role?: string; email?: string; site?: string };

export function parseStaff(json: string | null | undefined): StaffEntry[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? (v as StaffEntry[]) : [];
  } catch {
    return [];
  }
}

export function roleName(id: string | undefined) {
  return ROLES.find((r) => r.id === id)?.label ?? (id ? id.charAt(0).toUpperCase() + id.slice(1) : "Role");
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** One row per role on the plan: filled when the staff list names someone for it. */
export function roleSlots(seats: readonly { id: string }[], staff: StaffEntry[]) {
  const pool = staff.filter((s) => (s.name ?? "").trim() || (s.email ?? "").trim());
  const used = new Set<number>();
  const slots = seats.map((seat) => {
    const i = pool.findIndex((s, j) => !used.has(j) && s.role === seat.id);
    if (i >= 0) used.add(i);
    return { role: seat.id, person: i >= 0 ? pool[i] : null };
  });
  const extra = pool.filter((_, j) => !used.has(j)).map((p) => ({ role: p.role ?? "", person: p }));
  const all = [...slots.filter((x) => x.person), ...extra, ...slots.filter((x) => !x.person)];
  const filled = all.filter((s) => s.person).length;
  return { slots: all, filled, total: all.length, label: `${filled} of ${all.length} roles filled` };
}
