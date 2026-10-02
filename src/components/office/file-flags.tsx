import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FLAG_EXPLAINERS } from "@/components/office/board";
import { fileFlags, markFlagHandled } from "@/lib/server/portal";

type Open = { duplicate: boolean; lookalike: boolean; duplicateSessions: string[] };

/** Open payment flags on one file. Owners can mark them handled, which clears the list badges. */
export function FileFlags({ token, tenantId, owner, onChanged }: { token: string; tenantId: number; owner: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fileFlags({ data: { token, tenantId } })
      .then((f) => live && setOpen(f))
      .catch(() => live && setOpen(null));
    return () => {
      live = false;
    };
  }, [token, tenantId]);

  if (!open || (!open.duplicate && !open.lookalike)) return notice ? <p className="mt-3 text-sm text-muted">{notice}</p> : null;

  async function mark(kind: "duplicate_payment" | "similar_dealer", how: "refunded" | "checked") {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await markFlagHandled({ data: { token, tenantId, kind, how } });
      setNotice(res.message);
      setOpen(await fileFlags({ data: { token, tenantId } }));
      onChanged();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-line-strong p-4">
      {open.duplicate ? (
        <div>
          <Badge tone="warn" className="text-[11px]">
            Duplicate payment
          </Badge>
          <p className="mt-1.5 text-sm text-muted">
            {FLAG_EXPLAINERS.duplicate} Refund the duplicate in Stripe and cancel its subscription there, not with Office Refund. The first button checks both in Stripe before it clears the flag.
          </p>
          {owner ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void mark("duplicate_payment", "refunded")}>
                Refunded and cancelled in Stripe, clear the flag
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void mark("duplicate_payment", "checked")}>
                Checked, clear the flag
              </Button>
            </div>
          ) : (
            <p className="mt-1 text-xs text-subtle">An owner can clear this once it is dealt with.</p>
          )}
        </div>
      ) : null}
      {open.lookalike ? (
        <div>
          <Badge tone="neutral" className="text-[11px]">
            Looks like another dealer
          </Badge>
          <p className="mt-1.5 text-sm text-muted">{FLAG_EXPLAINERS.lookalike}</p>
          {owner ? (
            <div className="mt-2">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void mark("similar_dealer", "checked")}>
                Checked, clear the flag
              </Button>
            </div>
          ) : (
            <p className="mt-1 text-xs text-subtle">An owner can clear this once it is checked.</p>
          )}
        </div>
      ) : null}
      {notice ? <p className="text-sm">{notice}</p> : null}
    </div>
  );
}
