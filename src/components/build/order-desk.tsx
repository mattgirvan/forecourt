import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  BUILD_STAGES,
  applyBrand,
  brandOptions,
  featureList,
  isBuildStage,
  packGaps,
  stageIndex,
  stageMeta,
  tenantJson,
  type BuildStage,
  type TenantPack,
} from "@/lib/build";
import { INGEST, normalizePlan, type PlanId } from "@/lib/catalog";
import { ROLES } from "@/lib/roles";
import { addMeeting, getBuild, savePack, sendToBuild, setBuildStage } from "@/lib/server/build";
import { cn } from "@/lib/utils";

type Build = Awaited<ReturnType<typeof getBuild>>;

export function StageRail({
  stage,
  onPick,
}: {
  stage: string;
  onPick?: (id: BuildStage) => void;
}) {
  const at = stageIndex(stage);
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {BUILD_STAGES.map((s, i) => {
        const on = s.id === stage;
        const done = i < at;
        return (
          <li key={s.id}>
            <button
              type="button"
              disabled={!onPick}
              onClick={() => onPick?.(s.id)}
              className={cn(
                "w-full rounded-2xl border px-3 py-3 text-left",
                on ? "border-line-strong bg-fg text-accent-fg" : done ? "border-line bg-elevated" : "border-line",
                !onPick && "cursor-default",
              )}
            >
              <div className={cn("text-[11px] uppercase tracking-[0.12em]", on ? "opacity-70" : "text-subtle")}>{s.n}</div>
              <div className="mt-1 text-sm font-medium">{s.label}</div>
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
}: {
  token: string;
  tenantId: number;
  team: boolean;
}) {
  const [build, setBuild] = useState<Build | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setBuild(await getBuild({ data: { token, tenantId } }));
  }
  useEffect(() => {
    void reload().catch((e) => setErr(e instanceof Error ? e.message : "Could not load the build."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tenantId]);

  if (err) return <p className="text-sm text-muted">{err}</p>;
  if (!build) return <p className="text-sm text-muted">Loading the build…</p>;

  const plan = normalizePlan(build.plan);
  const meta = stageMeta(build.stage);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[13px] font-medium text-muted">{meta.label}</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">{team ? "The build" : "Your desk"}</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">{team ? meta.staff : meta.customer}</p>
      </div>
      <StageRail
        stage={build.stage}
        onPick={
          team
            ? (id) => {
                void setBuildStage({ data: { token, tenantId, stage: id } }).then(() => reload());
              }
            : undefined
        }
      />
      {team ? (
        <StaffBuild
          token={token}
          tenantId={tenantId}
          build={build}
          plan={plan}
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
  busy,
  setBusy,
  onReload,
}: {
  token: string;
  tenantId: number;
  build: Build;
  plan: PlanId;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onReload: () => void;
}) {
  const [pack, setPack] = useState(build.pack);
  const gaps = packGaps(pack, plan);
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
    <div className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-[1.75rem] border border-line bg-surface p-6">
        <h3 className="text-xl font-semibold tracking-tight">What we need from you</h3>
        {gaps.length === 0 ? (
          <p className="mt-2 text-sm text-muted">That’s enough to build. We’ll book a call if something’s still thin.</p>
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
            onChange={(e) => setPack({ ...pack, brief: { ...pack.brief, logoReady: e.target.checked } })}
          />
          Logo is ready (or use the group mark)
        </label>
        <label className="mt-4 block text-sm">
          When can we talk
          <input
            className="mt-1.5 h-11 w-full rounded-2xl border border-line bg-elevated px-3 text-sm"
            value={pack.brief.meetingPreference}
            onChange={(e) => setPack({ ...pack, brief: { ...pack.brief, meetingPreference: e.target.value } })}
            placeholder="Tue / Thu after 4, or a Teams link you use"
          />
        </label>
        <label className="mt-4 block text-sm">
          Anything we should know
          <textarea
            rows={4}
            className="mt-1.5 w-full rounded-2xl border border-line bg-elevated px-3 py-2 text-sm"
            value={pack.brief.customerNotes}
            onChange={(e) => setPack({ ...pack, brief: { ...pack.brief, customerNotes: e.target.value } })}
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
            <a className="underline-offset-4 hover:underline" href={build.preview_url} target="_blank" rel="noreferrer">
              {build.preview_url}
            </a>
          </p>
        )}
      </article>
    </div>
  );
}

function StaffBuild({
  token,
  tenantId,
  build,
  plan,
  busy,
  setBusy,
  onReload,
}: {
  token: string;
  tenantId: number;
  build: Build;
  plan: PlanId;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onReload: () => void;
}) {
  const [pack, setPack] = useState(build.pack);
  const [preview, setPreview] = useState(build.preview_url);
  const [repo, setRepo] = useState(build.repo_slug);
  const [when, setWhen] = useState("");
  const [meetTitle, setMeetTitle] = useState("Briefing call");
  const [notice, setNotice] = useState<string | null>(null);
  const gaps = packGaps(pack, plan);
  useEffect(() => {
    setPack(build.pack);
    setPreview(build.preview_url);
    setRepo(build.repo_slug);
  }, [build]);

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
      const res = await sendToBuild({ data: { token, tenantId } });
      setNotice(`Queued. Repo ${res.repo}. Clone the template, drop the pack, new database, Vercel.`);
      onReload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  function copyJson() {
    void navigator.clipboard.writeText(JSON.stringify(tenantJson(pack), null, 2));
    setNotice("tenant.json copied.");
  }

  return (
    <div className="space-y-4">
      <article className="rounded-[1.75rem] border border-line bg-surface p-6">
        <h3 className="text-xl font-semibold tracking-tight">Brand pack</h3>
        <p className="mt-1 text-sm text-muted">This becomes tenant.json. You do not edit App.jsx to change their name.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Field label="Dealership">
            <input className={inp} value={pack.name} onChange={(e) => setPack({ ...pack, name: e.target.value })} />
          </Field>
          <Field label="Legal">
            <input className={inp} value={pack.legal} onChange={(e) => setPack({ ...pack, legal: e.target.value })} />
          </Field>
          <Field label="Group mark">
            <input className={inp} value={pack.groupMark} onChange={(e) => setPack({ ...pack, groupMark: e.target.value })} />
          </Field>
          <Field label="Slug / repo">
            <input className={inp} value={pack.slug} onChange={(e) => setPack({ ...pack, slug: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className={inp} value={pack.phone} onChange={(e) => setPack({ ...pack, phone: e.target.value })} />
          </Field>
          <Field label="Inbox">
            <input className={inp} value={pack.email} onChange={(e) => setPack({ ...pack, email: e.target.value })} />
          </Field>
          <Field label="Domain">
            <input className={inp} value={pack.domain} onChange={(e) => setPack({ ...pack, domain: e.target.value })} />
          </Field>
          <Field label="Sites (comma)">
            <input
              className={inp}
              value={pack.sites.join(", ")}
              onChange={(e) => setPack({ ...pack, sites: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
          </Field>
        </div>
        <div className="mt-4">
          <div className="text-sm">Franchise</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {brandOptions().map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setPack(applyBrand(pack, b.id))}
                className={cn(
                  "h-9 rounded-full px-3 text-xs",
                  pack.franchise.id === b.id ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <span className="size-3 rounded-full" style={{ background: pack.franchise.accent }} />
            {pack.franchise.word} · {pack.franchise.accent}
          </div>
        </div>
        <div className="mt-4">
          <div className="text-sm">Ingest</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {INGEST.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => setPack({ ...pack, ingest: i.id })}
                className={cn("h-9 rounded-full px-3 text-xs", pack.ingest === i.id ? "bg-fg text-accent-fg" : "bg-elevated text-muted")}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <div className="text-sm">Features</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {featureList().map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setPack({ ...pack, features: { ...pack.features, [f.id]: !pack.features[f.id] } })}
                className={cn(
                  "h-9 rounded-full px-3 text-xs",
                  pack.features[f.id] ? "bg-fg text-accent-fg" : "bg-elevated text-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-6">
          <div className="text-sm">Staff on the desk</div>
          <ul className="mt-2 space-y-2">
            {pack.staff.map((s, i) => (
              <li key={i} className="grid gap-2 sm:grid-cols-4">
                <input className={inp} placeholder="Name" value={s.name} onChange={(e) => setPack({ ...pack, staff: pack.staff.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <input className={inp} placeholder="Email" value={s.email} onChange={(e) => setPack({ ...pack, staff: pack.staff.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)) })} />
                <select className={inp} value={s.role} onChange={(e) => setPack({ ...pack, staff: pack.staff.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)) })}>
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
                <input className={inp} placeholder="Site" value={s.site} onChange={(e) => setPack({ ...pack, staff: pack.staff.map((x, j) => (j === i ? { ...x, site: e.target.value } : x)) })} />
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 text-sm text-muted underline-offset-4 hover:underline"
            onClick={() => setPack({ ...pack, staff: [...pack.staff, { name: "", email: "", role: "sales", site: pack.sites[0] ?? "Main" }] })}
          >
            Add a seat
          </button>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={pack.brief.logoReady}
            onChange={(e) => setPack({ ...pack, brief: { ...pack.brief, logoReady: e.target.checked } })}
          />
          Logo in hand (or group mark is enough)
        </label>
        {gaps.length > 0 && (
          <p className="mt-4 text-sm text-muted">Still thin: {gaps.join(" · ")}</p>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save pack"}
          </Button>
          <Button variant="secondary" type="button" onClick={copyJson}>
            Copy tenant.json
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void fire()}>
            Send to build
          </Button>
        </div>
      </article>

      <article className="rounded-[1.75rem] border border-line bg-surface p-6">
        <h3 className="text-xl font-semibold tracking-tight">Ship</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Preview URL">
            <input className={inp} value={preview} onChange={(e) => setPreview(e.target.value)} placeholder="https://desk-….vercel.app" />
          </Field>
          <Field label="Repo">
            <input className={inp} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="desk-harbour-park" />
          </Field>
        </div>
        <Button
          className="mt-4"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void setBuildStage({
              data: {
                token,
                tenantId,
                stage: preview ? "preview" : isBuildStage(build.stage) ? build.stage : "pack",
                preview_url: preview,
                repo_slug: repo,
              },
            }).then(onReload)
          }
        >
          Save URLs
        </Button>
        <div className="mt-8 border-t border-line pt-6">
          <div className="text-sm font-medium">Book a call</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
            <input className={inp} value={meetTitle} onChange={(e) => setMeetTitle(e.target.value)} />
            <input className={inp} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            <Button
              type="button"
              disabled={!when || busy}
              onClick={() =>
                void addMeeting({
                  data: { token, tenantId, title: meetTitle, starts_at: new Date(when).toISOString() },
                }).then(onReload)
              }
            >
              Book
            </Button>
          </div>
          <MeetingList meetings={build.meetings} />
        </div>
      </article>
      {notice && <p className="text-sm text-muted">{notice}</p>}
    </div>
  );
}

function MeetingList({ meetings }: { meetings: Build["meetings"] }) {
  if (!meetings.length) return <p className="mt-3 text-sm text-muted">None booked.</p>;
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {meetings.map((m) => (
        <li key={m.id} className="border-b border-line py-2">
          <div className="font-medium">{m.title}</div>
          <div className="text-xs text-muted">{new Date(m.starts_at).toLocaleString("en-GB")}</div>
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
            {e.body} · {e.created_at ? new Date(e.created_at).toLocaleString("en-GB") : ""}
          </div>
        </li>
      ))}
    </ol>
  );
}

const inp = "h-11 w-full rounded-2xl border border-line bg-elevated px-3 text-sm";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      {label}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
