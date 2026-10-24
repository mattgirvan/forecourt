import { CountUp } from "@/components/ui/count-up";
import { BUILD_STAGES, stageIndex } from "@/lib/build";
import { PLANS, gbpPence, monthTotalPence, normalizeBilling, normalizePlan } from "@/lib/catalog";
import { packageLive } from "@/lib/team";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Row, Rows, Section, SectionStack } from "@/components/ui/section";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import type { BoardRow } from "@/components/office/board";

/** Stages a build moves through before Live. */
/** The card stagger plays once per session, not on every tab switch. */
let entered = false;

const QUEUE_STAGES = BUILD_STAGES.filter((s) => s.id !== "live");

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function waitedFor(iso: string | null | undefined, now: Date) {
  if (!iso) return "";
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Waiting since today.";
  return `Waiting ${days} ${days === 1 ? "day" : "days"}.`;
}

function greeting(now: Date) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export type NeedItem = { row: BoardRow; kind: "reply" | "payment" };

/** Dealers waiting on us (they wrote) or with a failed payment. A failed payment comes first. */
export function needsYou(rows: BoardRow[]): NeedItem[] {
  const out: NeedItem[] = [];
  for (const r of rows) if (r.flags?.paymentFailed) out.push({ row: r, kind: "payment" });
  for (const r of rows)
    if (r.waiting && !r.flags?.paymentFailed) out.push({ row: r, kind: "reply" });
  return out;
}

/** Builds under way: a stage before Live, and not live yet. */
export function buildQueue(rows: BoardRow[]) {
  return rows
    .filter((r) => !packageLive(r.status) && stageIndex(r.stage) >= 0 && r.stage !== "live")
    .sort((a, b) => stageIndex(b.stage) - stageIndex(a.stage));
}

/** Monthly total across dealers who are paying monthly (not on trial). */
export function monthlyTotal(rows: BoardRow[]) {
  return rows.reduce((sum, r) => {
    const plan = normalizePlan(r.plan);
    if (!packageLive(r.status) || normalizeBilling(plan, r.billing) === "trial") return sum;
    return sum + monthTotalPence(plan, r.site_count ?? 1);
  }, 0);
}

export function OfficeOverview({
  rows,
  firstName,
  onOpen,
  onSearch,
  now = new Date(),
}: {
  rows: BoardRow[];
  firstName: string;
  onOpen: (id: number) => void;
  onSearch: () => void;
  now?: Date;
}) {
  const needs = needsYou(rows);
  const queue = buildQueue(rows);
  const live = rows.filter((r) => packageLive(r.status));
  const recent = [...live]
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 3);
  const monthly = monthlyTotal(rows);
  const top = needs.find((n) => n.kind === "reply") ?? needs[0];
  const summary =
    needs.length === 0
      ? "Nothing needs you. Everything is moving."
      : `${needs.length === 1 ? "One thing needs" : `${needs.length} things need`} you. Everything else is moving.`;
  const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const [entrance] = useState(() => !entered);
  useEffect(() => {
    entered = true;
  }, []);

  const stats = [
    { n: live.length, label: "Live dealers" },
    { n: queue.length, label: "In build" },
    { n: needs.length, label: "Need you", action: needs.length > 0 },
    { n: monthly, label: "Monthly, all dealers", money: true },
  ];

  return (
    <div className={cn("mt-6", !entrance && "fc-entered")} data-testid="office-overview">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--fc-text-faint)]">
            {date}
          </p>
          <h2 className="mt-1 text-[26px] font-semibold tracking-tight sm:text-[34px]">
            {greeting(now)}
            {firstName ? `, ${firstName}` : ""}
          </h2>
          <p className="mt-1 text-sm text-muted" data-testid="overview-summary">
            {summary}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <Button variant="secondary" type="button" onClick={onSearch}>
            Search dealers
          </Button>
          {top ? (
            <Button
              variant="action"
              type="button"
              className="min-w-0 truncate"
              onClick={() => onOpen(top.row.id)}
            >
              {top.kind === "payment" ? `Open ${top.row.name}` : `Reply to ${top.row.name}`}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="fc-stats mt-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className={cn("fc-stat", s.action && "is-action")}
            data-testid={`stat-${s.label.split(",")[0].toLowerCase().replace(/ /g, "-")}`}
          >
            <div className="fc-stat-n">
              <CountUp id={`office-${s.label}`} value={s.n} format={s.money ? gbpPence : undefined} />
            </div>
            <div className="fc-stat-l">{s.label}</div>
          </div>
        ))}
      </div>

      <SectionStack className="mt-[18px]">
        <div className="fc-overview-grid">
          <Section
            title="Needs you"
            count={needs.length}
            countTone={needs.length ? "action" : "neutral"}
            testId="overview-needs"
          >
            {needs.length === 0 ? (
              <p className="text-sm text-muted">Nothing needs you.</p>
            ) : (
              <Rows as="ul">
                {needs.map(({ row, kind }) => (
                  <Row
                    as="li"
                    key={`${kind}-${row.id}`}
                    tone="action"
                    lead={<span className="fc-avatar">{initials(row.name)}</span>}
                    title={row.name}
                    sub={
                      kind === "payment"
                        ? "Monthly payment did not go through. Stripe is retrying."
                        : `Wrote to us. ${waitedFor(row.last_message_at, now)}`
                    }
                    trailing={
                      kind === "payment" && row.phone ? (
                        <Button variant="action" size="sm" className="h-11" asChild>
                          <a href={`tel:${row.phone.replace(/\s+/g, "")}`}>Call dealer</a>
                        </Button>
                      ) : (
                        <Button
                          variant="action"
                          size="sm"
                          className="h-11"
                          type="button"
                          onClick={() => onOpen(row.id)}
                        >
                          {kind === "payment" ? "Open file" : "Reply"}
                        </Button>
                      )
                    }
                  />
                ))}
              </Rows>
            )}
          </Section>

          <Section title="Build queue" rail="teal" count={queue.length} testId="overview-queue">
            {queue.length === 0 ? (
              <p className="text-sm text-muted">No builds under way.</p>
            ) : (
              <ul className="fc-queue">
                {queue.map((r) => {
                  const i = stageIndex(r.stage);
                  const stage = QUEUE_STAGES[i];
                  return (
                    <li key={r.id}>
                      <button type="button" className="fc-queue-btn" onClick={() => onOpen(r.id)}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="fc-row-title min-w-0">{r.name}</span>
                        </span>
                        <span className="fc-steps" aria-hidden="true">
                          {QUEUE_STAGES.map((s, j) => (
                            <span
                              key={s.id}
                              className={j < i ? "is-done" : j === i ? "is-now" : undefined}
                            />
                          ))}
                        </span>
                        <span className="fc-row-sub mt-1.5">
                          Step {i + 1} of {QUEUE_STAGES.length}: {stage.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <CollapsibleSection
          id="overview-recent"
          title="Recently live"
          count={recent.length}
          rail="slate"
          testId="overview-recent"
        >
          {recent.length === 0 ? (
            <p className="text-sm text-muted">No dealers are live yet.</p>
          ) : (
            <Rows as="ul">
              {recent.map((r) => {
                const plan = normalizePlan(r.plan);
                const sites = r.site_count ?? 1;
                const price = `${gbpPence(monthTotalPence(plan, sites))}/mo`;
                return (
                  <Row as="li" key={r.id} className="pr-2">
                    <button type="button" className="fc-row-btn" onClick={() => onOpen(r.id)}>
                      <span className="fc-avatar">{initials(r.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="fc-row-title block">{r.name}</span>
                        <span className="fc-row-sub block">
                          {PLANS[plan].name}, {sites} {sites === 1 ? "site" : "sites"}
                        </span>
                        <span
                          className="fc-row-sub block font-semibold tabular-nums text-[var(--fc-text-dim)] sm:hidden"
                          data-testid="recent-price"
                        >
                          {price}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="hidden text-sm font-semibold tabular-nums sm:inline">
                          {price}
                        </span>
                        <Chip tone="live">Live</Chip>
                      </span>
                    </button>
                  </Row>
                );
              })}
            </Rows>
          )}
        </CollapsibleSection>
      </SectionStack>
    </div>
  );
}
