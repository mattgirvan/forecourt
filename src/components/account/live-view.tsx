import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PLANS, gbpPence, normalizePlan } from "@/lib/catalog";
import {
  createSupportItem,
  listSupport,
  liveBillingSummary,
  liveSiteDetails,
  openBillingPortal,
  replySupport,
  type SupportItem,
} from "@/lib/server/live-view";
import {
  CHANGE_COPY,
  CHANGE_TYPES,
  PAYMENT_BANNER,
  PAYMENT_BANNER_MANAGER,
  ACCESS_COPY,
  MANAGER_COPY,
  REPLY_TIME_COPY,
  STAFF_COPY,
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
import { MigrationPill, MigrationTracker } from "@/components/account/migration-tracker";
import { getMigration } from "@/lib/server/migration-server";
import { accountStatusLabel, type Tracker } from "@/lib/migration";
import { inviteManager, listAccountMembers, removeAccountMember, type AccountMember } from "@/lib/server/members";

export type LiveTenant = {
  id: number;
  name: string;
  plan: string;
  billing?: string | null;
  principal_name?: string | null;
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


export type LiveViewData = {
  site: SiteDetails;
  bill: BillingSummary;
  support: { ready: boolean; items: SupportItem[] };
  members?: { ready: boolean; members: AccountMember[] };
  migration?: Tracker | null;
};
export type LiveRole = "owner" | "manager";

/** `initial` skips the fetches; used for design previews and screenshots only. */
export function LiveView({ token, tenant, initial, role = "owner" }: { token: string; tenant: LiveTenant; initial?: LiveViewData; role?: LiveRole }) {
  const manager = role === "manager";
  const plan = normalizePlan(tenant.plan);
  const [site, setSite] = useState<SiteDetails | null>(initial?.site ?? null);
  const [bill, setBill] = useState<BillingSummary | null>(initial?.bill ?? null);
  const [support, setSupport] = useState<{ ready: boolean; items: SupportItem[] } | null>(initial?.support ?? null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [newKind, setNewKind] = useState<"ticket" | "change" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalErr, setPortalErr] = useState<string | null>(null);
  const [migration, setMigration] = useState<Tracker | null>(initial?.migration ?? null);

  const loadSupport = () =>
    void listSupport({ data: { token, tenantId: tenant.id } })
      .then(setSupport)
      .catch(() => setSupport({ ready: false, items: [] }));
  useEffect(() => {
    if (initial) return;
    void liveSiteDetails({ data: { token, tenantId: tenant.id } }).then(setSite).catch(() => setSite(null));
    void liveBillingSummary({ data: { token, tenantId: tenant.id } }).then(setBill).catch(() => setBill(null));
    void getMigration({ data: { token, tenantId: tenant.id } }).then(setMigration).catch(() => setMigration(null));
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
        {/* Live once live, never changed by payment (Matt). Migration only while an account type change is open. */}
        {accountStatusLabel(migration) === "Migration" ? <MigrationPill /> : <Pill status="done" label="Live" />}
      </div>
      {manager ? <p className="mt-3 text-sm text-muted">{MANAGER_COPY}</p> : null}
      <p className="mt-3 text-sm text-muted">
        {monthly ? `${gbpPence(monthly)} a month` : ""}
        {site?.renewsAt ? `${monthly ? " · " : ""}Renews ${ukDate(site.renewsAt)}` : ""}
      </p>

      {failed ? (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-[#d9a24b]/40 bg-[#d9a24b]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <span className="mt-1.5 hidden h-2 w-2 shrink-0 rounded-full bg-[#d9a24b] sm:block" />
            <p className="text-sm">{manager ? PAYMENT_BANNER_MANAGER : PAYMENT_BANNER}</p>
          </div>
          {manager ? null : (
            <Button className="w-full sm:w-auto" disabled={portalBusy} onClick={() => void manageBilling()}>
              Manage billing
            </Button>
          )}
        </div>
      ) : null}

      {migration?.open ? (
        <div className="mt-6">
          <MigrationTracker tracker={migration} />
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
          {manager ? (
            <p className={cn(hint, "mt-4")}>The account owner manages billing.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button variant="secondary" className="w-full sm:w-auto" disabled={portalBusy} onClick={() => void manageBilling()}>
                Manage billing
              </Button>
              <span className={hint}>Opens Stripe. We never see your card details.</span>
            </div>
          )}
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

        <DeskStaff domain={site?.domain ?? null} />
        {manager ? null : <AccountAccess token={token} tenantId={tenant.id} initial={initial?.members} preview={Boolean(initial)} />}
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

/** Desk staff live in the dealer's own desk (its Admin tab). Forecourt does not manage them. The desk has no /admin URL (Admin is an in app tab), so this opens the desk root. */
function DeskStaff({ domain }: { domain: string | null }) {
  const host = (domain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return (
    <section className={cn(card, "lg:col-span-2")}>
      <CardHead
        eyebrowText="On the desk"
        titleText="Desk staff"
        action={
          host ? (
            <Button size="sm" variant="secondary" asChild>
              <a href={`https://${host}/`} target="_blank" rel="noreferrer">
                Open your desk
              </a>
            </Button>
          ) : undefined
        }
      />
      <p className="mt-4 text-sm text-muted">Managed in your desk. Open your desk, then Admin, to add or remove staff and send sign in codes.</p>
      <p className={cn(hint, "mt-2")}>{STAFF_COPY}</p>
    </section>
  );
}

function AccountAccess({
  token,
  tenantId,
  initial,
  preview,
}: {
  token: string;
  tenantId: number;
  initial?: { ready: boolean; members: AccountMember[] };
  preview: boolean;
}) {
  const [data, setData] = useState<{ ready: boolean; members: AccountMember[] } | null>(initial ?? null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () =>
    void listAccountMembers({ data: { token, tenantId } })
      .then(setData)
      .catch(() => setData({ ready: false, members: [] }));
  useEffect(() => {
    if (!preview) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function invite() {
    if (preview) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await inviteManager({ data: { token, tenantId, email } });
      setMsg(r.emailed ? `Invite sent to ${email.trim().toLowerCase()}.` : "Added. They can sign in with that email now.");
      setEmail("");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not send the invite.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(m: AccountMember) {
    if (preview) return;
    if (!window.confirm(`Remove ${m.email}? They lose access straight away.`)) return;
    try {
      await removeAccountMember({ data: { token, tenantId, memberId: m.id } });
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not remove them.");
    }
  }

  const members = data?.members ?? [];
  return (
    <section className={cn(card, "lg:col-span-2")}>
      <CardHead eyebrowText="Your Forecourt account" titleText="Account access" />
      <p className="mt-4 text-sm text-muted">{ACCESS_COPY}</p>
      {data && !data.ready ? (
        <p className={cn(hint, "mt-4")}>Account access is not switched on yet. Message us and we will add them for you.</p>
      ) : (
        <>
          <ul className="mt-4">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 text-sm">
                <span className="min-w-0 truncate">{m.email}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="inline-flex items-center whitespace-nowrap rounded-full border border-line bg-elevated px-2.5 py-0.5 text-[11px] text-muted">
                    {m.status === "active" ? "Manager" : "Invited"}
                  </span>
                  <button type="button" className="text-sm text-muted underline underline-offset-4" onClick={() => void remove(m)}>
                    Remove
                  </button>
                </span>
              </li>
            ))}
            {members.length === 0 ? <li className="border-t border-line py-2.5 text-sm text-muted">Only you so far.</li> : null}
          </ul>
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void invite();
            }}
          >
            <input
              className={cn(input, "sm:flex-1")}
              type="email"
              required
              placeholder="manager@yourdealership.co.uk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Manager email"
            />
            <Button type="submit" className="w-full sm:w-auto" disabled={busy || !email.trim()}>
              Invite manager
            </Button>
          </form>
          {msg ? <p className={cn(hint, "mt-2")}>{msg}</p> : null}
        </>
      )}
    </section>
  );
}
