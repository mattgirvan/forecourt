import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { gbp, resumeSteps } from "@/lib/server/resume-order";
import { resumeOrder, resumePreview, sendBalanceLink, type ResumePreview } from "@/lib/server/resume-order-api";
import { cn } from "@/lib/utils";

/** Staff see Resume order only on refunded or cancelled files. */
function canResume(status: string | null | undefined) {
  return status === "refunded" || status === "cancelled";
}

function timeUk(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

function Money({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-2xl border px-4 py-3", strong ? "border-line-strong bg-elevated" : "border-line")}>
      <div className="text-[11px] uppercase tracking-[0.12em] text-subtle">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold tracking-tight", strong && "text-fg")}>{value}</div>
    </div>
  );
}

export type ResumeChoiceState = { undoCancel: boolean; newSubscription: boolean };

/** The confirm panel. Plain props, so it renders the same with dummy data. */
export function ResumeOrderPanel({
  preview,
  choice,
  onChoice,
  busy,
  onConfirm,
  onClose,
  emailLink,
  onEmailLink,
  onSendLink,
  link,
  notice,
}: {
  preview: ResumePreview;
  choice: ResumeChoiceState;
  onChoice: (c: ResumeChoiceState) => void;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
  emailLink: boolean;
  onEmailLink: (on: boolean) => void;
  onSendLink: () => void;
  link: { url: string; message: string } | null;
  notice: string | null;
}) {
  const b = preview.balance;
  const plan = preview.plan;
  const owed = b.owedPence > 0;
  const [copied, setCopied] = useState(false);
  const steps = resumeSteps({
    status: preview.status,
    stage: preview.stagePick,
    stageLabel: preview.stageLabel,
    newStatusLabel: preview.newStatusLabel,
    balance: b,
    plan,
    choice,
  });
  return (
    <div className="rounded-[1.75rem] border border-line-strong bg-surface p-6" role="dialog" aria-label="Resume order">
      <div className="text-[13px] font-medium text-muted">
        {preview.status === "refunded" ? "Refunded" : "Cancelled"} · amounts checked live in Stripe at {timeUk(preview.checkedAt)}
      </div>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight">Resume this order?</h3>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        This puts {preview.dealer} back on the desk. It never charges a card.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Money label="Paid" value={gbp(b.paidPence)} />
        <Money label="Refunded" value={gbp(b.refundedPence)} />
        <Money label="Due" value={gbp(b.duePence)} />
        <Money label="Balance owed now" value={gbp(b.owedPence)} strong />
      </div>
      <p className="mt-3 text-sm text-muted">
        {b.neverPaid
          ? `No card payment has gone through on Stripe for this file. ${gbp(b.duePence)} is the amount on its order.`
          : b.refundedPence > 0
            ? `This was a real refund in Stripe. Balance owed is due minus paid, plus what was refunded.`
            : "Nothing was refunded in Stripe. The refund or cancel was a status on the desk only."}
      </p>
      {preview.refunds.length ? (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {preview.refunds.map((r) => (
            <li key={r.id}>
              Refund {r.id} · {r.amount} · {r.date}
            </li>
          ))}
        </ul>
      ) : null}
      {preview.skipped.filter((s) => s.reason !== "not paid").length ? (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {preview.skipped
            .filter((s) => s.reason !== "not paid")
            .map((s) => (
              <li key={s.id}>Left out: {s.reason}.</li>
            ))}
        </ul>
      ) : null}

      <div className="mt-6 rounded-2xl border border-line p-4">
        <div className="text-sm font-medium">Monthly subscription</div>
        <p className="mt-1 text-sm text-muted">{plan.text}</p>
        {plan.kind === "set_to_cancel" ? (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={choice.undoCancel}
              disabled={!preview.owner}
              onChange={(e) => onChoice({ ...choice, undoCancel: e.target.checked })}
            />
            Undo the cancel so the subscription carries on
          </label>
        ) : null}
        {plan.kind === "ended" ? (
          plan.canCreate ? (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={choice.newSubscription}
                disabled={!preview.owner}
                onChange={(e) => onChoice({ ...choice, newSubscription: e.target.checked })}
              />
              Set up a new monthly subscription that waits for go live
            </label>
          ) : (
            <p className="mt-2 text-sm text-muted">{plan.createBlocked}</p>
          )
        ) : null}
        {!preview.owner && (plan.kind === "set_to_cancel" || plan.kind === "ended") ? (
          <p className="mt-2 text-xs text-subtle">Only an owner can change Stripe. You can still resume the desk.</p>
        ) : null}
      </div>

      <div className="mt-6">
        <div className="text-sm font-medium">What happens when you confirm</div>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-muted">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>

      {preview.warnings.length ? (
        <ul className="mt-4 space-y-1 rounded-xl border border-line-strong bg-elevated px-3 py-2 text-xs">
          {preview.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {notice ? <p className="mt-4 rounded-xl border border-line-strong bg-elevated px-3 py-2 text-sm">{notice}</p> : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="button" disabled={busy || !preview.ended} onClick={onConfirm}>
          {busy ? "Working…" : "Resume order"}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
          Not now
        </Button>
      </div>

      {owed ? (
        <div className="mt-6 rounded-2xl border border-line p-4">
          <div className="text-sm font-medium">Collect the balance (optional)</div>
          <p className="mt-1 text-sm text-muted">
            Makes a Stripe payment link for exactly {gbp(b.owedPence)}. The customer pays it when they choose. Nothing is
            charged automatically.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={emailLink} onChange={(e) => onEmailLink(e.target.checked)} />
            Email the link to the customer through the journey emails
          </label>
          <div className="mt-3">
            <Button type="button" variant="secondary" disabled={busy || !preview.owner} onClick={onSendLink}>
              Send payment link for {gbp(b.owedPence)} balance
            </Button>
          </div>
          {link ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <input readOnly value={link.url} className="h-10 w-full rounded-xl border border-line bg-elevated px-3 text-xs" />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(link.url).then(() => setCopied(true));
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-muted">{link.message}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The Resume order button and its panel, for the office file. */
export function ResumeOrder({
  token,
  tenantId,
  status,
  onDone,
}: {
  token: string;
  tenantId: number;
  status: string | null | undefined;
  onDone: (message: string) => void;
}) {
  const [preview, setPreview] = useState<ResumePreview | null>(null);
  const [choice, setChoice] = useState<ResumeChoiceState>({ undoCancel: true, newSubscription: false });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [emailLink, setEmailLink] = useState(true);
  const [link, setLink] = useState<{ url: string; message: string } | null>(null);

  if (!canResume(status) && !preview) return null;

  async function run<T>(fn: () => Promise<T>) {
    // One request at a time: a double click never sends twice.
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const open = () =>
    run(async () => {
      setLink(null);
      setPreview(await resumePreview({ data: { token, tenantId } }));
    });

  if (!preview) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void open()}>
          {busy ? "Checking Stripe…" : "Resume order"}
        </Button>
        {notice ? <span className="text-sm text-muted">{notice}</span> : null}
      </div>
    );
  }

  return (
    <ResumeOrderPanel
      preview={preview}
      choice={choice}
      onChoice={setChoice}
      busy={busy}
      notice={notice}
      emailLink={emailLink}
      onEmailLink={setEmailLink}
      link={link}
      onClose={() => {
        setPreview(null);
        setNotice(null);
      }}
      onConfirm={() =>
        void run(async () => {
          const res = await resumeOrder({
            data: {
              token,
              tenantId,
              expectStatus: preview.status,
              undoCancel: preview.plan.kind === "set_to_cancel" && choice.undoCancel,
              newSubscription: preview.plan.kind === "ended" && choice.newSubscription,
            },
          });
          setNotice(res.message);
          setPreview({ ...preview, ended: false });
          onDone(res.message);
        })
      }
      onSendLink={() =>
        void run(async () => {
          const res = await sendBalanceLink({
            data: { token, tenantId, expectOwedPence: preview.balance.owedPence, email: emailLink },
          });
          if (res.url) setLink({ url: res.url, message: res.message });
        })
      }
    />
  );
}
