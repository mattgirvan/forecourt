import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { PillRow } from "@/components/ui/pill-row";
import { Section } from "@/components/ui/section";
import { initials } from "@/lib/role-grid";
import { formatUkDate } from "@/lib/uk-date";
import { inviteStaff, sendStaffSignIn, setStaffRole, setStaffStatus } from "@/lib/server/portal";
import { STAFF_ROLES, roleLabel, type StaffRole } from "@/lib/team";

type Member = {
  email: string;
  name: string;
  role: string;
  status: string;
  invited_by: string;
  created_at: string | null;
  last_seen_at: string | null;
};

export function StaffPanel({
  token,
  meEmail,
  owner,
  members,
  onChange,
}: {
  token: string;
  meEmail: string;
  owner: boolean;
  members: Member[];
  onChange: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("operator");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setNotice(ok);
      onChange();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not update staff.");
    } finally {
      setBusy(false);
    }
  }

  const jobOptions = STAFF_ROLES.map((r) => ({ id: r.id, label: r.label }));

  return (
    <div className="fc-team space-y-6">
      <p className="max-w-xl text-sm text-muted">
        Customers sign in to their dealership. Staff sign in here. An email is staff only after an
        owner adds it.
      </p>

      <div className="fc-team-grid">
        <Section title="People" eyebrow="Staff" rail="slate" count={members.length || null}>
          <ul className="space-y-2" data-testid="team-people">
            {members.map((m) => (
              <li key={m.email} className="fc-role-row flex-wrap">
                <span className="fc-avatar" aria-hidden="true">
                  {initials(m.name || m.email)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold">{m.name || m.email}</span>
                  <span className="block truncate text-xs text-muted">
                    {[
                      m.name ? m.email : "",
                      m.last_seen_at ? `last seen ${formatUkDate(m.last_seen_at)}` : "",
                    ]
                      .filter(Boolean)
                      .join(", ") || "Not signed in yet"}
                  </span>
                  {/* Chips sit under the email so the name keeps the full row width. */}
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Chip>{roleLabel(m.role)}</Chip>
                    <Chip tone={m.status === "active" ? "live" : "neutral"}>
                      {statusLabel(m.status)}
                    </Chip>
                  </span>
                </span>
                {owner && (
                  <span className="flex w-full flex-wrap gap-1.5 pl-[52px]">
                    {m.role !== "owner" ? (
                      <TeamAction
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => setStaffRole({ data: { token, email: m.email, role: "owner" } }),
                            "Now an owner.",
                          )
                        }
                      >
                        Make owner
                      </TeamAction>
                    ) : m.email !== meEmail ? (
                      <TeamAction
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              setStaffRole({ data: { token, email: m.email, role: "operator" } }),
                            "Now an operator.",
                          )
                        }
                      >
                        Make operator
                      </TeamAction>
                    ) : null}
                    <TeamAction
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => sendStaffSignIn({ data: { token, email: m.email } }),
                          "Sign in link sent.",
                        )
                      }
                    >
                      Send sign in
                    </TeamAction>
                    {m.status !== "revoked" && m.email !== meEmail && (
                      <TeamAction
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              setStaffStatus({
                                data: { token, email: m.email, status: "revoked" },
                              }),
                            "Access revoked.",
                          )
                        }
                      >
                        Revoke
                      </TeamAction>
                    )}
                    {m.status === "revoked" && (
                      <TeamAction
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              setStaffStatus({ data: { token, email: m.email, status: "active" } }),
                            "Invite sent again. They get access once they sign in from that email.",
                          )
                        }
                      >
                        Restore
                      </TeamAction>
                    )}
                  </span>
                )}
              </li>
            ))}
            {members.length === 0 && (
              <li className="py-4 text-sm text-muted">Just you, until you invite someone.</li>
            )}
          </ul>
          {!owner && (
            <p className="mt-3 text-xs text-muted">Only owners can add or change staff.</p>
          )}
        </Section>

        {owner && (
          <form
            id="team-invite"
            className="fc-team-invite"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await inviteStaff({ data: { token, email, name, role } });
                setEmail("");
                setName("");
              }, "Invite sent. They get access once they sign in with the code from that email.");
            }}
          >
            <Section title="Invite" eyebrow="Add someone" rail="slate">
              <div className="space-y-3">
                <label className="block text-sm">
                  Work email
                  <input
                    required
                    type="email"
                    className="mt-1.5 h-11 w-full rounded-2xl border border-line bg-elevated px-3 text-sm"
                    placeholder="name@forecourt.me"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Name
                  <input
                    className="mt-1.5 h-11 w-full rounded-2xl border border-line bg-elevated px-3 text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <div>
                  <div className="mb-1.5 text-sm">Job</div>
                  <PillRow
                    label="Job"
                    kind="radio"
                    options={jobOptions}
                    value={role}
                    onChange={(id) => setRole(id)}
                  />
                </div>
                <p className="text-xs text-muted">
                  They sign in with a code, same as you. Only owners can refund or end a package.
                </p>
                <div className="fc-team-dock">
                  <Button
                    type="submit"
                    className="min-h-11 w-full"
                    disabled={busy || !email.includes("@")}
                  >
                    {busy ? "Sending…" : "Send invite"}
                  </Button>
                </div>
              </div>
            </Section>
          </form>
        )}
      </div>
      {notice && (
        <p className="text-sm text-muted" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}

function statusLabel(s: string) {
  if (s === "active") return "Active";
  if (s === "invited") return "Invite sent";
  if (s === "revoked") return "Revoked";
  return s;
}

function TeamAction({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="h-11 rounded-full bg-elevated px-4 text-xs text-muted hover:text-fg"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
