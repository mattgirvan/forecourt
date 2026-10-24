import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { ROLE_ABILITIES, initials, parseStaff, roleName, roleSlots } from "@/lib/role-grid";
import { rolesForPlan, type Role } from "@/lib/roles";
import type { BillingKind, PlanId } from "@/lib/catalog";

/** Roles (redesign slice 13): who fills each role, and what each role can do. */
export function RolesCard({
  plan,
  billing,
  staffJson,
  onInvite,
}: {
  plan: PlanId;
  billing: BillingKind;
  staffJson: string | null | undefined;
  onInvite: () => void;
}) {
  const roles = rolesForPlan(plan, billing) as readonly Role[];
  const { slots, label } = roleSlots(roles, parseStaff(staffJson));

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
                    {r.label.replace(/ \(.*\)$/, "").replace(/ \/.*$/, "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLE_ABILITIES.map((a) => (
                <tr key={a.id}>
                  <th scope="row">{a.label}</th>
                  {roles.map((r) => {
                    const on = a.has(r);
                    return (
                      <td key={r.id}>
                        <span
                          role="switch"
                          aria-checked={on}
                          aria-readonly="true"
                          aria-label={`${r.label}: ${a.label}`}
                          className="fc-switch"
                          data-on={on || undefined}
                        >
                          <span className="fc-switch-knob" />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          These match how we set up your desk. To change what a role can do, message us and we will
          update it.
        </p>
      </Section>
    </div>
  );
}
