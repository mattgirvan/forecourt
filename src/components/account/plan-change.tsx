import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Row, Rows, Section } from "@/components/ui/section";
import { useEffect, useRef, useState, type Ref } from "react";
import { FRANCHISE_INCLUDED_SITES, PLANS, gbpPence, type PlanId } from "@/lib/catalog";
import {
  planChangeErrorFeedback,
  planChangeFeedback,
  type PlanChangeFeedback,
  type PlanChangeQuote,
} from "@/lib/plan-change";
import { formatUkDate } from "@/lib/uk-date";
import { cn } from "@/lib/utils";
import { previewPlanChange, requestPlanChange } from "@/lib/server/plan-change-server";

const ORDER: PlanId[] = ["site", "franchise", "group"];
const LABEL: Record<PlanId, string> = { site: "Site", franchise: "Franchise", group: "Group" };

/** Pence to pounds, with pence only when there are any (part months). */
const money = (p: number) =>
  p % 100
    ? `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : gbpPence(p);

function priceUnit(p: PlanId) {
  return PLANS[p].perSite ? "/site /mo" : "/mo";
}

function planLine(p: PlanId) {
  const reach =
    p === "site"
      ? "One site"
      : p === "franchise"
        ? `Up to ${FRANCHISE_INCLUDED_SITES} sites`
        : `${PLANS.group.minSites} site minimum`;
  return `${reach}. ${money(PLANS[p].setupPence)} setup.`;
}

/** Change account type. Customer (live accounts) and Office use the same panel. */
export function PlanChangePanel({
  token,
  tenantId,
  plan,
  where,
}: {
  token: string;
  tenantId: number;
  plan: PlanId;
  where: "account" | "office";
}) {
  return (
    <PlanChangeView
      plan={plan}
      where={where}
      onPreview={async (to) => (await previewPlanChange({ data: { token, tenantId, to } })).quote}
      onConfirm={async (to) => {
        const r = await requestPlanChange({ data: { token, tenantId, to, from: where } });
        const fb = planChangeFeedback(r, to);
        if (r?.url) window.location.assign(r.url);
        return fb;
      }}
    />
  );
}

/** The rows of the "What changes" sheet, from the real quote. */
export function changeRows(
  q: PlanChangeQuote,
): { label: string; value: string; strong?: boolean; sub?: string }[] {
  const from = LABEL[q.from];
  const to = LABEL[q.to];
  if (q.direction === "upgrade") {
    return [
      { label: `Setup paid for ${from}`, value: money(PLANS[q.from].setupPence) },
      { label: `${to} setup`, value: money(PLANS[q.to].setupPence) },
      { label: "Setup difference, paid today", value: money(q.setupDiffPence), strong: true },
      {
        label: "New monthly price",
        value: `${money(q.newMonthlyPence)}/mo`,
        sub: `Was ${money(q.oldMonthlyPence)}`,
      },
      {
        label: `Part month${q.periodEnd ? ` to ${formatUkDate(q.periodEnd)}` : ""}`,
        sub: "Added to your next bill",
        value: money(q.proratedPence),
      },
    ];
  }
  if (q.direction === "downgrade") {
    const until = q.periodEnd ? formatUkDate(q.periodEnd) : "the end of this billing period";
    return [
      { label: "Setup refund", value: "None" },
      { label: `Your price until ${until}`, value: `${money(q.oldMonthlyPence)}/mo`, strong: true },
      {
        label: q.effective === "now" ? `${to} from today` : `${to} from ${until}`,
        value: `${money(q.newMonthlyPence)}/mo`,
      },
      ...(q.effective === "now"
        ? [{ label: "Credit on your next bill", value: money(-q.proratedPence) }]
        : []),
    ];
  }
  return [{ label: `You are already on ${to}`, value: "" }];
}

export function changeHint(q: PlanChangeQuote): string {
  if (q.direction === "upgrade")
    return `${LABEL[q.to]} starts as soon as the setup payment goes through. Adding more sites later never has a setup fee.`;
  if (q.direction === "downgrade")
    return q.effective === "period_end"
      ? "Moving down keeps your current price until the end of the billing period. There is no setup refund and no refund for part months."
      : "Moving down has no setup refund. The difference for the rest of this month comes off your next bill.";
  return "";
}

/** The one message after a confirm: green for done, grey for pending or a problem. */
export function PlanChangeMessage({
  feedback,
  innerRef,
}: {
  feedback: PlanChangeFeedback;
  innerRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={innerRef}
      tabIndex={-1}
      role={feedback.tone === "error" ? "alert" : "status"}
      aria-live={feedback.tone === "error" ? "assertive" : "polite"}
      className={cn("fc-pc-feedback", `is-${feedback.tone}`)}
      data-testid="plan-change-notice"
      data-tone={feedback.tone}
    >
      <span className="fc-pc-feedback-dot" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{feedback.title}</span>
        {feedback.body ? (
          <span className="mt-0.5 block text-[13px] text-[var(--fc-text-dim)]">{feedback.body}</span>
        ) : null}
      </span>
    </div>
  );
}

export function PlanChangeView({
  plan,
  where,
  onPreview,
  onConfirm,
  initialTo = null,
  initialQuote = null,
  initialNotice = null,
}: {
  plan: PlanId;
  where: "account" | "office";
  onPreview: (to: PlanId) => Promise<PlanChangeQuote>;
  onConfirm: (to: PlanId) => Promise<PlanChangeFeedback>;
  initialTo?: PlanId | null;
  initialQuote?: PlanChangeQuote | null;
  initialNotice?: PlanChangeFeedback | null;
}) {
  const [to, setTo] = useState<PlanId | null>(initialTo);
  const [quote, setQuote] = useState<PlanChangeQuote | null>(initialQuote);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<PlanChangeFeedback | null>(initialNotice);
  // An error from the confirm stays inside the open sheet, next to the buttons.
  const [sheetError, setSheetError] = useState<PlanChangeFeedback | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const [reveal, setReveal] = useState(0);
  useEffect(() => {
    if (!reveal || !noticeRef.current) return;
    noticeRef.current.scrollIntoView({ block: "nearest" });
    noticeRef.current.focus({ preventScroll: true });
  }, [reveal]);
  const pick = async (p: PlanId) => {
    if (p === plan) return;
    setTo(p);
    setQuote(null);
    setNotice(null);
    setBusy(true);
    try {
      setQuote(await onPreview(p));
    } catch (e) {
      setNotice({
        tone: "error",
        title: "Could not price that change",
        body: e instanceof Error && e.message ? e.message : "Please try again, or send us a message.",
      });
      setReveal((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    setQuote(null);
    setTo(null);
    setSheetError(null);
  };
  const confirm = async () => {
    if (!to) return;
    setBusy(true);
    setSheetError(null);
    try {
      const fb = await onConfirm(to);
      if (fb.tone === "error") {
        setSheetError(fb);
      } else {
        setNotice(fb);
        close();
        setReveal((n) => n + 1);
      }
    } catch (e) {
      setSheetError(planChangeErrorFeedback(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!quote) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quote]);

  return (
    <div className="fc-section-stack" data-testid="plan-change">
      <div>
        <p className="text-sm text-muted">
          {where === "office" ? "This account is" : "You are"} on {LABEL[plan]}. Pick a plan to see
          what changes.
        </p>
        {notice ? (
          <div className="mt-4">
            <PlanChangeMessage feedback={notice} innerRef={noticeRef} />
          </div>
        ) : null}
        <div className="fc-plan-cards mt-4" role="radiogroup" aria-label="Plan">
          {ORDER.map((p) => {
            const current = p === plan;
            const on = (to ?? null) === p;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={on || (current && !to)}
                disabled={busy || current}
                onClick={() => void pick(p)}
                className={cn("fc-plan-card", current && "is-current", on && "is-on")}
                data-testid={`plan-card-${p}`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fc-text-faint)]">
                    {LABEL[p]}
                  </span>
                  {current ? (
                    <Chip tone="neutral">Current</Chip>
                  ) : on ? (
                    <Chip tone="progress">Selected</Chip>
                  ) : null}
                </span>
                <span className="mt-2 block">
                  <span className="text-2xl font-semibold tracking-tight tabular-nums">
                    {money(PLANS[p].monthPence)}
                  </span>
                  <span className="ml-1 text-sm text-muted">{priceUnit(p)}</span>
                </span>
                <span className="mt-1 block text-[12.5px] text-[var(--fc-text-dim)]">
                  {planLine(p)}
                </span>
              </button>
            );
          })}
        </div>
        {busy && !quote ? <p className="mt-4 text-sm text-muted">Working out the cost.</p> : null}
      </div>
      {quote && to ? (
        <>
          <button type="button" aria-label="Close" className="fc-change-dim" onClick={close} />
          <div
            className="fc-change-sheet"
            role="dialog"
            aria-modal="false"
            aria-label="What changes"
          >
            <Section title="What changes" rail="blue" testId="plan-change-quote">
              <Rows as="ul">
                {changeRows(quote).map((r) => (
                  <Row
                    as="li"
                    key={r.label}
                    title={
                      <span className={r.strong ? "font-semibold" : "font-normal"}>{r.label}</span>
                    }
                    sub={r.sub}
                    trailing={<span className="font-semibold tabular-nums">{r.value}</span>}
                  />
                ))}
              </Rows>
              <p className="mt-3 text-[12.5px] text-[var(--fc-text-faint)]">{changeHint(quote)}</p>
              {sheetError ? (
                <div className="mt-3">
                  <PlanChangeMessage feedback={sheetError} />
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="action" disabled={busy} onClick={() => void confirm()}>
                  {busy
                    ? "Sending"
                    : sheetError
                      ? "Try again"
                      : quote.direction === "upgrade"
                    ? `Pay ${money(quote.setupDiffPence)} and move to ${LABEL[quote.to]}`
                    : `Move to ${LABEL[quote.to]}`}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={close}>
                  Keep {LABEL[quote.from]}
                </Button>
              </div>
            </Section>
          </div>
        </>
      ) : null}
    </div>
  );
}
