import { useEffect, useMemo, useState } from "react";
import { Chip } from "@/components/ui/chip";
import { Row, Rows } from "@/components/ui/section";
import { PillRow } from "@/components/ui/pill-row";
import { ThreadDrawer, Pill } from "@/components/account/live-view";
import { listSupport, listSupportQueue, setSupportStatus, type SupportItem } from "@/lib/server/live-view";
import { STATUS_LABEL, changeTypeLabel, isOpenStatus, ticketRef, updatedWhen, type SupportStatus } from "@/lib/live-view";

const TICKET_STATUSES: SupportStatus[] = ["open", "in_progress", "resolved"];
const CHANGE_STATUSES: SupportStatus[] = ["submitted", "in_progress", "done", "declined"];

function NeedsReply() {
  return <Chip tone="action">Needs reply</Chip>;
}

function StatusSelect({ token, item, onChanged }: { token: string; item: SupportItem; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const opts = item.kind === "ticket" ? TICKET_STATUSES : CHANGE_STATUSES;
  return (
    <select
      aria-label="Status"
      disabled={busy}
      className="h-11 rounded-full border border-line bg-elevated px-3 text-[13px] md:h-8 md:px-2 md:text-[12px]"
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
    <>
    <Rows as="ul" className="mt-4 md:hidden">
      {items.map((i) => (
        <Row as="li" key={i.id} tone={i.needs_reply ? "action" : "default"} className="!items-start flex-col !gap-2">
          <button type="button" className="fc-row-btn w-full" onClick={() => onOpen(i)}>
            <span className="min-w-0 flex-1">
              <span className="fc-row-title block whitespace-normal">{i.title}</span>
              <span className="fc-row-sub block">
                {showDealer ? `${i.tenant_name || `#${i.tenant_id}`}, ` : ""}
                {i.kind === "ticket" ? `Ticket ${ticketRef(i.ref)}` : changeTypeLabel(i.change_type)}, {updatedWhen(i.updated_at)}
              </span>
            </span>
          </button>
          <div className="flex w-full flex-wrap items-center gap-2">
            {i.needs_reply ? <NeedsReply /> : null}
            <StatusSelect token={token} item={i} onChanged={onChanged} />
          </div>
        </Row>
      ))}
    </Rows>
    <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-line md:block">
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
    </>
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
      <PillRow
        label="Ticket filters"
        size="sm"
        value={tab}
        onChange={setTab}
        options={QUEUE_TABS.map(([id, label]) => ({
          id,
          label,
          count: id === "reply" && replyCount ? replyCount : null,
          countTone: "action" as const,
        }))}
      />
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
