/**
 * Bind seat (role / site) to the signed-in auth email.
 * Vault schema: staff_users.role, staff_users.site (stock.site is RLS — Vault owns).
 * Source of truth with Supabase:
 *   1. staff_me() RPC (role + site + franchise + display_name)
 *   2. staff_users SELECT by email (read-own policy)
 *   3. staff_role() RPC (role only) as last resort
 * Never a client dropdown.
 * Preview (no Supabase): Desk may offer a local Preview picker for wiring demos.
 *
 * Matt trial seats: sales, management, host, progressor.
 */
import { createContext, useContext } from "react";
import { tenant } from "../tenant";
import { ROLES, TRIAL_ROLES, normaliseStaff } from "../roles";
import { supabase } from "./supabase";

export const StaffSeatContext = createContext({
  mode: "loading",
  email: null,
  seat: null,
  session: null,
  error: "",
});

export function useStaffSeat() {
  return useContext(StaffSeatContext);
}

function tenantSeatByEmail(email) {
  const needle = String(email || "").trim().toLowerCase();
  if (!needle) return null;
  return (
    normaliseStaff(tenant.staff).find((s) => String(s.email || "").trim().toLowerCase() === needle) ||
    null
  );
}

/** Normalise staff_me / staff_users row into a plain object (or null). */
function asStaffRow(data) {
  if (!data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  return row;
}

/**
 * Resolve staff seat for the signed-in JWT user.
 * @returns {Promise<{
 *   mode: 'preview' | 'staff' | 'customer',
 *   email: string | null,
 *   seat: { email: string, name: string, role: string, site: string, franchise?: string, source: string } | null,
 *   error?: string,
 * }>}
 */
export async function loadStaffSeat() {
  if (!supabase) {
    return { mode: "preview", email: null, seat: null };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const email = session?.user?.email ? String(session.user.email).trim().toLowerCase() : null;
  if (!email) {
    return { mode: "customer", email: null, seat: null };
  }

  let row = null;
  let source = null;
  let lastErr = null;

  // 1. Prefer staff_me() — security-definer, full seat for JWT email (Vault 0004).
  {
    const { data, error } = await supabase.rpc("staff_me");
    if (!error) {
      row = asStaffRow(data);
      if (row) source = "staff_me";
    } else {
      lastErr = error;
    }
  }

  // 2. Fall back to staff_users SELECT by email (read-own policy also from Vault 0004).
  if (!row) {
    const { data, error } = await supabase
      .from("staff_users")
      .select("email, role, display_name, site, franchise")
      .eq("email", email)
      .maybeSingle();
    if (!error && data) {
      row = data;
      source = "staff_users";
    } else if (error) {
      lastErr = error;
    }
  }

  // 3. Fall back to staff_role() for role only when row/RPC missing.
  let rpcRole = null;
  let rpcErr = null;
  if (!ROLES[row?.role]) {
    const { data, error } = await supabase.rpc("staff_role");
    rpcErr = error;
    if (!error && data) rpcRole = String(data);
    if (error) lastErr = error;
  }

  const roleId = ROLES[row?.role] ? row.role : ROLES[rpcRole] ? rpcRole : null;
  if (!roleId) {
    return {
      mode: "customer",
      email,
      seat: null,
      error: lastErr
        ? String(lastErr.message || lastErr)
        : rpcErr
          ? String(rpcErr.message || rpcErr)
          : undefined,
    };
  }

  const fromTenant = tenantSeatByEmail(email);
  if (!source) source = "staff_role";

  return {
    mode: "staff",
    email,
    seat: {
      email: String(row?.email || email).trim().toLowerCase(),
      name: row?.display_name || fromTenant?.name || email,
      role: roleId,
      site: row?.site || fromTenant?.site || tenant.sites?.[0] || "Main",
      franchise: row?.franchise || fromTenant?.franchise,
      source,
    },
  };
}

/** Preview picker seats — trial four when tenant.staff is empty-ish. */
export function previewSeats() {
  const list = normaliseStaff(tenant.staff);
  const hasTrial = TRIAL_ROLES.every((r) => list.some((s) => s.role === r));
  if (hasTrial || list.length > 1) return list;
  // Template default: expose Matt trial seats for local Preview wiring.
  const site = tenant.sites?.[0] || "Main";
  return TRIAL_ROLES.map((role) => {
    const hit = list.find((s) => s.role === role);
    return (
      hit || {
        name: ROLES[role].label,
        email: `${role}@example.invalid`,
        role,
        site,
      }
    );
  });
}
