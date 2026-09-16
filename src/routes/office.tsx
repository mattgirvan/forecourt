import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Notes, Thread } from "@/components/account/portal";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { SignInGate, useSbAccessToken } from "@/lib/sb-session";
import { normalizeBilling, normalizePlan } from "@/lib/catalog";
import {
  addTeamEmail,
  getTenantFile,
  listAllTenants,
  listReceipts,
  saveTenantFile,
  whoAmI,
} from "@/lib/server/portal";
import { packageLive, statusLabel, trialDaysLeft } from "@/lib/team";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/office")({
  validateSearch: (raw: Record<string, unknown>): { id?: number } => {
    const n = typeof raw.id === "string" ? Number(raw.id) : typeof raw.id === "number" ? raw.id : undefined;
    if (typeof n === "number" && Number.isFinite(n)) return { id: n };
    return {};
  },
  component: OfficePage,
});

function OfficePage() {
  return (
    <SiteShell>
      <SignInGate
        fallback={
          <div className="mx-auto max-w-lg px-4 py-20 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Office is for Forecourt.</h1>
            <p className="mt-3 text-sm text-muted">Sign in with the team inbox.</p>
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
  const search = Route.useSearch();
  const [team, setTeam] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listAllTenants>>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | null>(search.id ?? null);
  const [invite, setInvite] = useState("");

  async function reload() {
    if (!token) return;
    const me = await whoAmI({ data: { token } });
    setTeam(me.team);
    if (!me.team) return;
    setRows(await listAllTenants({ data: { token } }));
  }

  useEffect(() => {
    if (!token) return;
    void reload().catch((e) => setErr(e instanceof Error ? e.message : "Could not load the office."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (search.id) setActiveId(search.id);
  }, [search.id]);

  if (team === false) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">This is the team office.</h1>
        <p className="mt-3 text-sm text-muted">Your account is the dealer portal.</p>
        <Button className="mt-6" asChild>
          <Link to="/account">Go to account</Link>
        </Button>
      </div>
    );
  }

  const active = rows.find((r) => r.id === activeId) ?? rows[0] ?? null;

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[16rem_1fr]">
      <aside>
        <p className="text-[13px] font-medium text-muted">Office</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Dealerships</h1>
        {err && <p className="mt-3 text-sm text-muted">{err}</p>}
        <ul className="mt-6 space-y-1">
          {rows.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setActiveId(t.id)}
                className={cn(
                  "w-full rounded-2xl px-3 py-2 text-left text-sm",
                  t.id === (active?.id ?? null) ? "bg-elevated" : "text-muted hover:text-fg",
                )}
              >
                <div className="truncate font-medium text-fg">{t.name}</div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-subtle">
                  {statusLabel(t.status)} · {normalizePlan(t.plan)}
                </div>
              </button>
            </li>
          ))}
          {rows.length === 0 && team && <li className="text-sm text-muted">None yet.</li>}
        </ul>
        <form
          className="mt-8 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!token || !invite.trim()) return;
            void addTeamEmail({ data: { token, email: invite } })
              .then(() => setInvite(""))
              .catch((e) => setErr(e instanceof Error ? e.message : "Could not add."));
          }}
        >
          <div className="text-[11px] uppercase tracking-[0.12em] text-subtle">Team inbox</div>
          <input
            className="h-10 w-full rounded-2xl border border-line bg-elevated px-3 text-sm"
            placeholder="email@forecourt.me"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
          />
        </form>
      </aside>
      <div>
        {!token || !active ? (
          <p className="text-sm text-muted">Pick a dealership.</p>
        ) : (
          <TenantFile token={token} tenantId={active.id} onSaved={() => void reload()} />
        )}
      </div>
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
  const [pane, setPane] = useState<"file" | "support" | "notes" | "billing">("file");

  useEffect(() => {
    setFile(null);
    void getTenantFile({ data: { token, tenantId } }).then((row) => {
      setFile(row);
      setResearch(row.research ?? "");
      setPrincipal(row.principal_name ?? "");
      setGroup(row.group_name ?? "");
    });
    void listReceipts({ data: { token, tenantId } }).then(setReceipts).catch(() => setReceipts([]));
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
            Research — only you see this
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
              Staff JSON: {file.staff_json && file.staff_json !== "[]" ? "they named people" : "empty"}
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
