/**
 * Database side of the plan change ticket (PR 4). Takes a Supabase client and
 * never throws: a missing support_items table or column means no ticket yet,
 * never a failed request or webhook.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePlan } from "@/lib/catalog";
import { WAITING_TICKET_GUARD, closeWaitingTicket, openTicket, type TicketChange } from "@/lib/server/plan-change-ticket";

export const TICKET_CHANGE_COLS =
  "id, tenant_id, from_plan, to_plan, status, direction, setup_diff_pence, new_monthly_pence, effective_at, support_item_id, payment_intent_id, stripe_schedule_id, requested_by, go_live_at";

export async function readTicketChange(sb: SupabaseClient, changeId: number): Promise<(TicketChange & { go_live_at?: string | null }) | null> {
  try {
    const { data, error } = await sb.from("plan_changes").select(TICKET_CHANGE_COLS).eq("id", changeId).maybeSingle();
    if (error || !data) return null;
    const r = data as Record<string, unknown>;
    return { ...(r as unknown as TicketChange), from_plan: normalizePlan(String(r.from_plan)), to_plan: normalizePlan(String(r.to_plan)) };
  } catch {
    return null;
  }
}

/** Open (or find) the plan change ticket for this request. */
export async function openTicketFor(sb: SupabaseClient, changeId: number): Promise<number | null> {
  const c = await readTicketChange(sb, changeId);
  if (!c) return null;
  return openTicket(
    {
      insertItem: async (row) => {
        const { data, error } = await sb.from("support_items").insert(row).select("id").single();
        return error || !data ? null : { id: data.id as number };
      },
      link: async (id, itemId) => {
        const { data, error } = await sb.from("plan_changes").update({ support_item_id: itemId }).eq("id", id).is("support_item_id", null).select("id");
        return !error && (data ?? []).length > 0;
      },
      removeItem: async (itemId) => void (await sb.from("support_items").delete().eq("id", itemId)),
      promote: async (itemId, patch) => {
        const { data, error } = await sb
          .from("support_items")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", itemId)
          .eq("status", WAITING_TICKET_GUARD.status)
          .eq("needs_reply", WAITING_TICKET_GUARD.needs_reply)
          .select("id");
        return !error && (data ?? []).length > 0;
      },
    },
    c,
  );
}

/** Cancelled or expired before payment: close the waiting ticket. Never throws. */
export async function closeWaitingTicketFor(sb: SupabaseClient, changeId: number, reason: "cancelled" | "expired"): Promise<boolean> {
  const c = await readTicketChange(sb, changeId);
  if (!c) return false;
  return closeWaitingTicket(
    {
      close: async (itemId, patch) => {
        const { data, error } = await sb
          .from("support_items")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", itemId)
          .eq("status", WAITING_TICKET_GUARD.status)
          .eq("needs_reply", WAITING_TICKET_GUARD.needs_reply)
          .select("id");
        return !error && (data ?? []).length > 0;
      },
    },
    c,
    reason,
  );
}
