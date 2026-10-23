/**
 * Manager access to a dealer's Forecourt account (supabase/manager-access.sql).
 * The owner invites managers by email; a manager signs in with an email code
 * as that address and sees plan, billing summary, tickets and change requests.
 * Managers never open Stripe billing and never manage access.
 */
import { createServerFn } from "@tanstack/react-start";
import { actor } from "@/lib/server/staff-actor";
import { sendManagerInviteEmail } from "@/lib/server/journey-email";

export type AccountMember = { id: number; email: string; status: "invited" | "active"; created_at: string; accepted_at: string | null };

function missingTable(err: { code?: string; message?: string } | null | undefined) {
  if (!err) return false;
  return err.code === "42P01" || err.code === "42883" || err.code === "PGRST202" || err.code === "PGRST205" || /does not exist|could not find/i.test(err.message ?? "");
}

const NOT_READY = "Account access is not switched on yet. Message us and we will add them for you.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function ownerOf(token: string, tenantId: number) {
  const who = await actor(token);
  const { data, error } = await who.sb.from("tenants").select("id, user_id, name").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  const t = data as { id: number; user_id: string; name: string | null } | null;
  if (!t || (!who.team && t.user_id !== who.userId)) throw new Error("Only the account owner can manage access.");
  return { who, t };
}

/** Owner (or team): who has access to this account. */
export const listAccountMembers = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(async ({ data }): Promise<{ ready: boolean; members: AccountMember[] }> => {
    const { who, t } = await ownerOf(data.token, data.tenantId);
    const { data: rows, error } = await who.sb
      .from("tenant_members")
      .select("id, email, status, created_at, accepted_at")
      .eq("tenant_id", t.id)
      .order("created_at", { ascending: true });
    if (error) {
      if (missingTable(error)) return { ready: false, members: [] };
      throw new Error(error.message);
    }
    return { ready: true, members: (rows ?? []) as AccountMember[] };
  });

/** Owner only: invite a manager by email and send the invite through the email engine. */
export const inviteManager = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number; email: string }) => d)
  .handler(async ({ data }) => {
    const { who, t } = await ownerOf(data.token, data.tenantId);
    const email = data.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new Error("Enter a full email address.");
    if (who.email && email === who.email.toLowerCase()) throw new Error("That is you. You already have access.");
    const { data: row, error } = await who.sb
      .from("tenant_members")
      .insert({ tenant_id: t.id, email, role: "manager", status: "invited", invited_by: who.email ?? "" })
      .select("id")
      .single();
    if (error) {
      if (missingTable(error)) throw new Error(NOT_READY);
      if (error.code === "23505") throw new Error("They already have access or an invite.");
      throw new Error(error.message);
    }
    const sent = await sendManagerInviteEmail({ tenantId: t.id, memberId: (row as { id: number }).id, to: email, invitedBy: who.email ?? "" });
    return { ok: true, emailed: Boolean(sent && sent.sent) };
  });

/** Owner only: remove a manager or cancel an invite. Access ends on their next request. */
export const removeAccountMember = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number; memberId: number }) => d)
  .handler(async ({ data }) => {
    const { who, t } = await ownerOf(data.token, data.tenantId);
    const { error } = await who.sb.from("tenant_members").delete().eq("id", data.memberId).eq("tenant_id", t.id);
    if (error) throw new Error(missingTable(error) ? NOT_READY : error.message);
    return { ok: true };
  });

/**
 * Any signed in user: link pending invites for their verified email, then
 * list the accounts they manage (not own). Empty before the SQL is run.
 */
export const listManagedTenants = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const who = await actor(data.token);
    const accepted = await who.sb.rpc("accept_tenant_invites");
    if (accepted.error && !missingTable(accepted.error)) console.error("[members] accept failed", accepted.error.message);
    const ids = await who.sb.rpc("my_member_tenant_ids");
    if (ids.error) return [];
    const list = ((ids.data ?? []) as (number | { my_member_tenant_ids: number })[]).map((x) => (typeof x === "number" ? x : x.my_member_tenant_ids));
    if (!list.length) return [];
    const { data: rows } = await who.sb
      .from("tenants")
      .select("id, name, plan, status, billing, site_count, stage, principal_name, domain")
      .in("id", list);
    return (rows ?? []) as {
      id: number;
      name: string;
      plan: string;
      status: string;
      billing: string | null;
      site_count: number | null;
      stage: string | null;
      principal_name: string | null;
      domain: string | null;
    }[];
  });
