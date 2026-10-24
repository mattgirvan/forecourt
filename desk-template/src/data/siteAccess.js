/** Supabase side of sites: switcher feed and the Admin tab (0006_sites_admin.sql). */
import { supabase } from "./supabase";

export async function loadServerSiteAccess() {
  if (!supabase) return null;
  const [list, acc] = await Promise.all([supabase.rpc("my_site_list"), supabase.rpc("my_site_access")]);
  if (list.error || acc.error) return null; // 0006 not applied yet: behave as a legacy desk
  const a = Array.isArray(acc.data) ? acc.data[0] : acc.data;
  return {
    sites: list.data || [],
    allSites: Boolean(a?.all_sites),
    canSwitch: Boolean(a?.can_switch),
    scopingOn: Boolean(a?.scoping_on),
  };
}

export async function loadStaffSites() {
  const { data, error } = await supabase.rpc("admin_staff_list");
  if (error) throw error;
  return (data || []).map((r) => ({
    email: r.email,
    name: r.display_name || r.email,
    role: r.role,
    allSites: Boolean(r.all_sites),
    sites: r.sites || [],
  }));
}

export async function saveStaffSites(email, sites, allSites) {
  const { error } = await supabase.rpc("admin_set_staff_sites", {
    p_email: email,
    p_sites: sites,
    p_all_sites: Boolean(allSites),
  });
  if (error) throw error;
}

/** Archived sites an admin can still restore (30 days from archiving). */
export async function loadRestorableSites() {
  const { data, error } = await supabase.rpc("admin_restorable_sites");
  if (error) throw error;
  return (data || []).map((r) => ({ code: r.code, name: r.name, restoreUntil: r.restore_until }));
}

export async function restoreSite(code) {
  const { data, error } = await supabase.rpc("admin_restore_site", { p_code: code });
  if (error) throw error;
  return data;
}
