import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { OrderBuild } from "@/components/build/order-desk";
import { Button } from "@/components/ui/button";
import { PLANS, gbpPence, monthTotalPence, normalizeBilling, normalizePlan, setupDuePence } from "@/lib/catalog";
import { rolesForPlan } from "@/lib/roles";
import { addNote, listMessages, listNotes, listReceipts, saveTenantFile, sendMessage } from "@/lib/server/portal";
import { packageLive, statusLabel, trialDaysLeft } from "@/lib/team";
import { cn } from "@/lib/utils";

type Tenant = {
  id: number;
  name: string;
  plan: string;
  status: string;
  billing?: string | null;
  site_count?: number | null;
  trial_ends_at?: string | null;
  term_months?: number | null;
  phone?: string;
  email?: string;
  domain?: string;
  principal_name?: string;
  group_name?: string;
  staff_json?: string;
};

type Tab = "overview" | "build" | "billing" | "messages" | "notes" | "people";

export function DealerPortal({
  token,
  tenant,
  converting,
  onConvert,
  onNewPackage,
}: {
  token: string;
  tenant: Tenant;
  converting?: boolean;
  onConvert?: () => void;
  onNewPackage?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const plan = normalizePlan(tenant.plan);
  const billing = normalizeBilling(plan, tenant.billing);
  const chosen = PLANS[plan];
  const days = billing === "trial" ? trialDaysLeft(tenant.trial_ends_at) : null;
  const seats = rolesForPlan(plan, billing);
  const monthly = monthTotalPence(plan, tenant.site_count ?? 1);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-[13px] font-medium text-muted">Your account</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">{tenant.name || "Your dealership"}</h1>
      <p className="mt-3 text-sm text-muted">
        {statusLabel(tenant.status)}
        {days != null ? ` · ${days} days left` : ""}
        {billing === "subscription" ? ` · ${gbpPence(monthly)}/month` : ""}
        {chosen.contractMonths ? ` · ${chosen.contractMonths}-month contract` : ""}
      </p>

      <div className="mt-8 flex flex-wrap gap-1.5">
        {(
          [
            ["overview", "Overview"],
            ["build", "Your desk"],
            ["billing", "Billing"],
            ["messages", "Support"],
            ["notes", "Notes"],
            ["people", "People"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "h-9 rounded-full px-4 text-[13px]",
              tab === id ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "overview" && (
          <Overview
            tenant={tenant}
            planName={chosen.name}
            seats={seats.map((s) => s.title)}
            includes={chosen.includes}
            days={days}
            billing={billing}
            converting={converting}
            onConvert={onConvert}
            onNewPackage={onNewPackage}
          />
        )}
        {tab === "build" && <OrderBuild token={token} tenantId={tenant.id} team={false} />}
        {tab === "billing" && <Billing token={token} tenant={tenant} converting={converting} onConvert={onConvert} />}
        {tab === "messages" && <Thread token={token} tenantId={tenant.id} team={false} />}
        {tab === "notes" && <Notes token={token} tenantId={tenant.id} team={false} />}
        {tab === "people" && <People token={token} tenant={tenant} seats={seats.map((s) => ({ id: s.id, title: s.title }))} />}
      </div>
    </div>
  );
}

function Overview({
  tenant,
  planName,
  seats,
  includes,
  days,
  billing,
  converting,
  onConvert,
  onNewPackage,
}: {
  tenant: Tenant;
  planName: string;
  seats: string[];
  includes: string[];
  days: number | null;
  billing: string;
  converting?: boolean;
  onConvert?: () => void;
  onNewPackage?: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-[1.75rem] border border-line bg-surface p-6 sm:p-8">
        <div className="text-[13px] text-muted">Package</div>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">{planName}</h2>
        <p className="mt-3 text-sm text-muted">
          {packageLive(tenant.status)
            ? billing === "trial"
              ? days != null
                ? `${days} days left on the trial. If you stay, the £1,500 comes off setup.`
                : "You’re on the 60-day trial."
              : "You’re on a live subscription."
            : "Saved, not paid yet."}
        </p>
        <ul className="mt-6 space-y-2 text-sm text-muted">
          {includes.map((line) => (
            <li key={line} className="border-b border-line py-2">
              {line}
            </li>
          ))}
        </ul>
        {billing === "trial" && onConvert && (
          <Button className="mt-6" onClick={onConvert} disabled={converting}>
            Convert to Site subscription
          </Button>
        )}
      </article>
      <article className="rounded-[1.75rem] border border-line bg-surface p-6 sm:p-8">
        <div className="text-[13px] text-muted">On the desk</div>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Seats</h2>
        <ul className="mt-6 space-y-2 text-sm text-muted">
          {seats.map((s) => (
            <li key={s} className="border-b border-line py-2">
              {s}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted">
          {tenant.domain || "Your web address is set when we go live."}
        </p>
        {onNewPackage && (
          <button type="button" className="mt-4 text-sm text-muted underline-offset-4 hover:text-fg hover:underline" onClick={onNewPackage}>
            Start another package
          </button>
        )}
        <div className="mt-4">
          <Button variant="secondary" asChild>
            <Link to="/how">How we set it up</Link>
          </Button>
        </div>
      </article>
    </div>
  );
}

function Billing({
  token,
  tenant,
  converting,
  onConvert,
}: {
  token: string;
  tenant: Tenant;
  converting?: boolean;
  onConvert?: () => void;
}) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listReceipts>>>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void listReceipts({ data: { token, tenantId: tenant.id } })
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load receipts."));
  }, [token, tenant.id]);
  const plan = normalizePlan(tenant.plan);
  const billing = normalizeBilling(plan, tenant.billing);
  const remaining = setupDuePence(plan, "subscription", true);

  return (
    <div className="rounded-[1.75rem] border border-line bg-surface p-6 sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight">Receipts</h2>
      <p className="mt-2 text-sm text-muted">What you’ve paid, and what’s next.</p>
      {billing === "trial" && onConvert && (
        <div className="mt-6 rounded-2xl border border-line p-4">
          <div className="text-sm font-medium">Stay on Site</div>
          <p className="mt-1 text-sm text-muted">
            Remaining setup {gbpPence(remaining)} + {gbpPence(PLANS.site.monthPence)}/month. The trial fee comes off.
          </p>
          <Button className="mt-4" onClick={onConvert} disabled={converting}>
            Convert trial
          </Button>
        </div>
      )}
      {err && <p className="mt-4 text-sm text-muted">{err}</p>}
      {rows.length === 0 && !err ? (
        <p className="mt-6 text-sm text-muted">No receipts yet.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 border-b border-line py-3 text-sm">
              <div>
                <div>{r.label}</div>
                <div className="text-xs text-subtle">
                  {r.date ? new Date(r.date).toLocaleDateString("en-GB") : ""} · {r.status}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span>{r.amount}</span>
                {r.url && (
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-muted underline-offset-4 hover:underline">
                    Receipt
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Thread({ token, tenantId, team }: { token: string; tenantId: number; team: boolean }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listMessages>>>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function reload() {
    setRows(await listMessages({ data: { token, tenantId } }));
  }
  useEffect(() => {
    void reload().catch((e) => setErr(e instanceof Error ? e.message : "Could not load messages."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tenantId]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await sendMessage({ data: { token, tenantId, body } });
      setBody("");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-line bg-surface p-6 sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight">{team ? "Conversation" : "Message the team"}</h2>
      <p className="mt-2 text-sm text-muted">
        {team ? "They see this on their account." : "Forecourt sees this in the office. Not a public ticket system — just us."}
      </p>
      {err && <p className="mt-3 text-sm text-muted">{err}</p>}
      <ol className="mt-6 max-h-[28rem] space-y-3 overflow-y-auto">
        {rows.length === 0 && <li className="text-sm text-muted">Nothing yet.</li>}
        {rows.map((m) => (
          <li
            key={m.id}
            className={cn(
              "max-w-[36rem] rounded-2xl px-4 py-3 text-sm leading-relaxed",
              m.from_team ? "ml-auto bg-fg text-accent-fg" : "bg-elevated",
            )}
          >
            <div className="text-[11px] opacity-70">{m.from_team ? "Forecourt" : m.author_email || "You"}</div>
            <div className="mt-1 whitespace-pre-wrap">{m.body}</div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="min-h-20 flex-1 rounded-2xl border border-line bg-elevated px-3 py-2 text-sm outline-none focus:border-line-strong"
          placeholder={team ? "Reply…" : "Ask us anything about the build…"}
        />
        <Button className="self-end" disabled={busy || !body.trim()} onClick={() => void send()}>
          {busy ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

export function Notes({
  token,
  tenantId,
  team,
}: {
  token: string;
  tenantId: number;
  team: boolean;
}) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listNotes>>>([]);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(team);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function reload() {
    setRows(await listNotes({ data: { token, tenantId } }));
  }
  useEffect(() => {
    void reload().catch((e) => setErr(e instanceof Error ? e.message : "Could not load notes."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tenantId]);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await addNote({
        data: { token, tenantId, body, visibility: team && internal ? "internal" : "customer" },
      });
      setBody("");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-line bg-surface p-6 sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight">{team ? "Notes" : "Notes for Forecourt"}</h2>
      <p className="mt-2 text-sm text-muted">
        {team
          ? "Internal notes stay on this file. Customer notes they can also see."
          : "Things we should know — site quirks, who signs off, when you want to go live."}
      </p>
      {err && <p className="mt-3 text-sm text-muted">{err}</p>}
      <ul className="mt-6 space-y-3">
        {rows.length === 0 && <li className="text-sm text-muted">None yet.</li>}
        {rows.map((n) => (
          <li key={n.id} className="border-b border-line py-3">
            <div className="flex justify-between gap-3 text-[11px] uppercase tracking-[0.12em] text-subtle">
              <span>
                {n.visibility === "internal" ? "Internal" : "Shared"} · {n.author_email}
              </span>
              <span>{n.created_at ? new Date(n.created_at).toLocaleDateString("en-GB") : ""}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{n.body}</p>
          </li>
        ))}
      </ul>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className="mt-4 w-full rounded-2xl border border-line bg-elevated px-3 py-2 text-sm outline-none focus:border-line-strong"
        placeholder={team ? "Add to the file…" : "Leave a note for the team…"}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {team && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
            Internal only
          </label>
        )}
        <Button disabled={busy || !body.trim()} onClick={() => void add()}>
          {busy ? "Saving…" : "Add note"}
        </Button>
      </div>
    </div>
  );
}

function People({
  token,
  tenant,
  seats,
}: {
  token: string;
  tenant: Tenant;
  seats: { id: string; title: string }[];
}) {
  const [staff, setStaff] = useState(() => {
    try {
      const parsed = JSON.parse(tenant.staff_json || "[]") as { name?: string; role?: string; email?: string }[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      /* empty */
    }
    return seats.map((s) => ({ name: "", role: s.id, email: "" }));
  });
  const [principal, setPrincipal] = useState(tenant.principal_name ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    try {
      await saveTenantFile({
        data: {
          token,
          tenantId: tenant.id,
          principal_name: principal,
          staff_json: JSON.stringify(staff),
        },
      });
      setNotice("Saved.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-line bg-surface p-6 sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight">Who’s on it</h2>
      <p className="mt-2 text-sm text-muted">Names help us set up logins. Role is the seat, not the job title.</p>
      <label className="mt-6 block text-sm">
        Dealer principal
        <input
          className="mt-1.5 h-11 w-full rounded-2xl border border-line bg-elevated px-3 text-sm"
          value={principal}
          onChange={(e) => setPrincipal(e.target.value)}
        />
      </label>
      <ul className="mt-6 space-y-3">
        {staff.map((s, i) => (
          <li key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_1fr]">
            <input
              className="h-11 rounded-2xl border border-line bg-elevated px-3 text-sm"
              placeholder="Name"
              value={s.name ?? ""}
              onChange={(e) => setStaff((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <input
              className="h-11 rounded-2xl border border-line bg-elevated px-3 text-sm"
              placeholder="Seat"
              value={s.role ?? ""}
              onChange={(e) => setStaff((prev) => prev.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}
            />
            <input
              className="h-11 rounded-2xl border border-line bg-elevated px-3 text-sm"
              placeholder="Email"
              value={s.email ?? ""}
              onChange={(e) => setStaff((prev) => prev.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
            />
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" type="button" onClick={() => setStaff((s) => [...s, { name: "", role: "sales", email: "" }])}>
          Add a person
        </Button>
        <Button disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save people"}
        </Button>
      </div>
      {notice && <p className="mt-3 text-sm text-muted">{notice}</p>}
    </div>
  );
}
