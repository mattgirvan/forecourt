import { useEffect, useState } from "react";
import { PillRow } from "@/components/ui/pill-row";
import { Link } from "@tanstack/react-router";
import { OrderBuild } from "@/components/build/order-desk";
import { SeatMatrix } from "@/components/trust/seat-matrix";
import { Button } from "@/components/ui/button";
import {
  PLANS,
  gbpPence,
  monthTotalPence,
  monthlyStartSentence,
  normalizeBilling,
  normalizePlan,
  setupDuePence,
  type BillingKind,
  type PlanId,
} from "@/lib/catalog";
import { rolesForPlan } from "@/lib/roles";
import {
  addNote,
  listMessages,
  listNotes,
  listReceipts,
  saveTenantFile,
  sendMessage,
} from "@/lib/server/portal";
import { packageLive, statusLabel, trialDaysLeft } from "@/lib/team";
import { cn } from "@/lib/utils";
import { customerStepNumber } from "@/lib/journey";
import { PaymentIssueNotice } from "@/components/account/payment-issue";
import { accountSitesSummary } from "@/lib/sites";
import { SitePill } from "@/components/account/site-billing";
import { AccountSites } from "@/components/account/account-sites";
import { parseBillingSites } from "@/lib/site-billing";
import { formatUkDate } from "@/lib/uk-date";
import { CUSTOMER_STEPS, CUSTOMER_STEP_COUNT } from "@/lib/journey";
import { Chip, Row, Rows, Section, SectionStack } from "@/components/ui/section";
import { PlanChangePanel } from "@/components/account/plan-change";

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
  stage?: string | null;
  sites?: string | null;
};

type Tab = "overview" | "sites" | "build" | "billing" | "messages" | "notes" | "people";

type Receipt = Awaited<ReturnType<typeof listReceipts>>[number];

function useReceipts(token: string, tenantId: number) {
  const [rows, setRows] = useState<Receipt[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void listReceipts({ data: { token, tenantId } })
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load receipts."));
  }, [token, tenantId]);
  return { rows, err };
}

const multiSite = (plan: PlanId) => plan === "franchise" || plan === "group";

export function DealerPortal({
  token,
  tenant,
  converting,
  onConvert,
  onNewPackage,
  notice,
}: {
  token: string;
  tenant: Tenant;
  notice?: string | null;
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
  const sitesLine = accountSitesSummary(tenant.sites);
  const isLive = tenant.stage === "live" || tenant.status === "live";
  const receipts = useReceipts(token, tenant.id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fc-text-faint)]">
        Your account
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
        {tenant.name || "Your dealership"}
      </h1>
      <p className="mt-2 text-sm text-muted" data-testid="account-line">
        {[
          statusLabel(tenant.status),
          multiSite(plan) ? sitesLine : "",
          days != null ? `${days} days left` : "",
          billing === "subscription"
            ? `${gbpPence(monthly)} a month${isLive ? "" : " from go live"}`
            : "",
          chosen.contractMonths ? `${chosen.contractMonths}-month contract` : "",
        ]
          .filter(Boolean)
          .join(", ")}
      </p>

      {notice ? (
        <p className="mt-4 rounded-[var(--fc-r-md)] border border-line bg-[var(--fc-solid)] px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}

      <PaymentIssueNotice token={token} tenantId={tenant.id} />

      <PillRow
        className="mt-6"
        label="Account sections"
        value={tab}
        onChange={setTab}
        options={(
          [
            ["overview", "Overview"],
            ...(multiSite(plan) ? ([["sites", "Sites"]] as const) : []),
            ["billing", "Plan and billing"],
            ["build", "Your desk"],
            ["messages", "Support"],
            ["notes", "Notes"],
            ...(isLive ? [] : ([["people", "People"]] as const)),
          ] as const
        ).map(([id, label]) => ({ id, label }))}
      />

      <div className="mt-6">
        {tab === "overview" && (
          <Overview
            tenant={tenant}
            plan={plan}
            billing={billing}
            days={days}
            receipts={receipts.rows}
            converting={converting}
            onConvert={onConvert}
            onNewPackage={onNewPackage}
            go={setTab}
          />
        )}
        {tab === "sites" && (
          <AccountSites
            plan={plan}
            sites={tenant.sites}
            deskUrl={
              isLive && tenant.domain
                ? `https://${tenant.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}/`
                : null
            }
            onAddSite={() => setTab("messages")}
            preLive={!isLive}
          />
        )}
        {tab === "build" && (
          <OrderBuild
            token={token}
            tenantId={tenant.id}
            team={false}
            onInviteStaff={() => setTab("people")}
          />
        )}
        {tab === "billing" && (
          <div className="fc-section-stack">
            {tenant.status === "live" && (
              <PlanChangePanel token={token} tenantId={tenant.id} plan={plan} where="account" />
            )}
            <Billing
              tenant={tenant}
              rows={receipts.rows}
              err={receipts.err}
              converting={converting}
              onConvert={onConvert}
            />
          </div>
        )}
        {tab === "messages" && <Thread token={token} tenantId={tenant.id} team={false} />}
        {tab === "notes" && <Notes token={token} tenantId={tenant.id} team={false} />}
        {tab === "people" && (
          <People
            token={token}
            tenant={tenant}
            seats={seats.map((s) => ({ id: s.id, title: s.title }))}
          />
        )}
      </div>
    </div>
  );
}

/** The one next thing for the customer, from the real build stage. */
function nextStep(
  tenant: Tenant,
  billing: BillingKind,
  days: number | null,
  step: number,
  onConvert?: () => void,
) {
  if (!packageLive(tenant.status))
    return {
      title: "Finish your order",
      line: "Your details are saved. Pay setup to put your desk on our build list.",
      action: null,
    };
  if (billing === "trial" && onConvert)
    return {
      title: "Stay on Site",
      line: `${days != null ? `${days} days left on the trial. ` : ""}If you stay, the trial fee comes off setup.`,
      action: "convert" as const,
    };
  const cur = CUSTOMER_STEPS[Math.max(1, Math.min(step, CUSTOMER_STEP_COUNT)) - 1]!;
  return { title: cur.title, line: cur.line, action: "build" as const };
}

function Overview({
  tenant,
  plan,
  days,
  billing,
  receipts,
  converting,
  onConvert,
  onNewPackage,
  go,
}: {
  tenant: Tenant;
  plan: PlanId;
  days: number | null;
  billing: BillingKind;
  receipts: Receipt[];
  converting?: boolean;
  onConvert?: () => void;
  onNewPackage?: () => void;
  go: (t: Tab) => void;
}) {
  const step = packageLive(tenant.status) ? customerStepNumber(tenant.stage) : 0;
  const isLive = tenant.stage === "live" || tenant.status === "live";
  const next = nextStep(tenant, billing, days, step, onConvert);
  const sites = parseBillingSites(tenant.sites);
  const count = Math.max(tenant.site_count ?? 1, PLANS[plan].minSites);
  const monthly = monthTotalPence(plan, tenant.site_count ?? 1);
  const cur = step > 0 ? CUSTOMER_STEPS[Math.min(step, CUSTOMER_STEP_COUNT) - 1]! : null;
  const priceLine =
    billing === "trial"
      ? days != null
        ? `${days} days left on the 60-day trial. Monthly starts only if you stay.`
        : "You are on the 60-day trial. Monthly starts only if you stay."
      : `${PLANS[plan].perSite ? `${count} sites at ${gbpPence(PLANS[plan].monthPence)}. ` : ""}${
          isLive ? "Billed monthly." : "Monthly starts on your go live day."
        }`;
  return (
    <SectionStack>
      {!isLive ? (
        <div className="fc-banner" data-testid="next-step">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{next.title}</div>
            <p className="mt-0.5 text-[12.5px] text-[var(--fc-text-dim)]">{next.line}</p>
          </div>
          {next.action === "convert" ? (
            <Button
              variant="action"
              className="min-h-11 w-full shrink-0 sm:w-auto"
              onClick={onConvert}
              disabled={converting}
            >
              Convert trial
            </Button>
          ) : next.action === "build" ? (
            <Button
              variant="action"
              className="min-h-11 w-full shrink-0 sm:w-auto"
              onClick={() => go("build")}
            >
              See your desk
            </Button>
          ) : onNewPackage ? (
            <Button
              variant="action"
              className="min-h-11 w-full shrink-0 sm:w-auto"
              onClick={onNewPackage}
            >
              Finish your order
            </Button>
          ) : null}
        </div>
      ) : null}

      {cur ? (
        <Section
          title="Your desk build"
          rail="teal"
          testId="desk-build"
          actions={
            <Chip tone={isLive ? "live" : "progress"}>
              {isLive ? "Live" : `Step ${step} of ${CUSTOMER_STEP_COUNT}`}
            </Chip>
          }
        >
          <div className="fc-steps" aria-hidden="true">
            {CUSTOMER_STEPS.map((st) => (
              <span
                key={st.id}
                className={isLive || st.n < step ? "is-done" : st.n === step ? "is-now" : undefined}
              />
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">
            {cur.title}. {cur.line}
          </p>
        </Section>
      ) : null}

      <div className="grid gap-[18px] lg:grid-cols-2">
        <Section
          title="Plan"
          rail="blue"
          testId="plan-card"
          actions={
            <Button variant="ghost" size="sm" className="min-h-11" onClick={() => go("billing")}>
              {tenant.status === "live" ? "Change plan" : "Plan and billing"}
            </Button>
          }
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fc-text-faint)]">
            {PLANS[plan].name}
          </div>
          <div className="mt-1">
            <span className="fc-big-price tabular-nums" data-testid="plan-price">
              {billing === "trial" ? gbpPence(PLANS.site.trialPence ?? 0) : gbpPence(monthly)}
            </span>
            <span className="ml-1.5 text-sm text-muted">
              {billing === "trial" ? "trial" : "a month"}
            </span>
          </div>
          <p className="mt-2 text-[12.5px] text-[var(--fc-text-faint)]">{priceLine}</p>
        </Section>

        <Section
          title="Payments"
          rail="violet"
          testId="payments-card"
          actions={
            <Button variant="ghost" size="sm" className="min-h-11" onClick={() => go("billing")}>
              All receipts
            </Button>
          }
        >
          <Rows as="ul">
            {receipts.slice(0, 2).map((r) => (
              <Row
                as="li"
                key={r.id}
                title={r.label}
                sub={r.date ? formatUkDate(r.date) : undefined}
                trailing={
                  <>
                    <span className="font-semibold tabular-nums">{r.amount}</span>
                    <Chip tone={r.status === "paid" ? "live" : "neutral"}>
                      {r.status === "paid" ? "Paid" : statusWord(r.status)}
                    </Chip>
                  </>
                }
              />
            ))}
            {billing === "subscription" && !isLive && packageLive(tenant.status) ? (
              <Row
                as="li"
                title="First month"
                sub="On go live day"
                trailing={
                  <>
                    <span className="font-semibold tabular-nums">{gbpPence(monthly)}</span>
                    <Chip tone="neutral">Due later</Chip>
                  </>
                }
              />
            ) : null}
            {receipts.length === 0 &&
            !(billing === "subscription" && !isLive && packageLive(tenant.status)) ? (
              <li className="text-sm text-muted">No payments yet.</li>
            ) : null}
          </Rows>
        </Section>
      </div>

      {multiSite(plan) && sites.length ? (
        <Section
          title="Sites"
          rail="slate"
          count={sites.filter((x) => x.status !== "archived").length}
          testId="sites-card"
          actions={
            <Button variant="ghost" size="sm" className="min-h-11" onClick={() => go("sites")}>
              Manage
            </Button>
          }
        >
          <Rows as="ul">
            {sites
              .filter((x) => x.status !== "archived")
              .slice(0, 4)
              .map((x) => (
                <Row
                  as="li"
                  key={x.code}
                  title={x.name}
                  trailing={
                    <SitePill status={isLive || x.status !== "live" ? x.status : "setting_up"} />
                  }
                />
              ))}
          </Rows>
        </Section>
      ) : null}

      <Section title="Roles" eyebrow="On the desk" rail="slate" testId="roles-card">
        <p className="text-sm text-muted">
          {tenant.domain || "Your web address is set when we go live."} Administrator is a desk
          role, not the Forecourt team.
        </p>
        <div className="mt-4">
          <SeatMatrix plan={plan} billing={billing} compact />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="min-h-11" asChild>
            <Link to="/how">How we set it up</Link>
          </Button>
          {onNewPackage ? (
            <Button variant="ghost" className="min-h-11" onClick={onNewPackage}>
              Start another package
            </Button>
          ) : null}
        </div>
      </Section>
    </SectionStack>
  );
}

function statusWord(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "";
}

function Billing({
  tenant,
  rows,
  err,
  converting,
  onConvert,
}: {
  tenant: Tenant;
  rows: Receipt[];
  err: string | null;
  converting?: boolean;
  onConvert?: () => void;
}) {
  const plan = normalizePlan(tenant.plan);
  const billing = normalizeBilling(plan, tenant.billing);
  const remaining = setupDuePence(plan, "subscription", true);

  return (
    <Section eyebrow="Billing" title="Receipts" rail="slate" count={rows.length || null}>
      <p className="text-sm text-muted">What you’ve paid, and what’s next.</p>
      {billing === "trial" && onConvert && (
        <Row tone="action" className="mt-4 flex-col !items-stretch sm:flex-row sm:!items-center">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Stay on Site</div>
            <p className="mt-1 text-sm text-muted">
              Remaining setup {gbpPence(remaining)}.{" "}
              {tenant.stage === "live" || tenant.status === "live"
                ? `Then ${gbpPence(PLANS.site.monthPence)} a month from today.`
                : monthlyStartSentence(PLANS.site.monthPence)}{" "}
              The trial fee comes off.
            </p>
          </div>
          <Button className="min-h-11 shrink-0" onClick={onConvert} disabled={converting}>
            Convert trial
          </Button>
        </Row>
      )}
      {err && <p className="mt-4 text-sm text-muted">{err}</p>}
      {rows.length === 0 && !err ? (
        <p className="mt-4 text-sm text-muted">No receipts yet.</p>
      ) : (
        <Rows as="ul" className="mt-4">
          {rows.map((r) => (
            <Row
              as="li"
              key={r.id}
              title={r.label}
              sub={[r.date ? formatUkDate(r.date) : "", statusWord(r.status)]
                .filter(Boolean)
                .join(", ")}
              trailing={
                <>
                  <span className="tabular-nums">{r.amount}</span>
                  {r.status === "paid" ? <Chip tone="live">Paid</Chip> : null}
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="fc-tap inline-flex items-center justify-center text-xs text-muted underline-offset-4 hover:underline"
                    >
                      Receipt
                    </a>
                  )}
                </>
              }
            />
          ))}
        </Rows>
      )}
    </Section>
  );
}

export function Thread({
  token,
  tenantId,
  team,
}: {
  token: string;
  tenantId: number;
  team: boolean;
}) {
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
      <h2 className="text-2xl font-semibold tracking-tight">
        {team ? "Conversation" : "Message the team"}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {team
          ? "They see this on their account."
          : "Forecourt sees this in the office. Not a public ticket system, just us."}
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
            <div className="text-[11px] opacity-70">
              {m.from_team ? "Forecourt" : m.author_email || "You"}
            </div>
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
      <h2 className="text-2xl font-semibold tracking-tight">
        {team ? "Notes" : "Notes for Forecourt"}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {team
          ? "Internal notes stay on this file. Customer notes they can also see."
          : "Things we should know: site quirks, who signs off, when you want to go live."}
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
              <span>{n.created_at ? formatUkDate(n.created_at) : ""}</span>
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
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
            />
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
      const parsed = JSON.parse(tenant.staff_json || "[]") as {
        name?: string;
        role?: string;
        email?: string;
      }[];
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
      <h2 className="text-2xl font-semibold tracking-tight">Who should we set up on your desk?</h2>
      <p className="mt-2 text-sm text-muted">
        Names help us set up logins. Role is the seat, not the job title.
      </p>
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
              onChange={(e) =>
                setStaff((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                )
              }
            />
            <input
              className="h-11 rounded-2xl border border-line bg-elevated px-3 text-sm"
              placeholder="Role"
              value={s.role ?? ""}
              onChange={(e) =>
                setStaff((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)),
                )
              }
            />
            <input
              className="h-11 rounded-2xl border border-line bg-elevated px-3 text-sm"
              placeholder="Email"
              value={s.email ?? ""}
              onChange={(e) =>
                setStaff((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)),
                )
              }
            />
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          type="button"
          onClick={() => setStaff((s) => [...s, { name: "", role: "sales", email: "" }])}
        >
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
