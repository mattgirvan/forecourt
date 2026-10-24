/**
 * Plan change emails (PR 5): when each one goes, with the I/O passed in so the
 * tests mock sending. The words live in lib/plan-change-emails.ts.
 */
import { normalizePlan } from "../catalog.ts";
import { planChangeEmail, type PlanChangeEmail, type PlanChangeEmailInput } from "../plan-change-emails.ts";

export type SendFn = (ev: PlanChangeEmail & { tenantId: number }) => Promise<unknown>;

export type ChangeRow = {
  id: number;
  tenant_id: number;
  from_plan: string;
  to_plan: string;
  setup_diff_pence: number | null;
  new_monthly_pence: number | null;
  invoice_id?: string | null;
  reminder_sent_at?: string | null;
};

export function inputFor(row: ChangeRow, stage: PlanChangeEmailInput["stage"], extra: Partial<PlanChangeEmailInput> = {}): PlanChangeEmailInput {
  return {
    changeId: row.id,
    from: normalizePlan(row.from_plan),
    to: normalizePlan(row.to_plan),
    stage,
    setupPence: Number(row.setup_diff_pence) || 0,
    newMonthlyPence: Number(row.new_monthly_pence) || 0,
    ...extra,
  };
}

/** Send one plan change email. Never throws: an email never blocks the change. */
export async function notify(send: SendFn, tenantId: number, input: PlanChangeEmailInput): Promise<boolean> {
  try {
    await send({ tenantId, ...planChangeEmail(input) });
    return true;
  } catch {
    return false;
  }
}

/** The Checkout invoice link for the receipt, or null. */
export async function invoiceUrl(retrieve: ((id: string) => Promise<{ hosted_invoice_url?: string | null }>) | null, invoiceId: string | null | undefined): Promise<string | null> {
  if (!retrieve || !invoiceId) return null;
  try {
    return (await retrieve(invoiceId)).hosted_invoice_url ?? null;
  } catch {
    return null;
  }
}

/**
 * ONE reminder for an abandoned or expired Checkout. claimReminder sets
 * reminder_sent_at only while it is empty, so a retried webhook never sends twice.
 */
export async function sendReminderOnce(deps: { claimReminder: (changeId: number) => Promise<boolean>; send: SendFn }, row: ChangeRow): Promise<"sent" | "already" | "nothing_owed"> {
  if (!(Number(row.setup_diff_pence) > 0)) return "nothing_owed";
  if (row.reminder_sent_at) return "already";
  if (!(await deps.claimReminder(row.id))) return "already";
  await notify(deps.send, row.tenant_id, inputFor(row, "reminder"));
  return "sent";
}

/** After Apply: a price rise is live now, a drop or equal swap is booked for period end. */
export function appliedStage(monthlyStarts: string): "applied" | "scheduled" {
  return monthlyStarts === "period_end" ? "scheduled" : "applied";
}
