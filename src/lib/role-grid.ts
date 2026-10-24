import { ROLES, type Role } from "./roles.ts";

/**
 * Roles page (redesign slice 13). "What each role can do" is read from ROLES,
 * the one source of truth for the desk. An owner can override any switch per
 * account (tenants.role_access, supabase/role-access.sql); only changed keys
 * are stored and anything missing falls back to these defaults.
 */
export const ROLE_ABILITIES = [
  {
    id: "stock",
    label: "See stock and prices",
    has: (r: Role) => (r.tabs as readonly string[]).includes("stock"),
  },
  {
    id: "deals",
    label: "Edit deals and quotes",
    has: (r: Role) => (r.tabs as readonly string[]).includes("pipeline") && r.id !== "progressor",
  },
  {
    id: "customer",
    label: "See customer details",
    has: (r: Role) => (r.tabs as readonly string[]).includes("customer"),
  },
  { id: "gp", label: "See GP and margins", has: (r: Role) => r.seesGp === "Yes" },
  {
    id: "month",
    label: "See month end numbers",
    has: (r: Role) => (r.tabs as readonly string[]).includes("overview") && r.id !== "sales",
  },
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
  return (
    ROLES.find((r) => r.id === id)?.label ??
    (id ? id.charAt(0).toUpperCase() + id.slice(1) : "Role")
  );
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
  return {
    slots: all,
    filled,
    total: all.length,
    label: `${filled} of ${all.length} roles filled`,
  };
}

export type RoleAccess = Record<string, Record<string, boolean>>;

const ABILITY_IDS = new Set<string>(ROLE_ABILITIES.map((a) => a.id));
const ROLE_IDS = new Set<string>(ROLES.map((r) => r.id));

/** Keep only known roles, known abilities and real booleans. */
export function sanitizeAccess(v: unknown): RoleAccess | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: RoleAccess = {};
  for (const [role, abilities] of Object.entries(v as Record<string, unknown>)) {
    if (
      !ROLE_IDS.has(role) ||
      !abilities ||
      typeof abilities !== "object" ||
      Array.isArray(abilities)
    )
      continue;
    for (const [ability, on] of Object.entries(abilities as Record<string, unknown>)) {
      if (!ABILITY_IDS.has(ability) || typeof on !== "boolean") continue;
      (out[role] ??= {})[ability] = on;
    }
  }
  return Object.keys(out).length ? out : null;
}

export function canDo(role: Role, abilityId: string, access: RoleAccess | null | undefined) {
  const o = access?.[role.id]?.[abilityId];
  if (typeof o === "boolean") return o;
  return ROLE_ABILITIES.find((a) => a.id === abilityId)?.has(role) ?? false;
}

/** New access after one switch; a value equal to the default is dropped. */
export function toggleAccess(
  access: RoleAccess | null | undefined,
  role: Role,
  abilityId: string,
  on: boolean,
): RoleAccess | null {
  const next: RoleAccess = structuredClone(access ?? {});
  const def = ROLE_ABILITIES.find((a) => a.id === abilityId)?.has(role) ?? false;
  if (on === def) {
    if (next[role.id]) {
      delete next[role.id][abilityId];
      if (!Object.keys(next[role.id]).length) delete next[role.id];
    }
  } else {
    (next[role.id] ??= {})[abilityId] = on;
  }
  return Object.keys(next).length ? next : null;
}

/** The column or the function is missing because role-access.sql has not run. */
export function roleAccessNotReady(err: { code?: string; message?: string } | null | undefined) {
  if (!err) return false;
  return (
    err.code === "42703" ||
    err.code === "42883" ||
    err.code === "PGRST202" ||
    err.code === "PGRST204" ||
    /role_access|set_role_access|does not exist|could not find/i.test(err.message ?? "")
  );
}
