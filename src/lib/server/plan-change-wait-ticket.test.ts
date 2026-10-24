import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  WAITING_LABEL,
  closeWaitingTicket,
  isWaitingTicket,
  officeFileLink,
  openTicket,
  ticketTitle,
  waitingTicketDetails,
  waitingTicketTitle,
  type TicketChange,
  type TicketDeps,
} from "./plan-change-ticket.ts";

const base: TicketChange = { id: 7, tenant_id: 4, from_plan: "site", to_plan: "group", status: "pending_payment", direction: "up", setup_diff_pence: 400000, new_monthly_pence: 49800, support_item_id: null, requested_by: "owner@example.test" };

/** A tiny support_items table with the same conditional updates the store uses. */
function world() {
  const items = new Map<number, Record<string, unknown>>();
  const change = { ...base };
  let next = 100;
  let inserts = 0;
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
    promote: async (itemId, waitingTitle, patch) => {
      const it = items.get(itemId);
      if (!it || it.title !== waitingTitle) return false;
      Object.assign(it, patch);
      return true;
    },
  };
  const close = {
    close: async (itemId: number, waitingTitle: string, patch: Record<string, unknown>) => {
      const it = items.get(itemId);
      if (!it || it.title !== waitingTitle) return false;
      Object.assign(it, patch);
      return true;
    },
  };
  return { items, change, deps, close, inserts: () => inserts };
}

test("awaiting payment opens one grey ticket with the move, amount and file link", async () => {
  const w = world();
  const id = await openTicket(w.deps, w.change);
  assert.equal(id, 100);
  const it = w.items.get(100)!;
  assert.equal(it.kind, "change");
  assert.equal(it.change_type, "plan_change");
  assert.equal(it.status, "submitted");
  assert.equal(it.needs_reply, false);
  assert.equal(it.title, "Plan change: Site to Group, waiting on customer");
  assert.match(String(it.details), /Waiting on customer\. Move from Site to Group\./);
  assert.match(String(it.details), /£4,000 \(inc\. VAT\)/);
  // The item link is shown to the customer too, so the Office link lives in the detail pane only.
  assert.equal(it.link, undefined);
  assert.equal(officeFileLink(4), "/office?tab=customers&id=4&pane=billing");
  assert.equal(isWaitingTicket(it as never), true);
});

test("retries never duplicate: the linked item is returned and nothing new is inserted", async () => {
  const w = world();
  await openTicket(w.deps, w.change);
  await openTicket(w.deps, w.change);
  await openTicket(w.deps, { ...w.change });
  assert.equal(w.inserts(), 1);
  assert.equal(w.items.size, 1);
});

test("a race that loses the link drops its own item", async () => {
  const w = world();
  w.change.support_item_id = null;
  const deps = { ...w.deps, link: async () => false };
  assert.equal(await openTicket(deps, w.change), null);
  assert.equal(w.items.size, 0);
});

test("paid (webhook or Mark as paid) turns the waiting ticket into the normal one, once", async () => {
  const w = world();
  await openTicket(w.deps, w.change);
  const paid = { ...w.change, status: "paid" };
  assert.equal(await openTicket(w.deps, paid), 100);
  const it = w.items.get(100)!;
  assert.equal(it.title, ticketTitle(paid));
  assert.equal(it.needs_reply, true);
  assert.match(String(it.details), /Setup difference of £4,000 paid \(inc\. VAT\)\./);
  assert.equal(isWaitingTicket(it as never), false);
  // A staff reply later clears needs_reply; a webhook retry must not undo it.
  it.needs_reply = false;
  await openTicket(w.deps, paid);
  assert.equal(it.needs_reply, false);
  assert.equal(w.inserts(), 1);
});

test("cancelled or expired closes the waiting ticket once, and never closes a paid one", async () => {
  const w = world();
  await openTicket(w.deps, w.change);
  assert.equal(await closeWaitingTicket(w.close, { ...w.change, status: "cancelled" }, "expired"), true);
  const it = w.items.get(100)!;
  assert.equal(it.status, "declined");
  assert.equal(it.title, "Plan change: Site to Group, not paid");
  assert.match(String(it.details), /was not paid and the request expired/);
  assert.equal(await closeWaitingTicket(w.close, w.change, "expired"), false);

  const p = world();
  await openTicket(p.deps, p.change);
  await openTicket(p.deps, { ...p.change, status: "paid" });
  assert.equal(await closeWaitingTicket(p.close, p.change, "cancelled"), false);
  assert.equal(p.items.get(100)!.status, "submitted");
});

test("no setup difference or no linked ticket: nothing waits and nothing closes", async () => {
  const w = world();
  assert.equal(await openTicket(w.deps, { ...w.change, setup_diff_pence: 0 }), null);
  assert.equal(await closeWaitingTicket(w.close, w.change, "cancelled"), false);
  assert.equal(w.inserts(), 0);
});

test("waiting copy is plain: no dashes, no middle dot, no Seats", () => {
  const all = [waitingTicketTitle(base), waitingTicketDetails(base), WAITING_LABEL, officeFileLink(4)].join(" ");
  assert.doesNotMatch(all, /[\u2013\u2014\u00b7]|Seats?\b/);
});

test("wiring: opened on checkout, closed on expiry and cancel, grey in the Tickets list, file link opens Billing", () => {
  const server = readFileSync("src/lib/server/plan-change-server.ts", "utf8");
  assert.match(server, /if \(started\.kind === "checkout"\) await openTicketFor\(admin, started\.changeId\);/);
  assert.match(server, /afterExpired: async \(id, tenantId\) => \{\s*await closeWaitingTicketFor\(sb, id, "expired"\);/);
  const mig = readFileSync("src/lib/server/migration-server.ts", "utf8");
  assert.match(mig, /closeWaitingTicketFor\(sb, r\.id, "cancelled"\)/);
  const desk = readFileSync("src/components/office/support-desk.tsx", "utf8");
  assert.match(desk, /if \(isWaitingTicket\(item\)\) return <Waiting \/>;/);
  assert.doesNotMatch(desk.slice(desk.indexOf("function Waiting"), desk.indexOf("function Waiting") + 200), /tone="action"/);
  const pane = readFileSync("src/components/office/plan-change-ticket.tsx", "utf8");
  assert.match(pane, /data-testid="plan-change-ticket-waiting"/);
  assert.match(pane, /min-h-11/);
  const office = readFileSync("src/routes/office.tsx", "utf8");
  assert.match(office, /raw\.pane === "billing"/);
});

test("detail chip reads Waiting on customer in grey, and back to normal once paid", async () => {
  const { ticketChip } = await import("../ticket-view.ts");
  assert.deepEqual(ticketChip({ status: "submitted", needs_reply: false, change_type: "plan_change", title: waitingTicketTitle(base) }), { tone: "neutral", label: "Waiting on customer" });
  assert.equal(ticketChip({ status: "submitted", needs_reply: true, change_type: "plan_change", title: ticketTitle(base) }).tone, "action");
  assert.notEqual(ticketChip({ status: "declined", needs_reply: false, change_type: "plan_change", title: waitingTicketTitle(base) }).label, "Waiting on customer");
});
