import { useEffect, useState } from "react";
import { whoAmI } from "@/lib/server/portal";
import { useSbAccessToken } from "@/lib/sb-session";
import type { StaffRole } from "@/lib/team";

export function useWhoAmI() {
  const token = useSbAccessToken();
  const [me, setMe] = useState<{
    email: string;
    team: boolean;
    role: StaffRole | null;
    name: string;
  } | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    if (!token) {
      setMe(null);
      setPending(false);
      return;
    }
    setPending(true);
    void whoAmI({ data: { token } })
      .then((row) => setMe({ ...row, role: row.role ?? null, name: row.name ?? "" }))
      .catch(() => setMe(null))
      .finally(() => setPending(false));
  }, [token]);

  return { me, pending, token };
}
