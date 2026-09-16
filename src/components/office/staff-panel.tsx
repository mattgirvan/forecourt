import { useState } from "react";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight">Staff</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Customers sign in to their dealership. Staff sign in here. An email is staff only after an owner adds it.
        </p>
      </div>

      {owner && (
        <form
          className="rounded-[1.75rem] border border-line bg-surface p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await inviteStaff({ data: { token, email, name, role } });
              setEmail("");
              setName("");
            }, "Invite sent. They get a sign-in code.");
          }}
        >
          <div className="text-sm font-medium">Add someone</div>
          <p className="mt-1 text-sm text-muted">They use a code, same as you — not a password.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
            <input
              required
              type="email"
              className="h-11 rounded-2xl border border-line bg-elevated px-3 text-sm"
              placeholder="name@…"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="h-11 rounded-2xl border border-line bg-elevated px-3 text-sm"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              className="h-11 rounded-2xl border border-line bg-elevated px-3 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
            >
              {STAFF_ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={busy || !email.includes("@")}>
              {busy ? "Sending…" : "Invite"}
            </Button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-line overflow-hidden rounded-[1.75rem] border border-line bg-surface">
        {members.map((m) => (
          <li key={m.email} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">{m.name || m.email}</div>
              <div className="text-xs text-muted">
                {m.email} · {roleLabel(m.role)} · {m.status}
                {m.last_seen_at ? ` · last ${new Date(m.last_seen_at).toLocaleDateString("en-GB")}` : ""}
              </div>
            </div>
            {owner && (
              <div className="flex flex-wrap gap-1.5">
                {m.role !== "owner" ? (
                  <button
                    type="button"
                    className="h-8 rounded-full bg-elevated px-3 text-xs text-muted"
                    disabled={busy}
                    onClick={() => void run(() => setStaffRole({ data: { token, email: m.email, role: "owner" } }), "Now an owner.")}
                  >
                    Make owner
                  </button>
                ) : m.email !== meEmail ? (
                  <button
                    type="button"
                    className="h-8 rounded-full bg-elevated px-3 text-xs text-muted"
                    disabled={busy}
                    onClick={() =>
                      void run(() => setStaffRole({ data: { token, email: m.email, role: "operator" } }), "Now an operator.")
                    }
                  >
                    Make operator
                  </button>
                ) : null}
                <button
                  type="button"
                  className="h-8 rounded-full bg-elevated px-3 text-xs text-muted"
                  disabled={busy}
                  onClick={() => void run(() => sendStaffSignIn({ data: { token, email: m.email } }), "Sign-in sent.")}
                >
                  Send sign-in
                </button>
                {m.status !== "revoked" && m.email !== meEmail && (
                  <button
                    type="button"
                    className="h-8 rounded-full bg-elevated px-3 text-xs text-muted"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => setStaffStatus({ data: { token, email: m.email, status: "revoked" } }),
                        "Access revoked.",
                      )
                    }
                  >
                    Revoke
                  </button>
                )}
                {m.status === "revoked" && (
                  <button
                    type="button"
                    className="h-8 rounded-full bg-fg px-3 text-xs text-accent-fg"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => setStaffStatus({ data: { token, email: m.email, status: "active" } }),
                        "Access restored.",
                      )
                    }
                  >
                    Restore
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
        {members.length === 0 && <li className="px-5 py-6 text-sm text-muted">Just you, until you invite someone.</li>}
      </ul>
      {notice && <p className="text-sm text-muted">{notice}</p>}
    </div>
  );
}
