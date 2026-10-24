import { SkeletonCards } from "@/components/ui/skeleton";
import { askConfirm } from "@/components/ui/confirm-sheet";
import { PlanChangePanel } from "@/components/account/plan-change";
import { formatUkDate } from "@/lib/uk-date";
import { officeProfileMenu } from "@/lib/staff-nav";
import { PillRow } from "@/components/ui/pill-row";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { OfficeSiteBillingPanel } from "@/components/office/site-billing";
import { Chip, OverflowMenu, Row, Rows, Section, SectionStack } from "@/components/ui/section";
import { PaymentIssueNotice } from "@/components/account/payment-issue";
import { useEffect, useMemo, useState } from "react";
import { Notes, Thread } from "@/components/account/portal";
import { OrderBuild } from "@/components/build/order-desk";
import { OfficeOverview } from "@/components/office/overview";
import {
  BoardStats,
  CustomerTable,
  FLAG_EXPLAINERS,
  type BoardRow,
} from "@/components/office/board";
import { FileFlags } from "@/components/office/file-flags";
import { ResumeOrder } from "@/components/office/resume-order";
import { StaffPanel } from "@/components/office/staff-panel";
import { SignInMethods } from "@/components/account/sign-in-methods";
import { SiteShell } from "@/components/site-shell";
import { AppShell, type ShellNavItem } from "@/components/app-shell";
import { ChevronLeft, LayoutGrid, LifeBuoy, MapPin, Store, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignInGate, useSbAccessToken } from "@/lib/sb-session";
import { getSb } from "@/lib/sb";
import { PLANS, normalizeBilling, normalizePlan } from "@/lib/catalog";
import { goLiveConfirm } from "@/lib/server/build";
import {
  getTenantFile,
  listOfficeBoard,
  listReceipts,
  listStaff,
  refundPreview,
  runBillingAction,
  saveTenantFile,
  setTenantArchived,
} from "@/lib/server/portal";
import { packageLive, statusLabel, trialDaysLeft } from "@/lib/team";
import { OfficeMigrationPanel } from "@/components/office/migration-panel";
import { getMigration } from "@/lib/server/migration-server";
import { accountStatusLabel, type Tracker } from "@/lib/migration";
import { useWhoAmI } from "@/lib/who-am-i";
import { SupportPane, SupportQueue } from "@/components/office/support-desk";

type OfficeTab = "overview" | "customers" | "queue" | "staff" | "security" | "sites";
type OfficeSearch = { id?: number; tab?: OfficeTab };

const TAB_LABEL: Record<OfficeTab, string> = {
  overview: "Overview",
  customers: "Dealers",
  queue: "Tickets",
  sites: "Sites",
  staff: "Team",
  security: "Sign in and security",
};

export const Route = createFileRoute("/office")({
  validateSearch: (raw: Record<string, unknown>): OfficeSearch => {
    const n =
      typeof raw.id === "string" ? Number(raw.id) : typeof raw.id === "number" ? raw.id : undefined;
    const tab: OfficeTab | undefined =
      raw.tab === "overview" ||
      raw.tab === "staff" ||
      raw.tab === "queue" ||
      raw.tab === "customers" ||
      raw.tab === "security" ||
      raw.tab === "sites"
        ? raw.tab
        : undefined;
    const out: OfficeSearch = {};
    if (typeof n === "number" && Number.isFinite(n)) out.id = n;
    if (tab) out.tab = tab;
    return out;
  },
  component: OfficePage,
});

function OfficePage() {
  return (
    <SignInGate
      fallback={
        <SiteShell>
          <div className="mx-auto max-w-lg px-4 py-20 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">
              Office is for Forecourt staff.
            </h1>
            <p className="mt-3 text-sm text-muted">
              Customers have their own account. Staff sign in here.
            </p>
            <Button className="mt-6" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </SiteShell>
      }
    >
      <OfficeInner />
    </SignInGate>
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
  const [showArchived, setShowArchived] = useState(false);
  const tab: OfficeTab = search.tab ?? "overview";

  async function reload() {
    if (!token) return;
    const [board, people] = await Promise.all([
      listOfficeBoard({ data: { token, showArchived } }),
      listStaff({ data: { token } }).catch(() => []),
    ]);
    setRows(board);
    setStaff(people);
  }

  async function archiveRow(id: number, archived: boolean) {
    if (!token) return;
    const ok = await askConfirm(
      archived
        ? {
            title: "Archive this dealer?",
            body: "It leaves the main list. You can restore it from Show archived at any time.",
            confirmLabel: "Archive",
          }
        : {
            title: "Bring this dealer back?",
            body: "It goes back on the main Office list.",
            confirmLabel: "Restore",
          },
    );
    if (!ok) return;
    try {
      await setTenantArchived({ data: { token, tenantId: id, archived } });
      await reload();
      if (archived && search.id === id) go({ tab: "customers" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update archive.");
    }
  }

  useEffect(() => {
    if (!token || !me?.team) return;
    void reload().catch((e) =>
      setErr(e instanceof Error ? e.message : "Could not load the office."),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, me?.team, showArchived]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.name, r.email, r.group_name, r.principal_name, r.plan, r.status].some((v) =>
        (v ?? "").toLowerCase().includes(s),
      ),
    );
  }, [rows, q]);

  if (pending)
    return (
      <SiteShell>
        <div className="mx-auto max-w-5xl px-4 py-10">
          <SkeletonCards kind="page" count={2} label="Checking access" />
        </div>
      </SiteShell>
    );

  if (!me?.team && me?.pendingInvite && me.acceptProblem) {
    const otherSignIn = me.acceptProblem === "other-sign-in";
    return (
      <SiteShell>
        <div className="mx-auto max-w-lg px-4 py-20 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            {"Your invite isn't accepted yet."}
          </h1>
          <p className="mt-3 text-sm text-muted" data-testid="accept-problem">
            {otherSignIn
              ? "This account already has another way to sign in, such as Google, a passkey or an authenticator app, so it can't join the team yet. An invite has to be accepted with an email code first; Google or a passkey can be added on your Account page after that. Tell Matt."
              : "Sorry, we couldn't finish accepting your invite. Please try again, or tell Matt."}
          </p>
          {otherSignIn ? null : (
            <Button
              className="mt-6"
              onClick={() => {
                // Each try needs a fresh email code: putting the invite back
                // restarts its clock.
                void getSb()
                  .auth.signOut()
                  .finally(() => void navigate({ to: "/login" }));
              }}
            >
              Try again
            </Button>
          )}
        </div>
      </SiteShell>
    );
  }

  if (!me?.team && me?.pendingInvite) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-lg px-4 py-20 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">{"You've been invited."}</h1>
          <p className="mt-3 text-sm text-muted">
            Sign in with an email code to accept your invite. After that you can add Google or a
            passkey on your Account page.
          </p>
          <Button
            className="mt-6"
            onClick={() => {
              void getSb()
                .auth.signOut()
                .finally(() => void navigate({ to: "/login" }));
            }}
          >
            Sign out and get an email code
          </Button>
        </div>
      </SiteShell>
    );
  }

  if (!me?.team) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-lg px-4 py-20 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">This is the staff office.</h1>
          <p className="mt-3 text-sm text-muted">
            Your login is a dealer account. An owner has to add you as staff.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/account">Go to account</Link>
          </Button>
        </div>
      </SiteShell>
    );
  }

  function go(next: OfficeSearch) {
    void navigate({ search: next });
  }

  const nav: ShellNavItem[] = [
    {
      key: "overview",
      label: "Overview",
      icon: LayoutGrid,
      to: "/office",
      search: { tab: "overview" },
      bottom: true,
    },
    {
      key: "customers",
      label: "Dealers",
      icon: Store,
      to: "/office",
      search: { tab: "customers" },
      count: rows.length,
      bottom: true,
    },
    {
      key: "queue",
      label: "Tickets",
      icon: LifeBuoy,
      to: "/office",
      search: { tab: "queue" },
      bottom: true,
    },
    {
      key: "sites",
      label: "Sites",
      icon: MapPin,
      to: "/office",
      search: { tab: "sites" },
      bottom: true,
    },
    { key: "staff", label: "Team", icon: Users, to: "/office", search: { tab: "staff" } },
  ];

  return (
    <AppShell
      area="office"
      items={nav}
      active={search.id ? "customers" : tab}
      pageKey={search.id ? `file-${search.id}` : tab}
      user={{ name: me.name || me.email, sub: me.role === "owner" ? "Owner" : "Office team" }}
      menu={officeProfileMenu(me.team)}
    >
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        <div className={(tab === "overview" && !search.id) || search.id ? "sr-only" : undefined}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--fc-text-faint)]">
            Office
          </p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight sm:text-[34px]">
            {search.id ? "Dealer file" : TAB_LABEL[tab]}
          </h1>
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

        {tab === "sites" && !search.id && token && (
          <div className="mt-6">
            <OfficeSiteBillingPanel token={token} />
          </div>
        )}

        {tab === "queue" && !search.id && token && (
          <div className="mt-10">
            <SupportQueue token={token} />
          </div>
        )}

        {tab === "security" && !search.id && (
          <div className="mt-10 max-w-2xl space-y-4" data-testid="office-security">
            <div>
              <h2 className="text-lg font-medium">Sign-in & security</h2>
              <p className="mt-1 text-sm text-muted">
                You can always sign in with an email code. A passkey lets you skip the code.
              </p>
            </div>
            <SignInMethods embedded />
          </div>
        )}

        {tab === "overview" && !search.id && (
          <OfficeOverview
            rows={rows}
            firstName={(me.name || "").split(/\s+/)[0] ?? ""}
            onOpen={(id) => go({ tab: "customers", id })}
            onSearch={() => go({ tab: "customers" })}
          />
        )}

        {tab === "customers" && !search.id && (
          <div className="mt-10 space-y-6">
            <BoardStats rows={rows} />
            <div className="flex flex-wrap items-center gap-3">
              <input
                className="h-11 min-w-[12rem] flex-1 rounded-2xl border border-line bg-elevated px-4 text-sm"
                placeholder="Find a dealership"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-2xl border border-line bg-elevated px-4 text-sm text-muted">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--emerald)]"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                Show archived
              </label>
            </div>
            {showArchived ? (
              <p className="text-sm text-muted">
                Archived orders only. Unarchive puts them back on the main list.
              </p>
            ) : null}
            <CustomerTable
              rows={filtered}
              onOpen={(id) => go({ tab: "customers", id })}
              onArchive={(id, archived) => void archiveRow(id, archived)}
              archivedView={showArchived}
            />
          </div>
        )}

        {search.id && token && (
          <div className="mt-0">
            <button
              type="button"
              className="-ml-2 inline-flex min-h-11 min-w-11 items-center gap-1 rounded-[var(--fc-r-sm)] pl-1 pr-3 text-sm text-muted hover:text-fg"
              onClick={() => go({ tab: "customers" })}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              All dealers
            </button>
            <div className="mt-2">
              <TenantFile
                token={token}
                tenantId={search.id}
                paymentFailed={!!rows.find((r) => r.id === search.id)?.flags?.paymentFailed}
                waiting={!!rows.find((r) => r.id === search.id)?.waiting}
                onSaved={() => void reload()}
              />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function TenantFile({
  token,
  tenantId,
  paymentFailed = false,
  waiting = false,
  onSaved,
}: {
  token: string;
  tenantId: number;
  paymentFailed?: boolean;
  waiting?: boolean;
  onSaved: () => void;
}) {
  const { me } = useWhoAmI();
  const owner = me?.role === "owner";
  const [file, setFile] = useState<Awaited<ReturnType<typeof getTenantFile>> | null>(null);
  const [receipts, setReceipts] = useState<Awaited<ReturnType<typeof listReceipts>>>([]);
  const [research, setResearch] = useState("");
  const [principal, setPrincipal] = useState("");
  const [group, setGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pane, setPane] = useState<"build" | "file" | "requests" | "support" | "notes" | "billing">(
    "build",
  );
  const [migration, setMigration] = useState<Tracker | null>(null);
  const loadMigration = () =>
    void getMigration({ data: { token, tenantId } })
      .then(setMigration)
      .catch(() => setMigration(null));

  useEffect(() => {
    setFile(null);
    setMigration(null);
    loadMigration();
    void getTenantFile({ data: { token, tenantId } }).then((row) => {
      setFile(row);
      setResearch(row.research ?? "");
      setPrincipal(row.principal_name ?? "");
      setGroup(row.group_name ?? "");
    });
    void listReceipts({ data: { token, tenantId } })
      .then(setReceipts)
      .catch(() => setReceipts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tenantId]);

  if (!file) return <SkeletonCards kind="build" count={2} label="Loading file" />;

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

  async function billingAction(action: "cancel" | "refund" | "sign-off") {
    // Busy from the first click, so a double click cannot open two confirms.
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      let title = "End this package?";
      let confirmLabel = "End package";
      let question =
        "If they are on a monthly Stripe plan, it stops at the period end. A 60-day trial has no monthly, so this just marks it cancelled.";
      let expectPaymentIntent: string | undefined;
      if (action === "sign-off") {
        // Signing off can start the monthly plan in Stripe, so say so.
        const { text } = await goLiveConfirm({ data: { token, tenantId } }).catch(() => ({
          text: "Mark live? This may start their monthly plan today.",
        }));
        title = "Go live?";
        confirmLabel = "Go live";
        question = `${text} Setup is then not refundable.`;
      } else if (action === "refund") {
        // Name the exact payment and amount before anything is sent back.
        const preview = await refundPreview({ data: { token, tenantId } });
        if (!preview.paymentIntent) {
          setNotice(preview.text);
          return;
        }
        title = "Refund this payment?";
        confirmLabel = "Refund";
        question = preview.text;
        expectPaymentIntent = preview.paymentIntent;
      }
      const ok = await askConfirm({
        title,
        body: question,
        confirmLabel,
        tone: action === "sign-off" ? "action" : "danger",
      });
      if (!ok) return;
      const res = await runBillingAction({
        data: { token, tenantId, action, expectPaymentIntent },
      });
      setNotice(res.message);
      const [row, rec] = await Promise.all([
        getTenantFile({ data: { token, tenantId } }),
        listReceipts({ data: { token, tenantId } }).catch(() => receipts),
      ]);
      setFile(row);
      setReceipts(rec);
      onSaved();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not update billing.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive() {
    if (!file) return;
    const archived = !file.archived_at;
    const ok = await askConfirm(
      archived
        ? {
            title: "Archive this dealer?",
            body: "It leaves the main list. You can restore it from Show archived at any time.",
            confirmLabel: "Archive",
          }
        : {
            title: "Bring this dealer back?",
            body: "It goes back on the main Office list.",
            confirmLabel: "Restore",
          },
    );
    if (!ok) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await setTenantArchived({ data: { token, tenantId, archived } });
      setFile((prev) => (prev ? { ...prev, archived_at: res.archived_at } : prev));
      setNotice(archived ? "Archived. Hidden from the main list." : "Restored to the main list.");
      onSaved();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not update archive.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="fc-avatar mt-1 size-11 shrink-0 text-[13px]" aria-hidden="true">
            {file.name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w: string) => w[0]!.toUpperCase())
              .join("")}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--fc-text-faint)]"
              data-testid="file-plan-line"
            >
              {[
                PLANS[plan].name,
                `${file.site_count ?? 1} ${(file.site_count ?? 1) === 1 ? "site" : "sites"}`,
                accountStatusLabel(migration) === "Migration" ? "Migration" : "",
                packageLive(file.status) && billing === "trial" && days != null
                  ? `${days} days left`
                  : "",
                file.term_months ? `${file.term_months}-month contract` : "",
                file.archived_at ? "Archived" : "",
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
            <h2 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight sm:text-[34px]">
              {file.name}
            </h2>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              <Chip tone={file.status === "live" || file.status === "paid" ? "live" : "neutral"}>
                {statusLabel(file.status)}
              </Chip>
              <span className="min-w-0 break-words">
                {[file.email || "No inbox", file.phone || "No phone"].join(", ")}
              </span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <OverflowMenu
            label={`More for ${file.name}`}
            items={[
              {
                label: busy ? "Working" : file.archived_at ? "Unarchive" : "Archive",
                disabled: busy,
                onSelect: () => void toggleArchive(),
              },
            ]}
          />
          {waiting ? (
            <Button
              variant="action"
              type="button"
              className="flex-1 sm:flex-none"
              onClick={() => setPane("requests")}
            >
              Reply
            </Button>
          ) : (
            <Button
              variant="secondary"
              type="button"
              className="flex-1 sm:flex-none"
              onClick={() => setPane("requests")}
            >
              Open tickets
            </Button>
          )}
        </div>
      </div>
      {owner ? (
        <div className="mt-4">
          <ResumeOrder
            key={`${tenantId}-${file.status ?? ""}`}
            token={token}
            tenantId={tenantId}
            status={file.status}
            onDone={() => {
              void getTenantFile({ data: { token, tenantId } }).then(setFile);
              onSaved();
            }}
          />
        </div>
      ) : null}
      {paymentFailed ? (
        <p
          className="mt-4 rounded-[var(--fc-r-md)] border border-[rgba(227,169,79,0.45)] bg-[var(--fc-amber-tint)] px-4 py-3 text-sm text-fg"
          data-testid="file-payment-failed"
        >
          {FLAG_EXPLAINERS.paymentFailed}
        </p>
      ) : null}
      <FileFlags
        key={`flags-${tenantId}`}
        token={token}
        tenantId={tenantId}
        owner={owner}
        onChanged={onSaved}
      />

      <PillRow
        className="mt-6"
        label="Dealer file sections"
        value={pane}
        onChange={setPane}
        options={[
          { id: "build", label: "Setup" },
          { id: "file", label: "File" },
          { id: "billing", label: "Billing" },
          { id: "requests", label: "Tickets" },
          { id: "support", label: "Old messages" },
          { id: "notes", label: "Notes" },
        ]}
      />

      {pane === "build" && (
        <div className="mt-6">
          <OrderBuild
            token={token}
            tenantId={tenantId}
            team
            aside={
              <Section title="Contact" rail="slate" testId="file-contact">
                <Rows>
                  <Row
                    lead={
                      <span className="fc-avatar">
                        {(principal || file.name)
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((w: string) => w[0]!.toUpperCase())
                          .join("")}
                      </span>
                    }
                    title={principal || "Principal not named yet"}
                    sub={
                      [principal ? "Dealer principal" : "", file.email || ""]
                        .filter(Boolean)
                        .join(", ") || "No inbox yet"
                    }
                  />
                  {file.phone ? (
                    <Row
                      title="Phone"
                      sub={file.phone}
                      trailing={
                        <Button variant="secondary" size="sm" className="h-11" asChild>
                          <a href={`tel:${file.phone.replace(/\s+/g, "")}`}>Call</a>
                        </Button>
                      }
                    />
                  ) : null}
                </Rows>
              </Section>
            }
          />
        </div>
      )}

      {pane === "file" && (
        <SectionStack className="mt-6">
          <Section title="Dealer file" rail="blue">
            <div className="space-y-4">
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
                Research, staff only
                <textarea
                  rows={10}
                  className="mt-1.5 w-full rounded-2xl border border-line bg-elevated px-3 py-2 text-sm leading-relaxed outline-none focus:border-line-strong"
                  placeholder="What you learned on the drive. Who actually signs. Sister sites. Politics. Manufacturer credentials. Anything you don’t want sitting in their account."
                  value={research}
                  onChange={(e) => setResearch(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={busy} onClick={() => void save()}>
                  {busy ? "Saving…" : "Save file"}
                </Button>
                {notice && <p className="text-sm text-muted">{notice}</p>}
              </div>
            </div>
          </Section>
          <Section title="On file" rail="slate">
            <Rows>
              <Row className="fc-row-kv" title="Legal" trailing={file.legal || "Not set"} />
              <Row className="fc-row-kv" title="Domain" trailing={file.domain || "Not set"} />
              <Row className="fc-row-kv" title="Sites" trailing={String(file.sites)} />
              <Row className="fc-row-kv" title="Ingest" trailing={String(file.ingest)} />
              <Row
                className="fc-row-kv"
                title="Stripe customer"
                trailing={file.stripe_customer_id ? "Yes" : "Not yet"}
              />
              <Row
                className="fc-row-kv"
                title="Desk people"
                trailing={
                  file.staff_json && file.staff_json !== "[]" ? "They named people" : "Empty"
                }
              />
            </Rows>
          </Section>
        </SectionStack>
      )}

      {pane === "billing" && (
        <SectionStack className="mt-6">
          <PaymentIssueNotice token={token} tenantId={tenantId} team />
          {migration?.open ? (
            <OfficeMigrationPanel token={token} tracker={migration} onChanged={loadMigration} owner={owner} />
          ) : null}
          {file && (
            <PlanChangePanel
              token={token}
              tenantId={tenantId}
              plan={normalizePlan(file.plan as string)}
              where="office"
            />
          )}
          <Section title="Receipts" rail="slate" count={receipts.length || null}>
            <Rows as="ul">
              {receipts.length === 0 && <li className="py-2 text-sm text-muted">No receipts.</li>}
              {receipts.map((r) => (
                <Row
                  as="li"
                  key={r.id}
                  title={r.label}
                  sub={`${r.date ? formatUkDate(r.date) : ""}${r.date ? ", " : ""}${r.status}`}
                  trailing={
                    <>
                      <span className="tabular-nums">{r.amount}</span>
                      {r.status === "paid" ? <Chip tone="live">Paid</Chip> : null}
                      {r.url && (
                        <a
                          href={r.url}
                          className="fc-tap inline-flex items-center justify-center text-xs text-muted underline-offset-4 hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      )}
                    </>
                  }
                />
              ))}
            </Rows>
          </Section>
          {owner && (
            <Section title="Package" rail="slate">
              <p className="text-sm text-muted">
                {file.signed_off_at
                  ? "Signed off live. Setup is not refundable from here."
                  : "Refund sends the last card payment back. End package stops the monthly payments, or cancels a trial."}
              </p>
              {notice && (
                <p className="mt-3 rounded-xl border border-line-strong bg-elevated px-3 py-2 text-sm">
                  {notice}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || Boolean(file.signed_off_at)}
                  onClick={() => void billingAction("sign-off")}
                >
                  {busy ? "Working…" : "Sign off live"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void billingAction("cancel")}
                >
                  End package
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || Boolean(file.signed_off_at)}
                  onClick={() => void billingAction("refund")}
                >
                  Refund last payment
                </Button>
              </div>
            </Section>
          )}
        </SectionStack>
      )}

      {pane === "requests" && (
        <div className="mt-6">
          <Section title="Tickets and requests" rail="violet">
            <SupportPane token={token} tenantId={tenantId} />
          </Section>
        </div>
      )}

      {pane === "support" && (
        <div className="mt-6">
          <Section title="Old messages" rail="violet">
            <Thread token={token} tenantId={tenantId} team />
          </Section>
        </div>
      )}

      {pane === "notes" && (
        <div className="mt-6">
          <Section title="Notes" rail="violet">
            <Notes token={token} tenantId={tenantId} team />
          </Section>
        </div>
      )}
    </div>
  );
}
