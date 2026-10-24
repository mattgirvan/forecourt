import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import {
  ROLE_ABILITIES,
  canDo,
  initials,
  parseStaff,
  roleName,
  roleSlots,
  toggleAccess,
  type RoleAccess,
} from "@/lib/role-grid";
import { getRoleAccess, saveRoleAccess } from "@/lib/server/role-access";
import { cn } from "@/lib/utils";
import { rolesForPlan, type Role } from "@/lib/roles";
import type { BillingKind, PlanId } from "@/lib/catalog";

/** Roles (redesign slice 13): who fills each role, and what each role can do. */
export function RolesCard({
  token,
  tenantId,
  plan,
  billing,
  staffJson,
  onInvite,
}: {
  token: string;
  tenantId: number;
  plan: PlanId;
  billing: BillingKind;
  staffJson: string | null | undefined;
  onInvite: () => void;
}) {
  const roles = rolesForPlan(plan, billing) as readonly Role[];
  const { slots, label } = roleSlots(roles, parseStaff(staffJson));
  const [access, setAccess] = useState<RoleAccess | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    // Before supabase/role-access.sql runs this returns ready: false, so the
    // defaults show read only.
    getRoleAccess({ data: { token, tenantId } })
      .then((r) => {
        if (!live) return;
        setAccess(r.access);
        setCanEdit(r.ready && r.canEdit);
      })
      .catch(() => {
        if (live) setCanEdit(false);
      });
    return () => {
      live = false;
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, [token, tenantId]);

  async function flip(role: Role, abilityId: string, on: boolean) {
    if (!canEdit) return;
    const before = access;
    const next = toggleAccess(access, role, abilityId, on);
    setAccess(next);
    setErr(null);
    setSaved(false);
    try {
      await saveRoleAccess({ data: { token, tenantId, access: next ?? {} } });
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setAccess(before);
      setErr(e instanceof Error ? e.message : "Could not save. Try again.");
    }
  }

  return (
    <div className="fc-roles" data-testid="roles-card">
      <Section title="People" eyebrow="Roles" rail="slate" count={label.split(" roles")[0]}>
        <p className="text-sm text-muted">
          {label}. Each person signs in to your desk with their own email.
        </p>
        <ul className="mt-4 space-y-2">
          {slots.map((s, i) =>
            s.person ? (
              <li key={i} className="fc-role-row">
                <span className="fc-avatar" aria-hidden="true">
                  {initials(s.person.name || s.person.email || "")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {s.person.name || s.person.email}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[roleName(s.role), s.person.site].filter(Boolean).join(", ")}
                  </span>
                </span>
              </li>
            ) : (
              <li key={i} className="fc-role-row is-open">
                <span className="fc-avatar is-open" aria-hidden="true">
                  +
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-muted">Open role</span>
                  <span className="block truncate text-xs text-muted">{roleName(s.role)}</span>
                </span>
                <Button variant="secondary" className="min-h-11" onClick={onInvite}>
                  Invite
                </Button>
              </li>
            ),
          )}
        </ul>
        <div className="fc-roles-dock">
          <Button className="min-h-11 w-full sm:w-auto" onClick={onInvite}>
            Add a role
          </Button>
        </div>
      </Section>

      <Section title="What each role can do" eyebrow="Access" rail="slate">
        <div className="fc-role-grid-wrap">
          <table className="fc-role-grid">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">What they can do</span>
                </th>
                {roles.map((r) => (
                  <th key={r.id} scope="col">
                    {r.label.split(/ \(| \/| or /)[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLE_ABILITIES.map((a) => (
                <tr key={a.id}>
                  <th scope="row">{a.label}</th>
                  {roles.map((r) => {
                    const on = canDo(r, a.id, access);
                    return (
                      <td key={r.id}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={`${r.label}: ${a.label}`}
                          aria-readonly={canEdit ? undefined : true}
                          disabled={!canEdit}
                          className={cn("fc-role-switch", on && "is-on")}
                          onClick={() => void flip(r, a.id, !on)}
                        >
                          <span className="fc-switch-track" aria-hidden="true">
                            <span className="fc-switch-thumb" />
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p
          className="mt-3 min-h-5 text-xs text-[var(--fc-text-faint)]"
          role="status"
          aria-live="polite"
        >
          {err ??
            (saved
              ? "Saved"
              : canEdit
                ? "Changes save as you go and apply the next time someone opens the desk."
                : "Only the account owner can change what a role can do.")}
        </p>
      </Section>
    </div>
  );
}
