import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Notes, Thread } from "@/components/account/portal";
import { OrderBuild } from "@/components/build/order-desk";
import { BoardStats, CustomerTable, type BoardRow } from "@/components/office/board";
import { StaffPanel } from "@/components/office/staff-panel";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { SignInGate, useSbAccessToken } from "@/lib/sb-session";
import { normalizeBilling, normalizePlan } from "@/lib/catalog";
import {
  getTenantFile,
  listOfficeBoard,
  listReceipts,
  listStaff,
  saveTenantFile,
} from "@/lib/server/portal";
import { packageLive, statusLabel, trialDaysLeft } from "@/lib/team";
import { useWhoAmI } from "@/lib/who-am-i";
import { cn } from "@/lib/utils";

type OfficeSearch = { id?: number; tab?: "customers" | "staff" };

export const Route = createFileRoute("/office")({
  validateSearch: (raw: Record<string, unknown>): OfficeSearch => {
    const n = typeof raw.id === "string" ? Number(raw.id) : typeof raw.id === "number" ? raw.id : undefined;
    const tab = raw.tab === "staff" ? "staff" : raw.tab === "customers" ? "customers" : undefined;
    const out: OfficeSearch = {};
    if (typeof n === "number" && Number.isFinite(n)) out.id = n;
    if (tab) out.tab = tab;
    return out;
  },
  component: OfficePage,
});

function OfficePage() {
  return (
    <SiteShell>
      <SignInGate
        fallback={
          <div className="mx-auto max-w-lg px-4 py-20 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Office is for Forecourt staff.</h1>
            <p className="mt-3 text-sm text-muted">Customers have their own account. Staff sign in here.</p>
            <Button className="mt-6" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        }
      >
        <OfficeInner />
      </SignInGate>
    </SiteShell>
  );
}

function OfficeInner() {
  const token = useSbAccessToken();
  const { me, pending } = useWhoAmI();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/office" });
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [staff, setStaff] = useState<Awaited<ReturnType<typeof listStaff>>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const tab = search.tab === "staff" ? "staff" : "customers";

  async function reload() {
    if (!token) return;
    const [board, people] = await Promise.all([
      listOfficeBoard({ data: { token } }),
      listStaff({ data: { token } }).catch(() => []),
    ]);
    setRows(board);
    setStaff(people);
  }

  useEffect(() => {
    if (!token || !me?.team) return;
    void reload().catch((e) => setErr(e instanceof Error ? e.message : "Could not load the office."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, me?.team]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.name, r.email, r.group_name, r.principal_name, r.plan, r.status].some((v) =>
        (v ?? "").toLowerCase().includes(s),
      ),
    );
  }, [rows, q]);

  if (pending) return <div className="mx-auto max-w-5xl px-4 py-20 text-sm text-muted">Checking access…</div>;

  if (!me?.team) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">This is the staff office.</h1>
        <p className="mt-3 text-sm text-muted">Your login is a dealer account. An owner has to add you as staff.</p>
        <Button className="mt-6" asChild>
          <Link to="/account">Go to account</Link>
        </Button>
      </div>
    );
  }

  function go(next: OfficeSearch) {
    void navigate({ search: next });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-muted">Forecourt staff</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Office</h1>
        </div>
        <div className="flex gap-1.5">
          {(["customers", "staff"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => go({ tab: id })}
              className={cn(
                "h-9 rounded-full px-4 text-[13px]",
                tab === id && !search.id ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
              )}
            >
              {id === "customers" ? "Customers" : "Staff"}
            </button>
          ))}
        </div>
      </div>
      {err && <p className="mt-4 text-sm text-muted">{err}</p>}

      {tab === "staff" && !search.id && token && (
        <div className="mt-10">
          <StaffPanel
            token={token}
            meEmail={me.email}
            owner={me.role === "owner"}
            members={staff}
            onChange={() => void reload()}
          />
        </div>
      )}

      {tab !== "staff" && !search.id && (
        <div className="mt-10 space-y-6">
          <BoardStats rows={rows} />
          <input
            className="h-11 w-full rounded-2xl border border-line bg-elevated px-4 text-sm"
            placeholder="Find a dealership"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <CustomerTable rows={filtered} onOpen={(id) => go({ tab: "customers", id })} />
        </div>
      )}

      {search.id && token && (
        <div className="mt-10">
          <button
            type="button"
            className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
            onClick={() => go({ tab: "customers" })}
          >
            All customers
          </button>
          <div className="mt-6">
            <TenantFile token={token} tenantId={search.id} onSaved={() => void reload()} />
          </div>
        </div>
      )}
    </div>
  );
}

function TenantFile({ token, tenantId, onSaved }: { token: string; tenantId: number; onSaved: () => void }) {
  const [file, setFile] = useState<Awaited<ReturnType<typeof getTenantFile>> | null>(null);
  const [receipts, setReceipts] = useState<Awaited<ReturnType<typeof listReceipts>>>([]);
  const [research, setResearch] = useState("");
  const [principal, setPrincipal] = useState("");
  const [group, setGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pane, setPane] = useState<"build" | "file" | "support" | "notes" | "billing">("build");

  useEffect(() => {
    setFile(null);
    void getTenantFile({ data: { token, tenantId } }).then((row) => {
      setFile(row);
      setResearch(row.research ?? "");
      setPrincipal(row.principal_name ?? "");
      setGroup(row.group_name ?? "");
    });
    void listReceipts({ data: { token, tenantId } })
      .then(setReceipts)
      .catch(() => setReceipts([]));
  }, [token, tenantId]);

  if (!file) return <p className="text-sm text-muted">Loading file…</p>;

  const plan = normalizePlan(file.plan);
  const billing = normalizeBilling(plan, file.billing);
  const days = trialDaysLeft(file.trial_ends_at);

  async function save() {
    setBusy(true);
    try {
      await saveTenantFile({
        data: {
          token,
          tenantId,
          research,
          principal_name: principal,
          group_name: group,
        },
      });
      setNotice("File saved.");
      onSaved();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-[13px] font-medium text-muted">
        {statusLabel(file.status)}
        {packageLive(file.status) && billing === "trial" && days != null ? ` · ${days} days left` : ""}
        {file.term_months ? ` · ${file.term_months}-month contract` : ""}
      </p>
      <h2 className="mt-2 text-4xl font-semibold tracking-tight">{file.name}</h2>
      <p className="mt-2 text-sm text-muted">
        {plan} · {file.email || "no inbox"} · {file.phone || "no phone"}
      </p>

      <div className="mt-6 flex flex-wrap gap-1.5">
        {(
          [
            ["build", "Build"],
            ["file", "File"],
            ["billing", "Billing"],
            ["support", "Support"],
            ["notes", "Notes"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPane(id)}
            className={cn(
              "h-9 rounded-full px-4 text-[13px]",
              pane === id ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {pane === "build" && (
        <div className="mt-8">
          <OrderBuild token={token} tenantId={tenantId} team />
        </div>
      )}

      {pane === "file" && (
        <div className="mt-8 space-y-4">
          <label className="block text-sm">
            Motor group
            <input
              className="mt-1.5 h-11 w-full rounded-2xl border border-line bg-elevated px-3 text-sm"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Principal
            <input
              className="mt-1.5 h-11 w-full rounded-2xl border border-line bg-elevated px-3 text-sm"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Research — staff only
            <textarea
              rows={10}
              className="mt-1.5 w-full rounded-2xl border border-line bg-elevated px-3 py-2 text-sm leading-relaxed outline-none focus:border-line-strong"
              placeholder="What you learned on the drive. Who actually signs. Sister sites. Politics. Manufacturer credentials. Anything you don’t want sitting in their account."
              value={research}
              onChange={(e) => setResearch(e.target.value)}
            />
          </label>
          <div className="grid gap-3 text-sm text-muted sm:grid-cols-2">
            <div className="rounded-2xl border border-line p-4">
              Legal: {file.legal || "—"}
              <br />
              Domain: {file.domain || "—"}
              <br />
              Sites: {file.sites}
            </div>
            <div className="rounded-2xl border border-line p-4">
              Ingest: {file.ingest}
              <br />
              Stripe customer: {file.stripe_customer_id ? "yes" : "not yet"}
              <br />
              Desk people: {file.staff_json && file.staff_json !== "[]" ? "they named people" : "empty"}
            </div>
          </div>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save file"}
          </Button>
          {notice && <p className="text-sm text-muted">{notice}</p>}
        </div>
      )}

      {pane === "billing" && (
        <ul className="mt-8 divide-y divide-line rounded-[1.75rem] border border-line bg-surface px-6">
          {receipts.length === 0 && <li className="py-6 text-sm text-muted">No receipts.</li>}
          {receipts.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-4 text-sm">
              <div>
                <div>{r.label}</div>
                <div className="text-xs text-subtle">
                  {r.date ? new Date(r.date).toLocaleDateString("en-GB") : ""} · {r.status}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span>{r.amount}</span>
                {r.url && (
                  <a href={r.url} className="text-xs text-muted underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
                    Open
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pane === "support" && (
        <div className="mt-8">
          <Thread token={token} tenantId={tenantId} team />
        </div>
      )}

      {pane === "notes" && (
        <div className="mt-8">
          <Notes token={token} tenantId={tenantId} team />
        </div>
      )}
    </div>
  );
}
