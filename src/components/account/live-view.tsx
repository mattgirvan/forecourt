import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PLANS, gbpPence, normalizeBilling, normalizePlan } from "@/lib/catalog";
import { rolesForPlan } from "@/lib/roles";
import { saveTenantFile } from "@/lib/server/portal";
import {
  createSupportItem,
  listSupport,
  liveBillingSummary,
  liveSiteDetails,
  openBillingPortal,
  setExtraSeats,
  replySupport,
  type SupportItem,
} from "@/lib/server/live-view";
import {
  CHANGE_COPY,
  CHANGE_TYPES,
  PAYMENT_BANNER,
  REPLY_TIME_COPY,
  STATUS_LABEL,
  cardLabel,
  changeTypeLabel,
  statusTone,
  ticketRef,
  ukDate,
  updatedWhen,
  type BillingSummary,
  type ChangeType,
  type SiteDetails,
  type SupportStatus,
} from "@/lib/live-view";
import { cn } from "@/lib/utils";

export type LiveTenant = {
  id: number;
  name: string;
  plan: string;
  billing?: string | null;
  principal_name?: string;
  staff_json?: string;
};

const SETUP_STEPS = [
  "Payment and plan",
  "Your details and branding",
  "Stock feed connected",
  "Staff invited",
  "Domain pointed at Forecourt",
  "Final check and go live",
];

const card = "rounded-[1.25rem] sm:rounded-[1.75rem] border border-line bg-surface p-5 sm:p-7";
const eyebrow = "text-[12px] text-subtle";
const title = "mt-1 text-[1.35rem] font-semibold tracking-tight";
const hint = "text-[12px] text-subtle";

export function Pill({ status, label }: { status: SupportStatus; label?: string }) {
  const tone = statusTone(status);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px]",
        tone === "done" && "border-[#4BA82E]/40 bg-[#4BA82E]/[.22] text-[#4BA82E]/[.85]",
        tone === "strong" && "border-line-strong bg-elevated text-fg",
        tone === "neutral" && "border-line bg-elevated text-muted",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

function AmberPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#d9a24b]/[.42] bg-[#d9a24b]/[.18] px-2.5 py-0.5 text-[11px] text-[#d9a24b]">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 text-sm">
      <span className="text-muted">{k}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        className="h-full w-full overflow-y-auto border-l border-line-strong bg-surface p-5 sm:max-w-lg sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function CardHead({ eyebrowText, titleText, action }: { eyebrowText: string; titleText: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className={eyebrow}>{eyebrowText}</div>
        <h2 className={title}>{titleText}</h2>
      </div>
      {action ? <div className="[&>button]:w-full sm:[&>button]:w-auto">{action}</div> : null}
    </div>
  );
}

const input = "mt-1.5 w-full rounded-2xl border border-line bg-elevated px-3 py-2.5 text-sm";

/** One ticket or request: thread plus reply box. Resolved tickets keep the reply box; replying reopens them. */
export function ThreadDrawer({
  item,
  token,
  team = false,
  onClose,
  onChanged,
  statusControl,
}: {
  item: SupportItem | null;
  token: string;
  team?: boolean;
  onClose: () => void;
  onChanged: () => void;
  statusControl?: ReactNode;
}) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setBody("");
    setErr(null);
    setInternal(false);
  }, [item?.id]);
  if (!item) return null;
  async function send() {
    if (!item || !body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await replySupport({ data: { token, itemId: item.id, body, internal } });
      setBody("");
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }
  const meta = item.kind === "ticket" ? `${ticketRef(item.ref)} · Opened ${ukDate(item.created_at)}` : `${changeTypeLabel(item.change_type)} · ${ukDate(item.created_at)}`;
  return (
    <Drawer open onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className={hint}>{meta}</div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="-mr-2 -mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-muted hover:bg-elevated hover:text-fg"
        >
          ×
        </button>
      </div>
      <div className="mt-1 flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{item.title}</h2>
        {statusControl ?? <Pill status={item.status} />}
      </div>
      {item.link ? (
        <a href={item.link} target="_blank" rel="noreferrer" className="mt-2 block break-all text-sm text-muted underline underline-offset-4">
          {item.link}
        </a>
      ) : null}
      <ul className="mt-6 space-y-3">
        {item.messages.map((m) => (
          <li key={m.id} className={cn("flex", m.from_team ? "justify-start" : "justify-end")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl border px-4 py-3 text-sm",
                m.from_team ? "border-line bg-elevated" : "border-line-strong bg-surface",
                m.internal && "border-dashed",
              )}
            >
              <div className="mb-1 text-[11px] text-subtle">
                {m.from_team ? (m.internal ? "Internal note" : "Forecourt") : team ? m.author_email || "Dealer" : "You"} · {updatedWhen(m.created_at)}
              </div>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <label className="mt-6 block text-sm">
        Reply
        <textarea className={cn(input, "min-h-28")} placeholder="Write a reply" value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      {team ? (
        <label className="mt-2 flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note (the dealer does not see it)
        </label>
      ) : (
        <p className={cn(hint, "mt-2")}>We'll email you when we reply.</p>
      )}
      {err ? <p className="mt-2 text-sm text-muted">{err}</p> : null}
      <div className="mt-4 flex gap-2">
        <Button disabled={busy || !body.trim()} onClick={() => void send()}>
          {busy ? "Sending" : "Send"}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Drawer>
  );
}

function NewItemDrawer({
  kind,
  token,
  tenantId,
  onClose,
  onDone,
}: {
  kind: "ticket" | "change" | null;
  token: string;
  tenantId: number;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [link, setLink] = useState("");
  const [type, setType] = useState<ChangeType | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setSubject("");
    setDetails("");
    setLink("");
    setType(null);
    setErr(null);
  }, [kind]);
  if (!kind) return null;
  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await createSupportItem({ data: { token, tenantId, kind: kind!, title: subject, details, changeType: type ?? undefined, link } });
      onDone(kind === "ticket" ? "Thanks, we've got it. We'll reply here." : "Thanks, we'll be in touch about timings.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer open onClose={onClose}>
      <h2 className="text-xl font-semibold tracking-tight">{kind === "ticket" ? "New ticket" : "Request a change"}</h2>
      <p className={cn(hint, "mt-1")}>
        {kind === "ticket" ? "Tell us what's up and we'll take it from there." : "Tell us what you'd like and we'll come back to you with timings."}
      </p>
      {kind === "change" ? (
        <fieldset className="mt-6">
          <legend className="text-sm">What kind of change?</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {CHANGE_TYPES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setType(c.id)}
                className={cn("rounded-2xl border px-3 py-3 text-left", type === c.id ? "border-fg bg-elevated" : "border-line bg-elevated/50")}
              >
                <div className="text-sm font-medium">{c.label}</div>
                <div className={hint}>{c.hint}</div>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <label className="mt-5 block text-sm">
        {kind === "ticket" ? "Subject" : "Short title"}
        <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={kind === "ticket" ? "For example, the finance calculator looks wrong" : ""} />
      </label>
      <label className="mt-4 block text-sm">
        {kind === "ticket" ? "What's happening?" : "Details"}
        <textarea className={cn(input, "min-h-32")} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={kind === "ticket" ? "A link or a screenshot helps us fix it faster" : ""} />
      </label>
      {kind === "change" ? (
        <label className="mt-4 block text-sm">
          Anything to share? (optional)
          <input className={input} value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a link to files or examples" />
        </label>
      ) : null}
      {kind === "change" ? <p className={cn(hint, "mt-3")}>{CHANGE_COPY}</p> : null}
      {err ? <p className="mt-3 text-sm text-muted">{err}</p> : null}
      <div className="mt-5 flex gap-2">
        <Button disabled={busy || !subject.trim() || !details.trim() || (kind === "change" && !type)} onClick={() => void send()}>
          {busy ? "Sending" : kind === "ticket" ? "Send ticket" : "Send request"}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Drawer>
  );
}

function ItemList({ items, empty, onOpen, ticket }: { items: SupportItem[]; empty: string; onOpen: (i: SupportItem) => void; ticket: boolean }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <p className="mt-5 text-sm text-muted">{empty}</p>;
  const shown = all ? items : items.slice(0, 5);
  return (
    <>
      <ul className="mt-4">
        {shown.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => onOpen(i)} className="flex w-full items-center justify-between gap-3 border-b border-line py-3 text-left">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{i.title}</span>
                <span className={hint}>
                  {ticket ? `${ticketRef(i.ref)} · Updated ${updatedWhen(i.updated_at)}` : `${changeTypeLabel(i.change_type)} · ${updatedWhen(i.updated_at)}`}
                </span>
              </span>
              <Pill status={i.status} />
            </button>
          </li>
        ))}
      </ul>
      {items.length > 5 && !all ? (
        <button type="button" className="mt-3 text-sm text-muted underline underline-offset-4" onClick={() => setAll(true)}>
          Show all
        </button>
      ) : null}
    </>
  );
}

type Member = { name?: string; role?: string; email?: string };

export type LiveViewData = { site: SiteDetails; bill: BillingSummary; support: { ready: boolean; items: SupportItem[] } };

/** `initial` skips the fetches; used for design previews and screenshots only. */
export function LiveView({ token, tenant, initial }: { token: string; tenant: LiveTenant; initial?: LiveViewData }) {
  const plan = normalizePlan(tenant.plan);
  const billingKind = normalizeBilling(plan, tenant.billing);
  const [site, setSite] = useState<SiteDetails | null>(initial?.site ?? null);
  const [bill, setBill] = useState<BillingSummary | null>(initial?.bill ?? null);
  const [support, setSupport] = useState<{ ready: boolean; items: SupportItem[] } | null>(initial?.support ?? null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [newKind, setNewKind] = useState<"ticket" | "change" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalErr, setPortalErr] = useState<string | null>(null);

  const loadSupport = () =>
    void listSupport({ data: { token, tenantId: tenant.id } })
      .then(setSupport)
      .catch(() => setSupport({ ready: false, items: [] }));
  useEffect(() => {
    if (initial) return;
    void liveSiteDetails({ data: { token, tenantId: tenant.id } }).then(setSite).catch(() => setSite(null));
    void liveBillingSummary({ data: { token, tenantId: tenant.id } }).then(setBill).catch(() => setBill(null));
    loadSupport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tenant.id]);

  const tickets = useMemo(() => (support?.items ?? []).filter((i) => i.kind === "ticket"), [support]);
  const changes = useMemo(() => (support?.items ?? []).filter((i) => i.kind === "change"), [support]);
  const open = (support?.items ?? []).find((i) => i.id === openId) ?? null;
  const failed = Boolean(bill?.pastDue);

  async function manageBilling() {
    setPortalBusy(true);
    setPortalErr(null);
    try {
      const { url } = await openBillingPortal({ data: { token, tenantId: tenant.id } });
      window.location.href = url;
    } catch (e) {
      setPortalErr(e instanceof Error ? e.message : "Could not open billing.");
      setPortalBusy(false);
    }
  }

  const monthly = bill?.monthlyPence ?? null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-[13px] font-medium text-muted">Your account</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{tenant.name || "Your dealership"}</h1>
        {/* Always Live once live. Never changes with payment (Matt). */}
        <Pill status="done" label="Live" />
      </div>
      <p className="mt-3 text-sm text-muted">
        {monthly ? `${gbpPence(monthly)} a month` : ""}
        {site?.renewsAt ? `${monthly ? " · " : ""}Renews ${ukDate(site.renewsAt)}` : ""}
      </p>

      {failed ? (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-[#d9a24b]/40 bg-[#d9a24b]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <span className="mt-1.5 hidden h-2 w-2 shrink-0 rounded-full bg-[#d9a24b] sm:block" />
            <p className="text-sm">{PAYMENT_BANNER}</p>
          </div>
          <Button className="w-full sm:w-auto" disabled={portalBusy} onClick={() => void manageBilling()}>
            Manage billing
          </Button>
        </div>
      ) : null}

      <details className="group mt-6 rounded-2xl border border-line bg-surface px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
          <span className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#4BA82E]/[.22] text-[10px] text-[#4BA82E]">✓</span>
            Setup complete.{site?.goLiveAt ? ` Your site went live on ${ukDate(site.goLiveAt)}.` : ""}
          </span>
          <span className={cn(hint, "shrink-0 whitespace-nowrap")}>
            <span className="group-open:hidden">Show steps</span>
            <span className="hidden group-open:inline">Hide steps</span>
          </span>
        </summary>
        <ul className="mt-3">
          {SETUP_STEPS.map((s) => (
            <li key={s} className="flex items-center justify-between border-t border-line py-2.5 text-sm">
              {s}
              <Pill status="done" />
            </li>
          ))}
        </ul>
      </details>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <CardHead eyebrowText="Your site" titleText="Site details" />
          <div className="mt-4">
            <Row k="Web address">
              {site?.domain ? (
                <a className="underline underline-offset-4" href={`https://${site.domain}`} target="_blank" rel="noreferrer">
                  {site.domain}
                </a>
              ) : (
                <span className="text-muted">We'll add this once your domain is connected.</span>
              )}
            </Row>
            <Row k="Went live">{site ? ukDate(site.goLiveAt) || "Checking..." : "Checking..."}</Row>
            {site?.renewsAt ? <Row k="Renews">{ukDate(site.renewsAt)}</Row> : null}
          </div>
          {site?.renewsAt ? <p className={cn(hint, "mt-3")}>Your plan renews every 12 months. Message us if you'd like to talk about it.</p> : null}
        </section>

        <section className={cn(card)}>
          <CardHead eyebrowText="Plan and billing" titleText={bill?.planName ?? `Forecourt ${PLANS[plan].name}`} />
          <div className="mt-4">
            <Row k="Price">{bill ? (monthly ? `${gbpPence(monthly)} a month` : "") : <span className="text-subtle">Checking...</span>}</Row>
            <Row k="Next payment">
              {!bill ? (
                <span className="text-subtle">Checking...</span>
              ) : failed ? (
                <AmberPill>Retrying {bill.retryAt ? ukDate(bill.retryAt) : "soon"}</AmberPill>
              ) : (
                ukDate(bill.nextPaymentAt) || "Not scheduled"
              )}
            </Row>
            <Row k="Card">{bill ? cardLabel(bill.card) : <span className="text-subtle">Checking...</span>}</Row>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button variant="secondary" className="w-full sm:w-auto" disabled={portalBusy} onClick={() => void manageBilling()}>
              Manage billing
            </Button>
            <span className={hint}>Opens Stripe. We never see your card details.</span>
          </div>
          {portalErr ? <p className="mt-2 text-sm text-muted">{portalErr}</p> : null}
        </section>

        <section className={card}>
          <CardHead
            eyebrowText="Support"
            titleText="Tickets"
            action={
              <Button size="sm" onClick={() => setNewKind("ticket")}>
                New ticket
              </Button>
            }
          />
          <ItemList
            ticket
            items={tickets}
            onOpen={(i) => setOpenId(i.id)}
            empty="No tickets yet. If anything looks off on your site, message us and we'll pick it up."
          />
          <p className={cn(hint, "mt-4")}>{REPLY_TIME_COPY}</p>
        </section>

        <section className={card}>
          <CardHead
            eyebrowText="Your site"
            titleText="Change requests"
            action={
              <Button size="sm" onClick={() => setNewKind("change")}>
                Request a change
              </Button>
            }
          />
          <ItemList
            ticket={false}
            items={changes}
            onOpen={(i) => setOpenId(i.id)}
            empty="Nothing requested yet. Want a new page or a tweak? Tell us what you have in mind."
          />
          <p className={cn(hint, "mt-4")}>{CHANGE_COPY}</p>
        </section>

        <Seats
          token={token}
          tenant={tenant}
          base={rolesForPlan(plan, billingKind).length}
          bill={bill}
          onSeatsChanged={(extraSeats) => setBill((b) => (b ? { ...b, extraSeats } : b))}
        />
      </div>

      {toast ? (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-2xl border border-line-strong bg-surface px-4 py-3 text-sm" role="status">
          {toast}
        </div>
      ) : null}

      <ThreadDrawer item={open} token={token} onClose={() => setOpenId(null)} onChanged={loadSupport} />
      <NewItemDrawer
        kind={newKind}
        token={token}
        tenantId={tenant.id}
        onClose={() => setNewKind(null)}
        onDone={(msg) => {
          setNewKind(null);
          setToast(msg);
          setTimeout(() => setToast(null), 4000);
          loadSupport();
        }}
      />
    </div>
  );
}

function initials(s: string) {
  return (
    s
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** Seats and staff. Self serve (Matt's default): saves the staff list on the file, as the People tab did. */
function Seats({
  token,
  tenant,
  base,
  bill,
  onSeatsChanged,
}: {
  token: string;
  tenant: LiveTenant;
  base: number;
  bill: BillingSummary | null;
  onSeatsChanged: (extra: number) => void;
}) {
  const extra = bill?.extraSeats ?? 0;
  const total = base + extra;
  const canBuy = Boolean(bill?.connected && bill.seatPricePence != null);
  const [buying, setBuying] = useState(false);
  const [want, setWant] = useState(1);
  const [buyBusy, setBuyBusy] = useState(false);
  const [buyErr, setBuyErr] = useState<string | null>(null);
  async function buy() {
    setBuyBusy(true);
    setBuyErr(null);
    try {
      const r = await setExtraSeats({ data: { token, tenantId: tenant.id, quantity: extra + want } });
      onSeatsChanged(r.extraSeats);
      setBuying(false);
    } catch (e) {
      setBuyErr(e instanceof Error ? e.message : "Could not add seats.");
    } finally {
      setBuyBusy(false);
    }
  }
  const [members, setMembers] = useState<Member[]>(() => {
    try {
      const parsed = JSON.parse(tenant.staff_json || "[]") as Member[];
      return Array.isArray(parsed) ? parsed.filter((m) => (m.name || m.email || "").trim()) : [];
    } catch {
      return [];
    }
  });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [form, setForm] = useState<Member>({ name: "", email: "", role: "sales" });
  const [err, setErr] = useState<string | null>(null);
  const owner = tenant.principal_name?.trim();
  const used = members.length + (owner ? 1 : 0);
  const full = used >= total;

  async function save(next: Member[]) {
    setErr(null);
    try {
      await saveTenantFile({ data: { token, tenantId: tenant.id, staff_json: JSON.stringify(next) } });
      setMembers(next);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      return false;
    }
  }

  return (
    <section className={cn(card, "lg:col-span-2")}>
      <CardHead
        eyebrowText="On the desk"
        titleText="Seats and staff"
        action={
          <Button size="sm" variant="secondary" disabled={full} onClick={() => setAdding(true)}>
            Add staff member
          </Button>
        }
      />
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted">Seats used</span>
        <span className="rounded-full border border-line bg-elevated px-2 py-0.5 text-[11px] text-muted">
          {used} of {total}
        </span>
      </div>
      <div className="mt-2 h-1 rounded-full bg-elevated">
        <div className="h-1 rounded-full bg-muted" style={{ width: `${Math.min(100, (used / Math.max(total, 1)) * 100)}%` }} />
      </div>
      {extra ? <p className={cn(hint, "mt-2")}>Includes {extra} extra seat{extra === 1 ? "" : "s"} you've added.</p> : null}
      {full ? <p className={cn(hint, "mt-2")}>All seats are in use. Remove someone{canBuy ? " or add more seats" : " or message us about more seats"}.</p> : null}
      {canBuy ? (
        <button type="button" className="mt-3 text-sm text-muted underline underline-offset-4" onClick={() => setBuying(true)}>
          Add seats
        </button>
      ) : null}
      <Drawer open={buying} onClose={() => setBuying(false)}>
        <h2 className="text-xl font-semibold tracking-tight">Add seats</h2>
        <p className={cn(hint, "mt-1")}>
          {bill?.seatPricePence != null ? `${gbpPence(bill.seatPricePence)} a month per seat, added to your plan. ` : ""}You'll pay a part month on your next invoice.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Button variant="secondary" size="sm" disabled={want <= 1} onClick={() => setWant(want - 1)} aria-label="One fewer">
            -
          </Button>
          <span className="w-10 text-center text-xl font-semibold">{want}</span>
          <Button variant="secondary" size="sm" disabled={want >= 20} onClick={() => setWant(want + 1)} aria-label="One more">
            +
          </Button>
        </div>
        <p className="mt-4 text-sm text-muted">
          You'll have {total + want} seats{bill?.seatPricePence != null ? `, an extra ${gbpPence(bill.seatPricePence * want)} a month` : ""}.
        </p>
        {buyErr ? <p className="mt-2 text-sm text-muted">{buyErr}</p> : null}
        <div className="mt-5 flex gap-2">
          <Button disabled={buyBusy} onClick={() => void buy()}>
            {buyBusy ? "Adding" : "Add seats"}
          </Button>
          <Button variant="secondary" onClick={() => setBuying(false)}>
            Close
          </Button>
        </div>
      </Drawer>
      <ul className="mt-3">
        {owner ? (
          <li className="flex items-center justify-between gap-3 border-b border-line py-3 text-sm">
            <span className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-[11px] text-muted">{initials(owner)}</span>
              <span>
                <span className="block font-medium">{owner}</span>
                <span className={hint}>Owner</span>
              </span>
            </span>
            <span className={hint}>You</span>
          </li>
        ) : null}
        {members.map((m, i) => (
          <li key={`${m.email}-${i}`} className="flex items-center justify-between gap-3 border-b border-line py-3 text-sm">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-[11px] text-muted">{initials(m.name || m.email || "")}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{m.name || m.email}</span>
                <span className={hint}>{m.role || "Staff"}</span>
              </span>
            </span>
            <button type="button" className="text-[12px] text-muted underline underline-offset-4" onClick={() => setRemoving(i)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      {err ? <p className="mt-2 text-sm text-muted">{err}</p> : null}

      <Drawer open={adding} onClose={() => setAdding(false)}>
        <h2 className="text-xl font-semibold tracking-tight">Add staff member</h2>
        {(["name", "email", "role"] as const).map((f) => (
          <label key={f} className="mt-4 block text-sm capitalize">
            {f}
            <input className={input} value={form[f] ?? ""} onChange={(e) => setForm({ ...form, [f]: e.target.value })} type={f === "email" ? "email" : "text"} />
          </label>
        ))}
        <div className="mt-5 flex gap-2">
          <Button
            disabled={!form.name?.trim() || !form.email?.trim()}
            onClick={() =>
              void save([...members, form]).then((ok) => {
                if (ok) {
                  setAdding(false);
                  setForm({ name: "", email: "", role: "sales" });
                }
              })
            }
          >
            Send invite
          </Button>
          <Button variant="secondary" onClick={() => setAdding(false)}>
            Close
          </Button>
        </div>
      </Drawer>

      {removing !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation" onClick={() => setRemoving(null)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-line-strong bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm">
              Remove {members[removing]?.name || members[removing]?.email}? They'll lose access to the desk straight away.
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => void save(members.filter((_, j) => j !== removing)).then(() => setRemoving(null))}>Remove</Button>
              <Button variant="secondary" onClick={() => setRemoving(null)}>
                Keep
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
