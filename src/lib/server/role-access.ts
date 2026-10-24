/**
 * Per account role access (supabase/role-access.sql). Reads tolerate the
 * column not existing yet: the page then shows the defaults from roles.ts,
 * read only. Writes go through set_role_access(), which checks the caller
 * owns the account.
 */
import { createServerFn } from "@tanstack/react-start";
import { actor } from "@/lib/server/staff-actor";
import { roleAccessNotReady, sanitizeAccess, type RoleAccess } from "@/lib/role-grid";

export const getRoleAccess = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number }) => d)
  .handler(
    async ({ data }): Promise<{ ready: boolean; canEdit: boolean; access: RoleAccess | null }> => {
      const who = await actor(data.token);
      const { data: row, error } = await who.sb
        .from("tenants")
        .select("id, user_id, role_access")
        .eq("id", data.tenantId)
        .maybeSingle();
      if (error) {
        if (roleAccessNotReady(error)) return { ready: false, canEdit: false, access: null };
        throw new Error(error.message);
      }
      const t = row as { user_id: string | null; role_access: unknown } | null;
      if (!t) return { ready: true, canEdit: false, access: null };
      return {
        ready: true,
        canEdit: t.user_id === who.userId,
        access: sanitizeAccess(t.role_access),
      };
    },
  );

export const saveRoleAccess = createServerFn({ method: "POST" })
  .validator((d: { token: string; tenantId: number; access: RoleAccess }) => d)
  .handler(async ({ data }) => {
    const who = await actor(data.token);
    const access = sanitizeAccess(data.access);
    const { error } = await who.sb.rpc("set_role_access", {
      p_tenant_id: data.tenantId,
      p_access: access,
    });
    if (error) {
      if (roleAccessNotReady(error))
        throw new Error(
          "Saving role changes is not switched on yet. Message us and we will change it.",
        );
      throw new Error(
        /owner/i.test(error.message)
          ? "Only the account owner can change what a role can do."
          : "Could not save. Try again.",
      );
    }
    return { ok: true as const, access };
  });
