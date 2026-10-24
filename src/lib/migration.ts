/**
 * Account type migration tracker (group build PR 8). Pure module, no I/O.
 *
 * A plan change (PR 5) opens a migration. While it is open the account shows
 * the status "Migration" on the Live dashboard and in Office, with a step by
 * step tracker like the setup tracker. It goes back to "Live" when the
 * migration is complete or cancelled. tenants.status is not changed, so
 * nothing that checks for a live desk is affected.
 *
 * Upgrades: requested, setup difference paid, plan switched (with the
 * payment), sites or brands set up, complete.
 * Downgrades (Matt): the plan name changes at once, the price at period end.
 * Requested, plan switched (now), sites or brands trimmed, price change at
 * period end, complete. No payment and no refund.
 */
import { PLANS, monthTotalPence, type PlanId } from "./catalog.ts";
import { ukDay } from "./plan-change.ts";

export type MigrationStage = "requested" | "paid" | "switched" | "setup" | "priced" | "complete";
export const MIGRATION_STAGES: MigrationStage[] = ["requested", "paid", "switched", "setup", "priced", "complete"];
export type MigrationScenario =
  | "site_to_franchise"
  | "site_to_group"
  | "franchise_to_group"
  | "group_to_franchise"
  | "group_to_site"
  | "franchise_to_site";

export type MigrationStep = {
  stage: MigrationStage;
  title: string;
  /** One line for the customer. */
  line: string;
  /** Who moves it on. */
  by: "customer" | "stripe" | "forecourt" | "period_end";
  /** True when reaching this step emails the account admin and hello@. */
  email: boolean;
  /** Line shown while the step is not done yet, when it differs from the done line. */
  todo?: string;
  /** Title shown while the step is not done yet, when it differs from the done title. */
  todoTitle?: string;
};

export function scenarioFor(from: PlanId, to: PlanId): MigrationScenario | null {
  const k = `${from}_to_${to}`;
  return k in SCENARIOS ? (k as MigrationScenario) : null;
}
export function isUpgrade(s: MigrationScenario): boolean {
  return SCENARIOS[s].some((x) => x.stage === "paid");
}

const req = (to: PlanId, down: boolean): MigrationStep => ({
  stage: "requested",
  title: "Change requested",
  line: down ? `You asked to move to ${PLANS[to].name}. No payment is needed.` : `You asked to move to ${PLANS[to].name}.`,
  by: "customer",
  email: true,
});
const paid: MigrationStep = {
  stage: "paid",
  title: "Setup difference paid",
  line: "The one-off setup difference has gone through. Stripe sends your receipt.",
  by: "stripe",
  email: true,
};
const switchedUp = (to: PlanId): MigrationStep => ({
  stage: "switched",
  title: `Plan switched to ${PLANS[to].name}`,
  line: `Your account is on ${PLANS[to].name} as soon as the payment goes through. The part month is added to your next bill.`,
  by: "stripe",
  email: false,
});
const switchedDown = (to: PlanId): MigrationStep => ({
  stage: "switched",
  title: `Plan switched to ${PLANS[to].name}`,
  line: `Your account shows ${PLANS[to].name} straight away. Your price stays the same until the end of your billing period.`,
  by: "customer",
  email: false,
});
const priced = (to: PlanId): MigrationStep => ({
  stage: "priced",
  title: "New price from period end",
  line: `The ${PLANS[to].name} price starts at the end of your billing period. No setup refund and no refund for part months.`,
  by: "period_end",
  email: true,
});
const done: MigrationStep = { stage: "complete", title: "Complete", line: "All done. Your account is back to Live.", by: "forecourt", email: true };

export const SCENARIOS: Record<MigrationScenario, MigrationStep[]> = {
  site_to_franchise: [
    req("franchise", false),
    paid,
    switchedUp("franchise"),
    { stage: "setup", title: "Sites set up", line: "We add your other sites to your desk under your one brand.", by: "forecourt", email: false },
    done,
  ],
  site_to_group: [
    req("group", false),
    paid,
    switchedUp("group"),
    { stage: "setup", title: "Sites and brands set up", line: "We add your other sites and brands to your desk. Each site is billed from its go live day.", by: "forecourt", email: false },
    done,
  ],
  franchise_to_group: [
    req("group", false),
    paid,
    switchedUp("group"),
    { stage: "setup", title: "Brands set up", line: "We add your other brands to your desk. Your sites stay as they are.", by: "forecourt", email: false },
    done,
  ],
  group_to_franchise: [
    req("franchise", true),
    switchedDown("franchise"),
    { stage: "setup", title: "Brands trimmed to one", line: "We keep one brand on your desk. Your sites stay.", by: "forecourt", email: false },
    priced("franchise"),
    done,
  ],
  group_to_site: [
    req("site", true),
    switchedDown("site"),
    { stage: "setup", title: "Trimmed to one site and one brand", line: "We keep one site and one brand on your desk. Other sites are archived and can be restored within 30 days.", by: "forecourt", email: false },
    priced("site"),
    done,
  ],
  franchise_to_site: [
    req("site", true),
    switchedDown("site"),
    { stage: "setup", title: "Sites trimmed to one", line: "We keep one site on your desk. Other sites are archived and can be restored within 30 days.", by: "forecourt", email: false },
    priced("site"),
    done,
  ],
};

/** A plan_changes row, as far as the tracker needs it. */
export type MigrationRow = {
  id: number;
  from_plan: string;
  to_plan: string;
  status: string;
  migration_stage?: string | null;
  stage_times?: Record<string, string> | null;
  effective_at?: string | null;
  /** Set when Office closes the tracker. Does not undo the plan or Stripe. */
  migration_cancelled_at?: string | null;
  created_at: string;
  /** Plan change flow (PR 1 columns). When set, the steps follow the price, not the scenario. */
  direction?: string | null;
  setup_diff_pence?: number | null;
  new_monthly_pence?: number | null;
  go_live_at?: string | null;
  /** "office" when the Forecourt team set the change up (plan-change-office-pay.sql). */
  started_from?: string | null;
};

export type TrackerStep = MigrationStep & { state: "done" | "now" | "next"; at: string | null };
export type Tracker = {
  id: number;
  scenario: MigrationScenario;
  from: PlanId;
  to: PlanId;
  stage: MigrationStage;
  open: boolean;
  cancelled: boolean;
  steps: TrackerStep[];
  effectiveAt: string | null;
  /** True when the monthly price goes up: it starts on the go live day. */
  rise: boolean;
  status: string;
  setupDiffPence: number | null;
  newMonthlyPence: number | null;
  goLiveAt: string | null;
};

const money = (p: number) => `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/**
 * Steps for one plan change. Rows from the plan change flow carry direction and
 * setup_diff_pence, so the steps follow Matt's price rules:
 * - payment step only when there is a setup difference to pay (always onto Group);
 * - price up: the new price starts on the go live day, part month on the next bill;
 * - price down or equal: the price changes at period end, no charge, no refund.
 * Older rows without direction keep the fixed scenario steps.
 */
export function stepsFor(row: Pick<MigrationRow, "direction" | "setup_diff_pence" | "new_monthly_pence" | "effective_at" | "started_from">, scenario: MigrationScenario, to: PlanId): MigrationStep[] {
  const dir = row.direction;
  if (dir !== "up" && dir !== "down" && dir !== "equal") return SCENARIOS[scenario];
  const rise = dir === "up";
  const setup = Math.max(0, row.setup_diff_pence ?? 0);
  const price = row.new_monthly_pence != null ? `${money(row.new_monthly_pence)} a month (inc. VAT)` : "";
  const name = PLANS[to].name;
  const out: MigrationStep[] = [
    row.started_from === "office"
      ? { stage: "requested", title: "Change set up", line: setup > 0 ? `The Forecourt team set up your move to ${name}.` : `The Forecourt team set up your move to ${name}. No payment is needed.`, by: "forecourt", email: true }
      : { stage: "requested", title: "Change requested", line: setup > 0 ? `You asked to move to ${name}.` : `You asked to move to ${name}. No payment is needed.`, by: "customer", email: true },
  ];
  if (setup > 0)
    out.push({ stage: "paid", title: "Setup difference paid", line: `The one-off setup difference of ${money(setup)} (inc. VAT) has gone through. Stripe sends your receipt.`, todo: `Pay the one-off setup difference of ${money(setup)} (inc. VAT). Stripe sends your receipt.`, by: "stripe", email: true });
  out.push(
    rise
      ? { stage: "switched", title: `${name} goes live`, line: `From the day your change goes live, your new price${price ? ` of ${price}` : ""} starts. The part month is added to your next bill.`, by: "forecourt", email: false }
      : {
          stage: "switched",
          title: `Plan switched to ${name}`,
          line: `Your account is now on ${name}. Your price stays the same until the end of your billing period${row.effective_at ? `, ${ukDay(row.effective_at)}` : ""}.`,
          todoTitle: "Plan change booked",
          todo: `Your account moves to ${name} when the team applies your change. Your price stays the same until the end of your billing period${row.effective_at ? `, ${ukDay(row.effective_at)}` : ""}.`,
          by: "forecourt",
          email: false,
        },
  );
  out.push(SCENARIOS[scenario].find((x) => x.stage === "setup")!);
  if (!rise)
    out.push({ stage: "priced", title: price ? `New price of ${price}` : "New price from period end", line: "Starts at the end of your billing period. No charge and no refund.", by: "period_end", email: true });
  out.push(done);
  return out;
}

const PLAN_IDS: PlanId[] = ["site", "franchise", "group"];
const asPlan = (p: string): PlanId | null => (PLAN_IDS.includes(p as PlanId) ? (p as PlanId) : null);

export function stageIndex(s: MigrationScenario, stage: MigrationStage): number {
  return SCENARIOS[s].findIndex((x) => x.stage === stage);
}

/** Open = a migration the account is in right now. Cancelled, failed and complete are closed. */
export function isOpen(row: Pick<MigrationRow, "status" | "migration_stage" | "migration_cancelled_at">): boolean {
  if (row.status === "cancelled" || row.status === "failed" || row.migration_cancelled_at) return false;
  return Boolean(row.migration_stage) && row.migration_stage !== "complete";
}

export function trackerFor(row: MigrationRow): Tracker | null {
  const from = asPlan(row.from_plan);
  const to = asPlan(row.to_plan);
  if (!from || !to) return null;
  const scenario = scenarioFor(from, to);
  if (!scenario) return null;
  const steps = stepsFor(row, scenario, to);
  const stage = (steps.some((s) => s.stage === row.migration_stage) ? row.migration_stage : "requested") as MigrationStage;
  const at = steps.findIndex((s) => s.stage === stage);
  const open = isOpen(row);
  const times = row.stage_times ?? {};
  return {
    id: row.id,
    scenario,
    from,
    to,
    stage,
    open,
    cancelled: row.status === "cancelled" || Boolean(row.migration_cancelled_at),
    effectiveAt: row.effective_at ?? null,
    rise: row.direction ? row.direction === "up" : isUpgrade(scenario),
    status: row.status,
    setupDiffPence: row.setup_diff_pence ?? null,
    newMonthlyPence: row.new_monthly_pence ?? null,
    goLiveAt: row.go_live_at ?? null,
    steps: steps.map((s, i) => ({
      ...s,
      // The current stage is the last one reached, so it is done; the one after it is now.
      state: i <= at ? "done" : i === at + 1 && open ? "now" : "next",
      at: times[s.stage] ?? (s.stage === "requested" ? row.created_at : null),
    })),
  };
}

/** True only while a request waits for the customer to pay its setup difference. */
export function paymentNeeded(t: Tracker | null | undefined): boolean {
  return Boolean(t?.open && !t.cancelled && t.status === "pending_payment" && (t.setupDiffPence ?? 0) > 0);
}

export type AccountStatusLabel = "Live" | "Migration";
/** Account status shown to customers and Office. Back to Live when complete or cancelled. */
export function accountStatusLabel(t: Tracker | null | undefined): AccountStatusLabel {
  return t?.open ? "Migration" : "Live";
}

export function nextStage(s: MigrationScenario, stage: MigrationStage, steps: MigrationStep[] = SCENARIOS[s]): MigrationStage | null {
  const i = steps.findIndex((x) => x.stage === stage);
  return i >= 0 && i < steps.length - 1 ? steps[i + 1]!.stage : null;
}

/** Only the Forecourt steps can be marked by hand in Office. Payment comes from Stripe, the price change from the period end. */
export function officeCanMark(s: MigrationScenario, current: MigrationStage, target: MigrationStage, steps: MigrationStep[] = SCENARIOS[s]): boolean {
  if (nextStage(s, current, steps) !== target) return false;
  // Go live is set by Apply on the ticket, not by hand here.
  if (target === "switched" && steps !== SCENARIOS[s]) return false;
  return steps.find((x) => x.stage === target)!.by === "forecourt";
}

/** Downgrade price step is due once the period end has passed and the trim is done. */
export function priceDue(t: Tracker, now: Date = new Date()): boolean {
  if (!t.open || !t.effectiveAt) return false;
  return nextStage(t.scenario, t.stage, t.steps) === "priced" && Date.parse(t.effectiveAt) <= now.getTime();
}

/** Stage times after moving to `stage` (fills any skipped earlier stages with the same time). */
export function advance(row: MigrationRow, stage: MigrationStage, at: string): { migration_stage: MigrationStage; stage_times: Record<string, string>; completed_at: string | null } {
  const t = trackerFor(row);
  const times = { ...(row.stage_times ?? {}) };
  if (t) for (const s of t.steps.slice(0, t.steps.findIndex((x) => x.stage === stage) + 1)) times[s.stage] ??= at;
  times[stage] ??= at;
  return { migration_stage: stage, stage_times: times, completed_at: stage === "complete" ? at : null };
}

/** Pill colour: amber only while the customer must pay the setup difference, green on Complete, grey otherwise. */
export function migrationTone(tracker: Tracker | null | undefined): "amber" | "green" | "grey" {
  const now = tracker?.steps.find((s) => s.state === "now");
  if (!now && tracker?.steps.every((s) => s.state === "done")) return "green";
  return now?.stage === "paid" ? "amber" : "grey";
}


/**
 * Price shown during an open downgrade (Group to Site, Franchise to Site, Group to Franchise).
 * tenants.plan switches at request, but the price only changes at the billing period end, so the
 * header and Price row keep the current price and a hint gives the new one:
 * "£399 a month from 14 Nov 2026". Upgrades and closed trackers: null (show the bill as is).
 * current: live billing when it still differs from the target, otherwise the catalog price of the old plan.
 */
export function downgradePrice(
  tracker: Tracker | null | undefined,
  bill: { monthlyPence: number | null; nextPaymentAt?: string | null } | null | undefined,
  siteCount: number,
  now: Date = new Date(),
): { currentPence: number; nextPence: number; hint: string } | null {
  if (!tracker || !tracker.open || tracker.rise) return null;
  const reached = tracker.steps.find((s) => s.stage === "priced")?.state === "done";
  if (reached) return null;
  const endIso = tracker.effectiveAt ?? bill?.nextPaymentAt ?? null;
  if (endIso && new Date(endIso).getTime() <= now.getTime()) return null;
  const nextPence = tracker.newMonthlyPence ?? monthTotalPence(tracker.to, siteCount);
  const live = bill?.monthlyPence ?? null;
  const currentPence = live != null && live !== nextPence ? live : monthTotalPence(tracker.from, siteCount);
  const gbp = money;
  const day = endIso
    ? new Date(endIso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).replace("Sept", "Sep")
    : "";
  return { currentPence, nextPence, hint: `${gbp(nextPence)} a month${day ? ` from ${day}` : " from your next billing date"}` };
}

/** Status of the request in plain words, for the request card. */
export function requestStatusLabel(t: Pick<Tracker, "status" | "stage" | "open" | "cancelled" | "rise" | "goLiveAt">): string {
  if (t.cancelled) return "Cancelled";
  if (!t.open) return "Complete";
  if (t.status === "pending_payment") return "Awaiting customer payment";
  if (t.goLiveAt || t.status === "applied") return "Live, finishing setup";
  return "With the Forecourt team";
}
