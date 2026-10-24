import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { replySupport, setSupportStatus, type SupportItem } from "@/lib/server/live-view";
import { isOpenStatus, updatedWhen } from "@/lib/live-view";
import { ticketChip, ticketMeta } from "@/lib/ticket-view";
import { cn } from "@/lib/utils";
import { isWaitingSystemMessage, isWaitingTicket } from "@/lib/server/plan-change-ticket";

/**
 * Ticket detail (redesign slice 12). Desktop: sits beside the list, which
 * stays visible. Mobile: full screen with a back button. The reply box is a
 * solid dock; on mobile it sits just above the floating bottom bar.
 */
export function TicketPane({
  item,
  token,
  onBack,
  onChanged,
  statusControl,
  extra,
}: {
  item: SupportItem;
  token: string;
  onBack: () => void;
  onChanged: () => void;
  statusControl?: ReactNode;
  extra?: ReactNode;
}) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setBody("");
    setInternal(false);
    setErr(null);
    head.current?.focus({ preventScroll: true });
  }, [item.id]);
  const chip = ticketChip(item);
  const planChange = item.change_type === "plan_change";
  const solved = !isOpenStatus(item.status);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const send = () =>
    body.trim() &&
    void run(async () => {
      await replySupport({ data: { token, itemId: item.id, body, internal } });
      setBody("");
    });

  return (
    <article className="fc-tix-detail" aria-labelledby={`tix-${item.id}`} data-testid="ticket-pane">
      <div className="fc-tix-top">
        <button type="button" className="fc-tix-back fc-press" onClick={onBack} aria-label="Back to tickets">
          <ArrowLeft aria-hidden />
          <span className="fc-tix-back-label">Tickets</span>
        </button>
        <span className="fc-tix-meta">
          {item.tenant_name ? `${item.tenant_name}, ` : ""}
          {ticketMeta(item)}
        </span>
      </div>
      <div className="fc-tix-titlebar">
        <h2 id={`tix-${item.id}`} ref={head} tabIndex={-1} className="fc-tix-title">
          {item.title}
        </h2>
        <Chip tone={chip.tone}>{chip.label}</Chip>
      </div>
      <div className="fc-tix-actions" role="group" aria-label="Quick actions">
        {!planChange && !solved ? (
          <button
            type="button"
            className="fc-tix-act fc-press"
            disabled={busy}
            onClick={() =>
              void run(() =>
                setSupportStatus({ data: { token, itemId: item.id, status: item.kind === "ticket" ? "resolved" : "done" } }),
              )
            }
          >
            Mark solved
          </button>
        ) : null}
        <Link className="fc-tix-act fc-press" to="/office" search={isWaitingTicket(item) ? { tab: "customers", id: item.tenant_id, pane: "billing" } : { tab: "customers", id: item.tenant_id }}>
          Open dealer file
        </Link>
        {statusControl}
      </div>
      {item.link ? (
        <a href={item.link} target="_blank" rel="noreferrer" className="fc-tix-link">
          {item.link}
        </a>
      ) : null}
      {extra ? <div className="fc-tix-extra">{extra}</div> : null}
      <ol className="fc-tix-thread" aria-label="Messages">
        {item.details && !isWaitingSystemMessage(item) ? (
          <li className="fc-msg is-them">
            <div className="fc-msg-by">
              {item.tenant_name || "Dealer"}, {updatedWhen(item.created_at)}
            </div>
            <p>{item.details}</p>
          </li>
        ) : null}
        {item.messages.map((m) => (
          <li key={m.id} className={cn("fc-msg", m.from_team ? "is-us" : "is-them", m.internal && "is-note")}>
            <div className="fc-msg-by">
              {m.from_team ? (m.internal ? "Internal note" : "Forecourt") : m.author_email || "Dealer"}, {updatedWhen(m.created_at)}
            </div>
            <p>{m.body}</p>
          </li>
        ))}
      </ol>
      <form
        className="fc-tix-dock"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label className="sr-only" htmlFor={`reply-${item.id}`}>
          Reply
        </label>
        <textarea
          id={`reply-${item.id}`}
          className="fc-tix-input"
          placeholder={internal ? "Write an internal note" : "Write a reply"}
          value={body}
          rows={2}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="fc-tix-dock-row">
          <button
            type="button"
            role="switch"
            aria-checked={internal}
            className="fc-tix-note"
            onClick={() => setInternal((v) => !v)}
          >
            <span className="fc-note-toggle" data-on={internal || undefined} aria-hidden="true">
              <span className="fc-note-toggle-knob" />
            </span>
            Internal note
          </button>
          <Button type="submit" disabled={busy || !body.trim()}>
            {busy ? "Sending" : internal ? "Add note" : "Send"}
          </Button>
        </div>
        {err ? (
          <p role="alert" className="fc-tix-err">
            {err}
          </p>
        ) : null}
      </form>
    </article>
  );
}
