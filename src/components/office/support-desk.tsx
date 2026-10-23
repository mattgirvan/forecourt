import { useEffect, useMemo, useState } from "react";
import { ThreadDrawer, Pill } from "@/components/account/live-view";
import { listSupport, listSupportQueue, setSupportStatus, type SupportItem } from "@/lib/server/live-view";
import { STATUS_LABEL, changeTypeLabel, isOpenStatus, ticketRef, updatedWhen, type SupportStatus } from "@/lib/live-view";
import { cn } from "@/lib/utils";

const TICKET_STATUSES: SupportStatus[] = ["open", "in_progress", "resolved"];
const CHANGE_STATUSES: SupportStatus[] = ["submitted", "in_progress", "done", "declined"];

function NeedsReply() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#d9a24b]/[.42] bg-[#d9a24b]/[.18] px-2.5 py-0.5 text-[11px] text-[#d9a24b]">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      Needs reply
    </span>
  );
}

function StatusSelect({ token, item, onChanged }: { token: string; item: SupportItem; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const opts = item.kind === "ticket" ? TICKET_STATUSES : CHANGE_STATUSES;
  return (
    <select
      aria-label="Status"
      disabled={busy}
      className="h-8 rounded-full border border-line bg-elevated px-2 text-[12px]"
      value={item.status}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        setBusy(true);
        void setSupportStatus({ data: { token, itemId: item.id, status: e.target.value } })
          .then(onChanged)
          .catch((err) => alert(err instanceof Error ? err.message : "Could not change status."))
          .finally(() => setBusy(false));
      }}
    >
      {opts.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

function Table({ token, items, onChanged, showDealer, onOpen }: { token: string; items: SupportItem[]; onChanged: () => void; showDealer?: boolean; onOpen: (i: SupportItem) => void }) {
  if (!items.length) return <p className="mt-4 text-sm text-muted">Nothing here.</p>;
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-[12px] text-subtle">
          <tr className="border-b border-line">
            {showDealer ? <th className="px-4 py-2 font-normal">Dealer</th> : null}
            <th className="w-[150px] px-4 py-2 font-normal">Type</th>
            <th className="px-4 py-2 font-normal">Title</th>
            <th className="whitespace-nowrap px-4 py-2 font-normal">Needs</th>
            <th className="px-4 py-2 font-normal">Status</th>
            <th className="whitespace-nowrap px-4 py-2 font-normal">Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-elevated/50" onClick={() => onOpen(i)}>
              {showDealer ? <td className="px-4 py-3">{i.tenant_name || `#${i.tenant_id}`}</td> : null}
              <td className="w-[150px] px-4 py-3 text-muted">{i.kind === "ticket" ? `Ticket ${ticketRef(i.ref)}` : changeTypeLabel(i.change_type)}</td>
              <td className="px-4 py-3 font-medium">{i.title}</td>
              <td className="whitespace-nowrap px-4 py-3">{i.needs_reply ? <NeedsReply /> : null}</td>
              <td className="px-4 py-3">
                <StatusSelect token={token} item={i} onChanged={onChanged} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-muted">{updatedWhen(i.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tenant file pane: this dealer's tickets and change requests. */
export function SupportPane({ token, tenantId }: { token: string; tenantId: number }) {
  const [data, setData] = useState<{ ready: boolean; items: SupportItem[] } | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const load = () => void listSupport({ data: { token, tenantId } }).then(setData).catch(() => setData({ ready: false, items: [] }));
  useEffect(load, [token, tenantId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return <p className="text-sm text-muted">Loading.</p>;
  if (!data.ready) return <p className="text-sm text-muted">Tickets need supabase/live-support.sql run first.</p>;
  const open = data.items.find((i) => i.id === openId) ?? null;
  return (
    <div>
      <h2 className="text-lg font-medium">Tickets and requests</h2>
      <Table token={token} items={data.items} onChanged={load} onOpen={(i) => setOpenId(i.id)} />
      <ThreadDrawer
        team
        item={open}
        token={token}
        onClose={() => setOpenId(null)}
        onChanged={load}
        statusControl={open ? <StatusSelect token={token} item={open} onChanged={load} /> : undefined}
      />
    </div>
  );
}

const QUEUE_TABS = [
  ["open", "All open"],
  ["reply", "Needs reply"],
  ["progress", "In progress"],
  ["resolved", "Resolved"],
  ["all", "All"],
] as const;

/** Office queue: every dealer's tickets and requests. */
/** `initial` skips the fetch; design previews and screenshots only. */
export function SupportQueue({ token, initial }: { token: string; initial?: { ready: boolean; items: SupportItem[] } }) {
  const [data, setData] = useState<{ ready: boolean; items: SupportItem[] } | null>(initial ?? null);
  const [tab, setTab] = useState<(typeof QUEUE_TABS)[number][0]>("open");
  const [open, setOpen] = useState<SupportItem | null>(null);
  const load = () => void listSupportQueue({ data: { token } }).then(setData).catch(() => setData({ ready: false, items: [] }));
  useEffect(() => {
    if (!initial) load();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (tab === "open") return all.filter((i) => isOpenStatus(i.status));
    if (tab === "reply") return all.filter((i) => i.needs_reply);
    if (tab === "progress") return all.filter((i) => i.status === "in_progress");
    if (tab === "resolved") return all.filter((i) => !isOpenStatus(i.status));
    return all;
  }, [data, tab]);
  // Thread needs messages, which only listSupport returns.
  const [thread, setThread] = useState<SupportItem | null>(null);
  useEffect(() => {
    if (!open) return setThread(null);
    void listSupport({ data: { token, tenantId: open.tenant_id } }).then((r) => setThread(r.items.find((i) => i.id === open.id) ?? null));
  }, [open, token, data]);
  if (!data) return <p className="text-sm text-muted">Loading.</p>;
  if (!data.ready) return <p className="text-sm text-muted">Tickets need supabase/live-support.sql run first.</p>;
  const replyCount = data.items.filter((i) => i.needs_reply).length;
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {QUEUE_TABS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={cn("h-8 rounded-full px-3 text-[12px]", tab === id ? "bg-fg text-accent-fg" : "bg-elevated text-muted")}>
            {label}
            {id === "reply" && replyCount ? ` (${replyCount})` : ""}
          </button>
        ))}
      </div>
      <Table token={token} items={items} onChanged={load} showDealer onOpen={setOpen} />
      <ThreadDrawer
        team
        item={thread}
        token={token}
        onClose={() => setOpen(null)}
        onChanged={load}
        statusControl={thread ? <StatusSelect token={token} item={thread} onChanged={load} /> : <Pill status="open" />}
      />
    </div>
  );
}
