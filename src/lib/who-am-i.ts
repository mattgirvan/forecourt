import { useEffect, useState } from "react";
import { whoAmI } from "@/lib/server/portal";
import { useSbSessionToken } from "@/lib/sb-session";
import { whoAmIPending } from "@/lib/who-am-i-state";
import type { StaffRole } from "@/lib/team";

export function useWhoAmI() {
  const { token, known } = useSbSessionToken();
  const [me, setMe] = useState<{
    email: string;
    team: boolean;
    role: StaffRole | null;
    name: string;
    /** Invited, not accepted yet: they need to sign in with an email code. */
    pendingInvite?: boolean;
    /** Accepting was tried and did not finish: show what to do instead of the code hint. */
    acceptProblem?: "failed" | "other-sign-in" | null;
  } | null>(null);
  // The token this answer belongs to: undefined before any answer, null for signed out.
  const [doneFor, setDoneFor] = useState<string | null | undefined>(undefined);
  const pending = whoAmIPending(known, token, doneFor);

  useEffect(() => {
    // Wait for the stored session: no token yet is not the same as signed out.
    if (!known) return;
    if (!token) {
      setMe(null);
      setDoneFor(null);
      return;
    }
    void whoAmI({ data: { token } })
      .then((row) => setMe({ ...row, role: row.role ?? null, name: row.name ?? "" }))
      .catch(() => setMe(null))
      .finally(() => setDoneFor(token));
  }, [token, known]);

  return { me, pending, token };
}
