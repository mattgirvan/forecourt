import { useEffect, useRef, useState, type ReactNode } from "react";
import { PillRow } from "@/components/ui/pill-row";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Button } from "@/components/ui/button";
import {
  BUILD_STAGES,
  applyBrand,
  brandOptions,
  brandsOf,
  pickBrand,
  featureList,
  isBuildStage,
  packGaps,
  packGapsHelper,
  packHint,
  stageIndex,
  stageMeta,
  tenantJson,
  type BuildStage,
  type TenantPack,
} from "@/lib/build";
import {
  INGEST,
  normalizeBilling,
  normalizePlan,
  type BillingKind,
  type PlanId,
} from "@/lib/catalog";
import { ROLES } from "@/lib/roles";
import { PLAN_SHAPE, brandHint, brandLabel, multiBrand } from "@/lib/plan-shape";
import { addMeeting, getBuild, goLiveConfirm, savePack, setBuildStage } from "@/lib/server/build";
import { BrandPackPreview } from "@/components/trust/brand-preview";
import { GoLiveChecklist } from "@/components/trust/go-live-checklist";
import { cn } from "@/lib/utils";
import { Chip } from "@/components/ui/chip";
import { Section, SectionStack } from "@/components/ui/section";
import { Switch } from "@/components/ui/switch";
import { UkDateTimePicker } from "@/components/ui/uk-datetime";
import { formatUkDateTime, ukLocalToIso } from "@/lib/uk-date";
import { useWhoAmI } from "@/lib/who-am-i";
import { CUSTOMER_STEP_COUNT, customerStepFor, customerStepNumber } from "@/lib/journey";
import { JourneyNow } from "@/components/journey/after-you-pay";

const NOTIFY_KEY = "forecourt.staff.notifyCustomer";

type Build = Awaited<ReturnType<typeof getBuild>>;

type TokenStatus = {
  configured: boolean;
  source: string;
  routeEnvKeys: string[];
  runtime: string;
};

async function fetchTokenStatus(token: string): Promise<TokenStatus> {
  const res = await fetch("/api/build/token-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const body = (await res.json()) as TokenStatus & { error?: string };
  if (!res.ok) throw new Error(body.error || "Could not check token.");
  return body;
}

async function postSendToBuild(token: string, tenantId: number) {
  const res = await fetch("/api/build/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, tenantId }),
  });
  const body = (await res.json()) as {
    ok?: true;
    created?: boolean;
    repo?: string;
    logoWritten?: boolean;
    error?: string;
  };
  if (!res.ok || !body.ok) throw new Error(body.error || "Could not send.");
  return body as {
    ok: true;
    created: boolean;
    repo: string;
    logoWritten: boolean;
  };
}

/** Staff rail: every internal stage, with the customer step it shows as. */
export function StageRail({
  stage,
  onPick,
  pending = false,
}: {
  stage: string;
  onPick?: (id: BuildStage) => void;
  /** A move is in flight: no second click until it lands. */
  pending?: boolean;
}) {
  const at = stageIndex(stage);
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {BUILD_STAGES.map((s, i) => {
        const on = s.id === stage;
        const done = i < at;
        const customer = customerStepNumber(s.id);
        return (
          <li key={s.id}>
            <button
              type="button"
              disabled={!onPick || pending}
              aria-busy={pending || undefined}
              onClick={() => onPick?.(s.id)}
              className={cn(
                "w-full rounded-2xl border px-3 py-3 text-left",
                on
                  ? "border-line-strong bg-fg text-accent-fg"
                  : done
                    ? "border-line bg-elevated"
                    : "border-line",
                !onPick && "cursor-default",
                pending && "cursor-wait opacity-60",
              )}
            >
              <div
                className={cn(
                  "text-[11px] uppercase tracking-[0.12em]",
                  on ? "opacity-70" : "text-subtle",
                )}
              >
                {s.n}
              </div>
              <div className="mt-1 text-sm font-medium">{s.label}</div>
              <div className={cn("mt-0.5 text-[11px]", on ? "opacity-70" : "text-muted")}>
                Customer step {customer} of {CUSTOMER_STEP_COUNT}
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderBuild({
  token,
  tenantId,
  team,
  onInviteStaff,
  aside,
}: {
  token: string;
  tenantId: number;
  team: boolean;
  onInviteStaff?: () => void;
  /** Extra cards for the side column (Office only), for example Contact. */
  aside?: ReactNode;
}) {
  const [build, setBuild] = useState<Build | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [staffNotice, setStaffNotice] = useState<string | null>(null);
  // Emailing the customer is the default; staff can untick it and the last
  // choice is remembered on this browser.
  const [notify, setNotifyState] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(NOTIFY_KEY) === "off") setNotifyState(false);
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);
  function setNotify(on: boolean) {
    setNotifyState(on);
    try {
      window.localStorage.setItem(NOTIFY_KEY, on ? "on" : "off");
    } catch {
      /* storage blocked */
    }
  }
  // Guards the stage rail against a double click opening two confirms.
  const [moving, setMoving] = useState(false);
  const movingRef = useRef(false);

  async function reload() {
    setBuild(await getBuild({ data: { token, tenantId } }));
  }
  useEffect(() => {
    void reload().catch((e) =>
      setErr(e instanceof Error ? e.message : "Could not load the build."),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tenantId]);

  if (err) return <p className="text-sm text-muted">{err}</p>;
  if (!build) return <p className="text-sm text-muted">Loading the build…</p>;

  const plan = normalizePlan(build.plan);
  const billing = normalizeBilling(plan, build.billing);
  const meta = stageMeta(build.stage);
  const customerStep = customerStepFor(build.stage);

  function move(id: BuildStage) {
    if (!build || movingRef.current) return;
    movingRef.current = true;
    setMoving(true);
    void (async () => {
      if (id === "live" && build.stage !== "live") {
        // Going live can start the monthly plan in Stripe, so ask first.
        const { text } = await goLiveConfirm({ data: { token, tenantId } }).catch(() => ({
          text: "Mark live? This may start their monthly plan today.",
        }));
        if (typeof window !== "undefined" && !window.confirm(text)) return;
      }
      const r = await setBuildStage({ data: { token, tenantId, stage: id, notify } });
      setStaffNotice([r.billingMessage, r.emailMessage].filter(Boolean).join(" ") || null);
      await reload();
    })()
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not move the build."))
      .finally(() => {
        movingRef.current = false;
        setMoving(false);
      });
  }

  if (team) {
    const at = stageIndex(build.stage);
    const steps = BUILD_STAGES.filter((st) => st.id !== "live");
    const live = build.stage === "live";
    const stepN = live ? steps.length : Math.max(at, 0) + 1;
    return (
      <SectionStack>
        <Section
          title="Build progress"
          rail="teal"
          testId="build-progress"
          actions={
            <Chip tone={live ? "live" : "progress"}>
              {live ? "Live" : `Step ${stepN} of ${steps.length}`}
            </Chip>
          }
        >
          <div className="fc-steps" aria-hidden="true">
            {steps.map((st, j) => (
              <span
                key={st.id}
                className={live || j < at ? "is-done" : j === at ? "is-now" : undefined}
              />
            ))}
          </div>
          <div className="fc-steps-labels" aria-hidden="true">
            {steps.map((st, j) => (
              <span key={st.id} className={j === at ? "is-now" : undefined}>
                {st.label}
              </span>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted" data-testid="build-line">
            {at >= 0 && at < steps.length
              ? `Step ${at + 1} of ${steps.length}: ${meta.label}.`
              : `${meta.label}.`}
            {customerStep ? ` The customer sees \u201c${customerStep.title}\u201d` : ""}
          </p>
          {build.status === "refunded" || build.status === "cancelled" ? (
            <p className="mt-3 rounded-[var(--fc-r-md)] border border-line-strong bg-elevated px-3 py-2 text-sm">
              This order is {build.status}, so journey emails are held and going live will not start
              billing. An owner can use Resume order at the top of this file to put it back on the
              desk.
            </p>
          ) : null}
          <div className="mt-4">
            <span className="fc-field-label">Move the build to</span>
            <PillRow
              className="mt-2"
              kind="radio"
              size="sm"
              label="Build stage"
              value={isBuildStage(build.stage) ? build.stage : "paid"}
              onChange={(id) => move(id as BuildStage)}
              options={BUILD_STAGES.map((st) => ({ id: st.id, label: st.label }))}
            />
          </div>
          <Switch
            className="mt-3"
            on={notify}
            onChange={setNotify}
            label="Email the customer when I move the stage"
            hint="Sends them the progress update."
          />
          {moving ? <p className="mt-2 text-sm text-muted">Moving the build.</p> : null}
          {staffNotice ? <p className="mt-2 text-sm text-muted">{staffNotice}</p> : null}
        </Section>
        <StaffBuild
          token={token}
          tenantId={tenantId}
          build={build}
          plan={plan}
          billing={billing}
          busy={busy}
          setBusy={setBusy}
          onReload={() => void reload()}
          aside={aside}
        />
        {build.events.length ? (
          <CollapsibleSection id="dealer-history" title="History" count={build.events.length} rail="slate" testId="dealer-history">
            <Timeline events={build.events} />
          </CollapsibleSection>
        ) : null}
      </SectionStack>
    );
  }

  return (
    <div className="space-y-8">
      {team ? (
        <div>
          <p className="text-[13px] font-medium text-muted">
            {meta.label}
            {customerStep
              ? ` · customer sees Step ${customerStep.n} of ${CUSTOMER_STEP_COUNT}: ${customerStep.title}`
              : ""}
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">The build</h2>
          <p className="mt-2 max-w-xl text-sm text-muted">{meta.staff}</p>
          {build.status === "refunded" || build.status === "cancelled" ? (
            <p className="mt-3 max-w-xl rounded-xl border border-line-strong bg-elevated px-3 py-2 text-sm">
              This order is {build.status}, so journey emails are held and going live will not start
              billing. An owner can use Resume order at the top of this file to put it back on the
              desk.
            </p>
          ) : null}
        </div>
      ) : customerStep ? (
        <JourneyNow current={customerStep.n} />
      ) : (
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Your desk</h2>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Once your payment is in, your next steps show here.
          </p>
        </div>
      )}
      {!team ? (
        <GoLiveChecklist pack={build.pack} stage={build.stage} onInviteStaff={onInviteStaff} />
      ) : null}
      {team ? (
        <div className="space-y-3">
          <StageRail stage={build.stage} pending={moving} onPick={move} />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Notify customer: email them the progress update when I move the stage
          </label>
          {staffNotice ? <p className="text-sm text-muted">{staffNotice}</p> : null}
        </div>
      ) : null}
      {team ? (
        <StaffBuild
          token={token}
          tenantId={tenantId}
          build={build}
          plan={plan}
          billing={billing}
          busy={busy}
          setBusy={setBusy}
          onReload={() => void reload()}
        />
      ) : (
        <CustomerBuild
          token={token}
          tenantId={tenantId}
          build={build}
          plan={plan}
          billing={billing}
          busy={busy}
          setBusy={setBusy}
          onReload={() => void reload()}
        />
      )}
      <Timeline events={build.events} />
    </div>
  );
}

function CustomerBuild({
  token,
  tenantId,
  build,
  plan,
  billing,
  busy,
  setBusy,
  onReload,
}: {
  token: string;
  tenantId: number;
  build: Build;
  plan: PlanId;
  billing: BillingKind;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onReload: () => void;
}) {
  const [pack, setPack] = useState(build.pack);
  const gaps = packGaps(pack, plan, billing);
  useEffect(() => setPack(build.pack), [build.pack]);

  async function save() {
    setBusy(true);
    try {
      await savePack({ data: { token, tenantId, pack } });
      onReload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <article className="rounded-[1.75rem] border border-line bg-surface p-6">
        <BrandPackPreview pack={pack} onAccentPick={(id) => setPack(applyBrand(pack, id))} />
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={pack.brief.logoReady}
            onChange={(e) =>
              setPack({ ...pack, brief: { ...pack.brief, logoReady: e.target.checked } })
            }
          />
          Logo is ready (SVG or PNG), or use the group mark
        </label>
      </article>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-[1.75rem] border border-line bg-surface p-6">
          <h3 className="text-xl font-semibold tracking-tight">What we need from you</h3>
          {gaps.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              That’s enough to build. We’ll book a call if something’s still thin.
            </p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm text-muted">
              {gaps.map((g) => (
                <li key={g} className="border-b border-line py-2">
                  {g}
                </li>
              ))}
            </ul>
          )}
          <label className="mt-6 block text-sm">
            Web address you want
            <input
              className="mt-1.5 h-11 w-full rounded-2xl border border-line bg-elevated px-3 text-sm"
              value={pack.domain}
              onChange={(e) => setPack({ ...pack, domain: e.target.value })}
              placeholder="sales.yourdealership.co.uk"
            />
          </label>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pack.brief.logoReady}
              onChange={(e) =>
                setPack({ ...pack, brief: { ...pack.brief, logoReady: e.target.checked } })
              }
            />
            Logo is ready (or use the group mark)
          </label>
          <label className="mt-4 block text-sm">
            When can we talk
            <input
              className="mt-1.5 h-11 w-full rounded-2xl border border-line bg-elevated px-3 text-sm"
              value={pack.brief.meetingPreference}
              onChange={(e) =>
                setPack({ ...pack, brief: { ...pack.brief, meetingPreference: e.target.value } })
              }
              placeholder="Tue / Thu after 4, or a Teams link you use"
            />
          </label>
          <label className="mt-4 block text-sm">
            Anything we should know
            <textarea
              rows={4}
              className="mt-1.5 w-full rounded-2xl border border-line bg-elevated px-3 py-2 text-sm"
              value={pack.brief.customerNotes}
              onChange={(e) =>
                setPack({ ...pack, brief: { ...pack.brief, customerNotes: e.target.value } })
              }
            />
          </label>
          <Button className="mt-4" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Send this"}
          </Button>
        </article>
        <article className="rounded-[1.75rem] border border-line bg-surface p-6">
          <h3 className="text-xl font-semibold tracking-tight">Meetings</h3>
          <MeetingList meetings={build.meetings} />
          {build.preview_url && (
            <p className="mt-6 text-sm">
              Preview:{" "}
              <a
                className="underline-offset-4 hover:underline"
                href={build.preview_url}
                target="_blank"
                rel="noreferrer"
              >
                {build.preview_url}
              </a>
            </p>
          )}
        </article>
      </div>
    </div>
  );
}

function StaffBuild({
  token,
  tenantId,
  build,
  plan,
  billing,
  busy,
  setBusy,
  onReload,
  aside,
}: {
  token: string;
  tenantId: number;
  build: Build;
  plan: PlanId;
  billing: BillingKind;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onReload: () => void;
  aside?: ReactNode;
}) {
  const [pack, setPack] = useState(build.pack);
  const [preview, setPreview] = useState(build.preview_url);
  const [repo, setRepo] = useState(build.repo_slug);
  const [when, setWhen] = useState("");
  const [meetTitle, setMeetTitle] = useState("Briefing call");
  const [notice, setNotice] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const advanced = useAdvanced();
  const gaps = packGaps(pack, plan, billing);
  const sendReady = gaps.length === 0;
  const untouchedBrand =
    pack.franchise.id === "independent" && (pack.franchises ?? []).length === 0;
  const picked = multiBrand(plan) && untouchedBrand ? [] : brandsOf(pack);
  const sendHelper = packGapsHelper(gaps);
  const sendTip = packHint(pack, tokenStatus ? tokenStatus.configured : null);
  useEffect(() => {
    setPack(build.pack);
    setPreview(build.preview_url);
    setRepo(build.repo_slug);
  }, [build]);
  useEffect(() => {
    let cancelled = false;
    void fetchTokenStatus(token)
      .then((s) => {
        if (!cancelled) setTokenStatus(s);
      })
      .catch(() => {
        if (!cancelled) {
          setTokenStatus({
            configured: false,
            source: "none",
            routeEnvKeys: [],
            runtime: "route-handler",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function save() {
    setBusy(true);
    try {
      await savePack({ data: { token, tenantId, pack } });
      onReload();
      setNotice("Pack saved.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function fire() {
    setBusy(true);
    try {
      await savePack({ data: { token, tenantId, pack } });
      // Route handler path — same bundling as /api/stripe/webhook (not createServerFn).
      const res = await postSendToBuild(token, tenantId);
      const verb = res.created ? "Created" : "Updated";
      setNotice(
        `${verb} ${res.repo}. Pack file locked${res.logoWritten ? " (logo committed)" : ""}. Supabase and Vercel are still manual, see Advanced.`,
      );
      const status = await fetchTokenStatus(token).catch(() => null);
      if (status) setTokenStatus(status);
      onReload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  function copyJson() {
    void navigator.clipboard.writeText(JSON.stringify(tenantJson(pack), null, 2));
    setNotice("Pack file copied.");
  }

  const sites = pack.sites.map((x) => x.trim()).filter(Boolean);
  const named = pack.staff.filter((x) => x.email.includes("@")).length;
  const checks = [
    {
      label: "Name, phone and sites",
      done: Boolean(
        pack.name.trim() && pack.phone.trim() && pack.email.includes("@") && sites.length,
      ),
    },
    { label: "Web address and legal name", done: Boolean(pack.domain.trim() && pack.legal.trim()) },
    { label: "Brand colours", done: Boolean(pack.franchise.word.trim() && pack.franchise.accent) },
    {
      label: pack.brief.logoReady ? "Logo in hand" : "Logo not in yet",
      done: pack.brief.logoReady,
    },
    {
      label: named ? `People on the desk, ${named} named` : "People on the desk, none named yet",
      done: named > 0,
    },
  ];
  const sent = deskAlreadySent(build);

  return (
    <div className="fc-dealer-grid">
      <div className="fc-pack-col" data-testid="brand-pack">
        <SectionStack>
          <Section title="Dealer details" rail="blue" testId="dealer-details">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Dealership name">
                <input
                  className={inp}
                  value={pack.name}
                  onChange={(e) => setPack({ ...pack, name: e.target.value })}
                />
              </Field>
              <Field label="Web address">
                <input
                  className={inp}
                  value={pack.domain}
                  onChange={(e) => setPack({ ...pack, domain: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <input
                  className={inp}
                  value={pack.phone}
                  onChange={(e) => setPack({ ...pack, phone: e.target.value })}
                />
              </Field>
              <Field label="Inbox">
                <input
                  className={inp}
                  value={pack.email}
                  onChange={(e) => setPack({ ...pack, email: e.target.value })}
                />
              </Field>
              <Field label="Legal name">
                <input
                  className={inp}
                  value={pack.legal}
                  onChange={(e) => setPack({ ...pack, legal: e.target.value })}
                />
              </Field>
              <Field label="Group mark">
                <input
                  className={inp}
                  value={pack.groupMark}
                  onChange={(e) => setPack({ ...pack, groupMark: e.target.value })}
                />
              </Field>
              <Field
                label={PLAN_SHAPE[plan].maxSites === 1 ? "Site name" : "Sites"}
                hint={PLAN_SHAPE[plan].maxSites === 1 ? undefined : "Separate sites with a comma."}
              >
                <input
                  className={inp}
                  value={pack.sites.join(", ")}
                  onChange={(e) =>
                    setPack({
                      ...pack,
                      sites: e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
            </div>
          </Section>
          <Section title="Brand and stock" rail="blue" testId="brand-and-stock">
            <div>
              <span className="fc-field-label">{brandLabel(plan)}</span>
              <PillRow
                className="mt-2"
                kind="toggle"
                size="sm"
                label={brandLabel(plan)}
                options={brandOptions().map((b) => ({ id: b.id, label: b.label }))}
                isOn={(id) => (multiBrand(plan) ? picked.includes(id) : pack.franchise.id === id)}
                onToggle={(id) => {
                  const b = { id };
                  setPack(pickBrand(pack, b.id, plan));
                }}
              />
              <p className="mt-2 flex items-center gap-2 text-[12.5px] text-[var(--fc-text-faint)]">
                <span
                  className="size-3 rounded-full"
                  style={{ background: "var(--fc-text-faint)" }}
                  aria-hidden="true"
                />
                {multiBrand(plan)
                  ? `${picked.length} picked, desk colours from ${pack.franchise.label || pack.franchise.word}. ${brandHint(plan)}`
                  : `Desk colours from ${pack.franchise.label || pack.franchise.word}. ${brandHint(plan)}`}
              </p>
            </div>
            <div className="mt-5">
              <span className="fc-field-label">Stock comes from</span>
              <PillRow
                className="mt-2"
                kind="radio"
                size="sm"
                label="Stock comes from"
                value={pack.ingest}
                onChange={(id) => setPack({ ...pack, ingest: id })}
                options={INGEST.map((i) => ({ id: i.id, label: i.label }))}
              />
            </div>
            <div className="mt-5">
              <span className="fc-field-label">Features</span>
              <PillRow
                className="mt-2"
                kind="toggle"
                size="sm"
                label="Features"
                options={featureList().map((f) => ({ id: f.id, label: f.label }))}
                isOn={(id) => Boolean(pack.features[id])}
                onToggle={(id) =>
                  setPack({ ...pack, features: { ...pack.features, [id]: !pack.features[id] } })
                }
              />
            </div>
            <Switch
              className="mt-5"
              on={pack.brief.logoReady}
              onChange={(on) => setPack({ ...pack, brief: { ...pack.brief, logoReady: on } })}
              label="Logo in hand"
              hint="Or the group mark is enough."
            />
          </Section>
          <Section title="People on the desk" rail="blue" testId="people-on-desk">
            <div>
              <ul className="space-y-3">
                {pack.staff.map((x, i) => (
                  <li key={i} className="grid gap-2 sm:grid-cols-2">
                    <input
                      aria-label="Name"
                      className={inp}
                      placeholder="Name"
                      value={x.name}
                      onChange={(e) =>
                        setPack({
                          ...pack,
                          staff: pack.staff.map((y, j) =>
                            j === i ? { ...y, name: e.target.value } : y,
                          ),
                        })
                      }
                    />
                    <input
                      aria-label="Email"
                      className={inp}
                      placeholder="Email"
                      value={x.email}
                      onChange={(e) =>
                        setPack({
                          ...pack,
                          staff: pack.staff.map((y, j) =>
                            j === i ? { ...y, email: e.target.value } : y,
                          ),
                        })
                      }
                    />
                    <select
                      aria-label="Role"
                      className={inp}
                      value={x.role}
                      onChange={(e) =>
                        setPack({
                          ...pack,
                          staff: pack.staff.map((y, j) =>
                            j === i ? { ...y, role: e.target.value } : y,
                          ),
                        })
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Site"
                      className={inp}
                      placeholder="Site"
                      value={x.site}
                      onChange={(e) =>
                        setPack({
                          ...pack,
                          staff: pack.staff.map((y, j) =>
                            j === i ? { ...y, site: e.target.value } : y,
                          ),
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
              <Button
                variant="ghost"
                type="button"
                className="mt-2 -ml-3"
                onClick={() =>
                  setPack({
                    ...pack,
                    staff: [
                      ...pack.staff,
                      { name: "", email: "", role: "sales", site: pack.sites[0] ?? "Main" },
                    ],
                  })
                }
              >
                Add a person
              </Button>
            </div>
          </Section>
          <div>
            <Switch
              on={advanced.on}
              onChange={advanced.set}
              label="Advanced"
              hint="Staff only. Pack file, repo name and build links."
              testId="advanced-switch"
            />
            {advanced.on ? (
              <div
                className="mt-3 space-y-4 rounded-[var(--fc-r-md)] border border-[var(--fc-row-border)] p-4"
                data-testid="advanced-panel"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Slug and repo">
                    <input
                      className={inp}
                      value={pack.slug}
                      onChange={(e) => setPack({ ...pack, slug: e.target.value })}
                    />
                  </Field>
                  <Field label="Repo">
                    <input
                      className={inp}
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                      placeholder="desk-harbour-park"
                    />
                  </Field>
                  <Field label="Preview URL">
                    <input
                      className={inp}
                      value={preview}
                      onChange={(e) => setPreview(e.target.value)}
                      placeholder="https://desk-example.vercel.app"
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void setBuildStage({
                        data: {
                          token,
                          tenantId,
                          stage: preview
                            ? "preview"
                            : isBuildStage(build.stage)
                              ? build.stage
                              : "pack",
                          preview_url: preview,
                          repo_slug: repo,
                        },
                      }).then(onReload)
                    }
                  >
                    Save links
                  </Button>
                  <Button variant="secondary" type="button" onClick={copyJson}>
                    Copy pack file
                  </Button>
                  {sent && deskRepoUrl(build) ? (
                    <Button variant="ghost" asChild>
                      <a href={deskRepoUrl(build)} target="_blank" rel="noreferrer">
                        Open desk repo
                      </a>
                    </Button>
                  ) : null}
                </div>
                <TokenConfiguredDot
                  configured={Boolean(tokenStatus?.configured)}
                  source={tokenStatus?.source}
                  routeEnvKeys={tokenStatus?.routeEnvKeys}
                  serverFnEnvKeys={build.serverFnEnvKeys}
                />
                <ScaffoldStatus build={build} />
              </div>
            ) : null}
          </div>
        </SectionStack>
        <div className="fc-save-bar" data-testid="save-bar">
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? "Saving" : "Save pack"}
          </Button>
          {build.preview_url ? (
            <Button variant="ghost" asChild>
              <a href={build.preview_url} target="_blank" rel="noreferrer">
                Preview desk
              </a>
            </Button>
          ) : null}
        </div>
        {notice ? (
          <p
            className="mt-3 rounded-[var(--fc-r-md)] border border-line bg-elevated/40 px-4 py-3 text-sm text-muted"
            role="status"
          >
            {notice}
          </p>
        ) : null}
      </div>

      <SectionStack>
        <Section title="Ready to build?" rail="violet" testId="ready-to-build">
          <ul className="fc-check">
            {checks.map((c) => (
              <li key={c.label}>
                <span className={cn("fc-check-dot", c.done && "is-done")} aria-hidden="true">
                  {c.done ? "✓" : "!"}
                </span>
                <span>
                  {c.label}
                  <span className="sr-only">{c.done ? ", done" : ", to do"}</span>
                </span>
              </li>
            ))}
          </ul>
          {sendHelper ? (
            <p className="mt-3 text-[12.5px] text-[var(--fc-text-faint)]">{sendHelper}</p>
          ) : null}
          {sendTip ? (
            <p className="mt-2 text-[12.5px] text-[var(--fc-text-faint)]">{sendTip}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {sent ? (
              <>
                <Chip tone="live">Desk repo ready</Chip>
                <Button
                  variant="ghost"
                  type="button"
                  disabled={busy || !sendReady}
                  onClick={() => void fire()}
                  title={
                    sendReady ? "Create or refresh the desk repo again" : (sendTip ?? undefined)
                  }
                >
                  {busy ? "Sending" : "Send again"}
                </Button>
              </>
            ) : (
              <Button
                className="w-full"
                variant={sendReady ? "action" : "secondary"}
                disabled={busy || !sendReady}
                onClick={() => void fire()}
              >
                Send to build
              </Button>
            )}
          </div>
        </Section>
        {aside}
        <Section title="Calls" rail="slate">
          <div className="grid gap-2">
            <input
              aria-label="Call title"
              className={inp}
              value={meetTitle}
              onChange={(e) => setMeetTitle(e.target.value)}
            />
            <UkDateTimePicker value={when} onChange={setWhen} className={inp} />
            <Button
              type="button"
              variant="secondary"
              disabled={!when || busy}
              onClick={() =>
                void addMeeting({
                  data: { token, tenantId, title: meetTitle, starts_at: ukLocalToIso(when) },
                }).then(onReload)
              }
            >
              Book a call
            </Button>
          </div>
          <MeetingList meetings={build.meetings} />
        </Section>
      </SectionStack>
    </div>
  );
}

/** Advanced switch state, remembered per staff member on this browser. Off by default. */
function useAdvanced() {
  const { me } = useWhoAmI();
  const key = `forecourt.staff.advanced.${(me?.email ?? "").toLowerCase()}`;
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      setOn(window.localStorage.getItem(key) === "on");
    } catch {
      /* storage blocked: keep it off */
    }
  }, [key]);
  function set(next: boolean) {
    setOn(next);
    try {
      window.localStorage.setItem(key, next ? "on" : "off");
    } catch {
      /* storage blocked */
    }
  }
  return { on, set };
}

function TokenConfiguredDot({
  configured,
  source,
  routeEnvKeys,
  serverFnEnvKeys,
}: {
  configured: boolean;
  source?: string | null;
  routeEnvKeys?: string[] | null;
  serverFnEnvKeys?: string[] | null;
}) {
  const routeKeys = routeEnvKeys ?? [];
  const fnKeys = serverFnEnvKeys ?? [];
  const title = configured
    ? `GH_TEMPLATE_TOKEN reachable via ${source || "env"} (route handler)`
    : "GH_TEMPLATE_TOKEN is missing on the route-handler path — Send to build will fail closed";
  return (
    <span className="inline-flex max-w-full flex-col gap-1">
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-elevated px-2.5 py-1 text-[11px] text-muted"
        title={title}
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            configured ? "bg-[var(--fc-live)]" : "bg-[var(--fc-neutral-text)]",
          )}
          aria-hidden
        />
        Token {configured ? "configured" : "missing"}
        {configured && source ? <span className="text-subtle">· {source}</span> : null}
      </span>
      <span
        className="rounded-2xl border border-line bg-elevated/60 px-2.5 py-1.5 font-mono text-[10px] leading-snug text-subtle"
        title="Route handler process.env key names (same path as scaffold + Stripe webhook). Values never shown."
      >
        route: {routeKeys.length ? routeKeys.join(", ") : "(none matching)"}
      </span>
      <span
        className="rounded-2xl border border-line bg-elevated/60 px-2.5 py-1.5 font-mono text-[10px] leading-snug text-subtle"
        title="createServerFn process.env key names for comparison. Values never shown."
      >
        serverFn: {fnKeys.length ? fnKeys.join(", ") : "(none matching)"}
      </span>
    </span>
  );
}

function deskRepoUrl(build: Build): string {
  const job = build.jobs[0];
  const fromJob =
    job && "repo_html_url" in job
      ? String((job as { repo_html_url?: string }).repo_html_url ?? "").trim()
      : "";
  if (fromJob) return fromJob;
  const slug = (build.repo_slug ?? "").trim();
  return slug ? `https://github.com/mattgirvan/${slug}` : "";
}

/** True once Phase 1 scaffold has produced a desk repo (or a succeeded job). */
function deskAlreadySent(build: Build): boolean {
  const slug = (build.repo_slug ?? "").trim();
  if (slug) return true;
  if (deskRepoUrl(build)) return true;
  const jobs = build.jobs ?? [];
  if (jobs.some((j) => j.status === "succeeded")) return true;
  if (build.stage === "build" && jobs.some((j) => j.status === "succeeded")) return true;
  return false;
}

function ScaffoldStatus({ build }: { build: Build }) {
  const job = build.jobs[0];
  const repo = (build.repo_slug ?? "").trim();
  const html = deskRepoUrl(build);
  if (!repo && !job) return null;
  const status = job?.status ?? "";
  const failed = status === "failed";
  const ok = status === "succeeded" || deskAlreadySent(build);
  return (
    <article className="rounded-[1.75rem] border border-line bg-surface p-6">
      <h3 className="text-xl font-semibold tracking-tight">Desk repo</h3>
      <p className="mt-1 text-sm text-muted">
        Phase 1 scaffolds a private GitHub repo from forecourt-desk and locks tenant.json. Supabase
        and Vercel stay manual.
      </p>
      {repo ? (
        <p className="mt-4 text-sm">
          Repo:{" "}
          {html ? (
            <a
              className="font-medium underline-offset-4 hover:underline"
              href={html}
              target="_blank"
              rel="noreferrer"
            >
              {repo}
            </a>
          ) : (
            <span className="font-medium">{repo}</span>
          )}
          {status ? <span className="text-muted"> · last job {status}</span> : null}
        </p>
      ) : null}
      {failed &&
      job &&
      "error_message" in job &&
      (job as { error_message?: string }).error_message ? (
        <p className="mt-3 rounded-2xl border border-line bg-elevated/60 px-4 py-3 text-sm text-muted">
          {(job as { error_message: string }).error_message}
        </p>
      ) : null}
      {ok || repo ? (
        <div className="mt-4">
          <div className="text-sm font-medium">Next (still human)</div>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-muted">
            <li>
              New Supabase project <code className="text-fg">forecourt-&lt;slug&gt;</code> — never
              Aberdeen.
            </li>
            <li>Paste desk migrations 0001 → 0004, then insert staff from tenant.json.</li>
            <li>Link Vercel to the repo, set Supabase env, deploy, custom domain.</li>
            <li>Paste the preview URL above and move the stage to Preview.</li>
          </ol>
        </div>
      ) : null}
    </article>
  );
}

function MeetingList({ meetings }: { meetings: Build["meetings"] }) {
  if (!meetings.length) return <p className="mt-3 text-sm text-muted">None booked.</p>;
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {meetings.map((m) => (
        <li key={m.id} className="border-b border-line py-2">
          <div className="font-medium">{m.title}</div>
          <div className="text-xs text-muted">{formatUkDateTime(m.starts_at)}</div>
        </li>
      ))}
    </ul>
  );
}

function Timeline({ events }: { events: Build["events"] }) {
  if (!events.length) return null;
  return (
    <ol className="space-y-3 border-l border-line pl-4">
      {events.map((e) => (
        <li key={e.id}>
          <div className="text-sm font-medium">{e.title}</div>
          <div className="text-xs text-muted">
            {[e.body, e.created_at ? formatUkDateTime(e.created_at) : ""]
              .filter(Boolean)
              .join(", ")}
          </div>
        </li>
      ))}
    </ol>
  );
}

const inp = "h-11 w-full rounded-2xl border border-line bg-elevated px-3 text-sm";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      {label}
      {hint ? <span className="block text-[11px] text-subtle">{hint}</span> : null}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
