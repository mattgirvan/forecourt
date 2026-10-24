import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  WAITING_LABEL,
  WAITING_TICKET_GUARD,
  closeWaitingTicket,
  customerHiddenIds,
  hiddenFromCustomer,
  isWaitingSystemMessage,
  isWaitingTicket,
  officeFileLink,
  openTicket,
  ticketTitle,
  waitingTicketDetails,
  type TicketChange,
  type TicketDeps,
} from "./plan-change-ticket.ts";

const base: TicketChange = { id: 7, tenant_id: 4, from_plan: "site", to_plan: "group", status: "pending_payment", direction: "up", setup_diff_pence: 400000, new_monthly_pence: 49800, support_item_id: null, requested_by: "owner@example.test" };
const ATLAS = "Nothing to do yet. The customer pays £4,000 (inc. VAT) from the email or their account, then this moves on by itself. It closes if the request is cancelled or expires.";

/** A tiny support_items table with the same guarded updates as the store (status submitted, needs_reply false). */
function world() {
  const items = new Map<number, Record<string, unknown>>();
  const change = { ...base };
  let next = 100;
  let inserts = 0;
  const guarded = async (itemId: number, patch: Record<string, unknown>) => {
    const it = items.get(itemId);
    if (!it || it.status !== WAITING_TICKET_GUARD.status || it.needs_reply !== WAITING_TICKET_GUARD.needs_reply) return false;
    Object.assign(it, patch);
    return true;
  };
  const deps: TicketDeps = {
    insertItem: async (row) => {
      inserts++;
      const id = next++;
      items.set(id, { ...row, id });
      return { id };
    },
    link: async (_id, itemId) => {
      if (change.support_item_id) return false;
      change.support_item_id = itemId;
      return true;
    },
    removeItem: async (itemId) => void items.delete(itemId),
    promote: guarded,
  };
  return { items, change, deps, close: { close: guarded }, inserts: () => inserts };
}

test("awaiting payment opens one ticket: normal title, no reply needed, Atlas system message", async () => {
  const w = world();
  assert.equal(await openTicket(w.deps, w.change), 100);
  const it = w.items.get(100)!;
  assert.equal(it.kind, "change");
  assert.equal(it.change_type, "plan_change");
  assert.equal(it.status, "submitted");
  assert.equal(it.needs_reply, false);
  assert.equal(it.title, "Plan change: Site to Group");
  assert.equal(it.details, ATLAS);
  assert.equal(waitingTicketDetails({ setup_diff_pence: 400000 }), ATLAS);
  assert.equal(it.link, undefined, "the item link shows to customers, so the Office link lives in the detail pane");
});

test("waiting is state, not text: the flag from plan_changes drives it", () => {
  const t = { change_type: "plan_change", status: "submitted", title: "Plan change: Site to Group" };
  assert.equal(isWaitingTicket({ ...t, waiting_on_customer: true }), true);
  assert.equal(isWaitingTicket({ ...t, waiting_on_customer: false }), false);
  assert.equal(isWaitingTicket(t), false);
  assert.equal(isWaitingTicket({ ...t, status: "declined", waiting_on_customer: true }), false);
});

test("retries and Pay never duplicate: the linked support_item_id is reused", async () => {
  const w = world();
  await openTicket(w.deps, w.change); // checkout created
  await openTicket(w.deps, w.change); // retry
  await openTicket(w.deps, { ...w.change }); // customer presses Pay
  assert.equal(w.inserts(), 1);
  assert.equal(w.items.size, 1);
});

test("Pay creates the ticket for a request that has none yet (older requests)", async () => {
  const w = world();
  assert.equal(w.change.support_item_id, null);
  assert.equal(await openTicket(w.deps, w.change), 100);
  assert.equal(w.change.support_item_id, 100);
  const server = readFileSync("src/lib/server/plan-change-server.ts", "utf8");
  const pay = server.slice(server.indexOf("export const resumePlanChangePayment"), server.indexOf("async function readStartedFrom"));
  assert.match(pay, /if \(r\.ok\) await openTicketFor\(admin, data\.changeId\);/);
});

test("a race that loses the link drops its own item", async () => {
  const w = world();
  const deps = { ...w.deps, link: async () => false };
  assert.equal(await openTicket(deps, w.change), null);
  assert.equal(w.items.size, 0);
});

test("paid (webhook or Mark as paid) turns it into the normal ticket, keyed on plan_changes status, once", async () => {
  const w = world();
  await openTicket(w.deps, w.change);
  const paid = { ...w.change, status: "paid" };
  assert.equal(await openTicket(w.deps, paid), 100);
  const it = w.items.get(100)!;
  assert.equal(it.title, ticketTitle(paid));
  assert.equal(it.needs_reply, true);
  assert.match(String(it.details), /Setup difference of £4,000 paid \(inc\. VAT\)\./);
  // Staff reply and work on it; a webhook retry must not undo that.
  it.needs_reply = false;
  it.status = "in_progress";
  const before = { ...it };
  await openTicket(w.deps, paid);
  assert.deepEqual(it, before);
  // Still pending: never promoted.
  const p = world();
  await openTicket(p.deps, p.change);
  await openTicket(p.deps, p.change);
  assert.equal(p.items.get(100)!.needs_reply, false);
  assert.equal(p.items.get(100)!.details, ATLAS);
});

test("cancelled or expired closes it once, keyed on plan_changes status, never a paid one", async () => {
  const w = world();
  await openTicket(w.deps, w.change);
  assert.equal(await closeWaitingTicket(w.close, w.change, "expired"), false, "still pending_payment: nothing to close");
  const cancelled = { ...w.change, status: "cancelled" };
  assert.equal(await closeWaitingTicket(w.close, cancelled, "expired"), true);
  const it = w.items.get(100)!;
  assert.equal(it.status, "declined");
  assert.equal(it.title, "Plan change: Site to Group, not paid");
  assert.match(String(it.details), /was not paid and the request expired/);
  assert.equal(await closeWaitingTicket(w.close, cancelled, "expired"), false, "second run is a no op");

  const p = world();
  await openTicket(p.deps, p.change);
  await openTicket(p.deps, { ...p.change, status: "paid" });
  assert.equal(await closeWaitingTicket(p.close, { ...p.change, status: "paid" }, "cancelled"), false);
  assert.equal(await closeWaitingTicket(p.close, { ...p.change, status: "cancelled" }, "cancelled"), false, "promoted ticket fails the guard");
  assert.equal(p.items.get(100)!.status, "submitted");
});

test("no setup difference or no linked ticket: nothing waits and nothing closes", async () => {
  const w = world();
  assert.equal(await openTicket(w.deps, { ...w.change, setup_diff_pence: 0 }), null);
  assert.equal(await closeWaitingTicket(w.close, { ...w.change, status: "cancelled" }, "cancelled"), false);
  assert.equal(w.inserts(), 0);
});

test("hidden from customers while unpaid (waiting or closed not paid), normal once paid", () => {
  assert.equal(hiddenFromCustomer({ status: "pending_payment", setup_diff_pence: 400000 }), true);
  assert.equal(hiddenFromCustomer({ status: "cancelled", setup_diff_pence: 400000 }), true);
  for (const status of ["paid", "requested", "applied", "scheduled", "rejected"]) assert.equal(hiddenFromCustomer({ status, setup_diff_pence: 400000 }), false, status);
  assert.equal(hiddenFromCustomer({ status: "cancelled", setup_diff_pence: 0 }), false, "a £0 booked change keeps today's visibility");
  const ids = customerHiddenIds([
    { support_item_id: 1, status: "pending_payment", setup_diff_pence: 400000 },
    { support_item_id: 2, status: "paid", setup_diff_pence: 400000 },
    { support_item_id: 3, status: "cancelled", setup_diff_pence: 400000 },
    { support_item_id: null, status: "pending_payment", setup_diff_pence: 400000 },
  ]);
  assert.deepEqual([...ids].sort(), [1, 3]);
});

test("customer side is enforced on the server: list filter fails closed, reply by id is refused", () => {
  const src = readFileSync("src/lib/server/live-view.ts", "utf8");
  const list = src.slice(src.indexOf("export const listSupport ="), src.indexOf("export const createSupportItem"));
  assert.match(list, /if \(!who\.team\) \{/);
  assert.match(list, /const hide = linked \? customerHiddenIds\(linked\) : new Set\(pcIds\);/);
  assert.match(list, /items = items\.filter\(\(i\) => !hide\.has\(i\.id\)\);/);
  const reply = src.slice(src.indexOf("export const replySupport"), src.indexOf("export const setSupportStatus"));
  assert.match(reply, /if \(!who\.team\) await assertCustomerCanSee\(who\.sb, item\);/);
});

test("copy is plain: no dashes, no middle dot, no Seats", () => {
  const all = [waitingTicketDetails(base), WAITING_LABEL, officeFileLink(4)].join(" ");
  assert.doesNotMatch(all, /[\u2013\u2014\u00b7]|Seats?\b/);
});

test("wiring: opened on checkout, closed on expiry and cancel, grey chip, cards or table never both", () => {
  const server = readFileSync("src/lib/server/plan-change-server.ts", "utf8");
  assert.match(server, /if \(started\.kind === "checkout"\) await openTicketFor\(admin, started\.changeId\);/);
  assert.match(server, /afterExpired: async \(id, tenantId\) => \{\s*await closeWaitingTicketFor\(sb, id, "expired"\);/);
  assert.match(readFileSync("src/lib/server/migration-server.ts", "utf8"), /closeWaitingTicketFor\(sb, r\.id, "cancelled"\)/);
  const store = readFileSync("src/lib/server/plan-change-ticket-store.ts", "utf8");
  assert.doesNotMatch(store, /\.eq\("title"/, "transitions key off state, not the title");
  assert.equal(store.match(/\.eq\("needs_reply", WAITING_TICKET_GUARD\.needs_reply\)/g)?.length, 2);
  const desk = readFileSync("src/components/office/support-desk.tsx", "utf8");
  assert.match(desk, /if \(isWaitingTicket\(item\)\) return <Waiting \/>;/);
  assert.match(desk, /fc-tix-cards/);
  assert.match(desk, /fc-tix-table/);
  assert.match(desk, /line-clamp-2/);
  assert.doesNotMatch(desk, /md:hidden|hidden md:block/);
  const css = readFileSync("src/styles.css", "utf8");
  assert.match(css, /@media \(min-width: 768px\) \{\s*\.fc-rows\.fc-tix-cards \{\s*display: none;/);
  assert.match(css, /\.fc-tix-thread \{\s*padding-bottom: 2px;/);
  assert.match(readFileSync("src/routes/office.tsx", "utf8"), /raw\.pane === "billing"/);
});

test("detail chip reads Waiting on customer in grey from the flag", async () => {
  const { ticketChip } = await import("../ticket-view.ts");
  assert.deepEqual(ticketChip({ status: "submitted", needs_reply: false, change_type: "plan_change", waiting_on_customer: true }), { tone: "neutral", label: "Waiting on customer" });
  assert.equal(ticketChip({ status: "submitted", needs_reply: true, change_type: "plan_change", waiting_on_customer: false }).tone, "action");
  assert.notEqual(ticketChip({ status: "submitted", needs_reply: false, change_type: "plan_change" }).label, "Waiting on customer");
});

test("Office thread hides only the waiting system message; other messages and the list preview stay", () => {
  const t = { change_type: "plan_change", status: "submitted", waiting_on_customer: true, details: waitingTicketDetails(base) };
  assert.equal(isWaitingSystemMessage(t), true);
  assert.equal(isWaitingSystemMessage({ ...t, waiting_on_customer: false }), false, "once paid the details show again");
  assert.equal(isWaitingSystemMessage({ ...t, details: "Move from Site to Group." }), false);
  assert.equal(isWaitingSystemMessage({ ...t, change_type: null }), false);
  const pane = readFileSync("src/components/office/ticket-pane.tsx", "utf8");
  assert.match(pane, /\{item\.details && !isWaitingSystemMessage\(item\) \? \(/);
  assert.match(pane, /item\.messages\.map\(/);
  assert.doesNotMatch(readFileSync("src/components/office/support-desk.tsx", "utf8"), /isWaitingSystemMessage/, "the list preview keeps it");
});
