/**
 * Desk event intake. A desk posts a signed event (desk 0007); this checks the
 * signature with that desk's secret, then emails the account admin and
 * hello@ through sendAccountEventEmail, deduped in email_log per event.
 * Billing is not changed here: Office stays the place sites go live or come
 * off the bill. A build_events note tells the team.
 */
import { normalizePlan, type PlanId } from "../catalog.ts";
import { siteBreakdown, type BillingSite } from "../site-billing.ts";
import { siteAddedEvent, siteRemovedEvent, siteRestoredEvent, staffAccessEvent, type AccountEvent } from "../account-events.ts";
import { deskEventKey, parseDeskEvent, verifyDeskSignature } from "../desk-events.ts";

export type DeskLink = { tenantId: number; keyId: string; secret: string; revoked: boolean };

export type DeskEventDeps = {
  findLink: (keyId: string) => Promise<DeskLink | null>;
  loadAccount: (tenantId: number) => Promise<{ plan: string; sites: BillingSite[] } | null>;
  send: (tenantId: number, ev: AccountEvent) => Promise<unknown>;
  note: (tenantId: number, title: string, body: string) => Promise<unknown>;
  nowSeconds?: number;
};

export type DeskEventResponse = { status: number; body: { ok: boolean; error?: string; kind?: string } };

export function buildDeskEmail(input: {
  tenantId: number;
  keyId: string;
  plan: PlanId;
  sites: BillingSite[];
  event: NonNullable<ReturnType<typeof parseDeskEvent>>;
}): AccountEvent {
  const e = input.event;
  const key = deskEventKey(input.tenantId, input.keyId, e.event_id);
  const by = e.actor;
  if (e.kind === "staff_access_changed") {
    const names = Object.fromEntries(input.sites.map((s) => [s.code, s.name]));
    return staffAccessEvent({ eventKey: key, email: e.staff.email, allSites: e.staff.all_sites, sites: e.staff.sites, siteNames: names, by });
  }
  if (e.kind === "site_added") {
    const known = input.sites.filter((s) => s.code !== e.site.code);
    const before = siteBreakdown(input.plan, known).total;
    const after = siteBreakdown(input.plan, [...known, { code: e.site.code, name: e.site.name, status: "live" }]).total;
    return siteAddedEvent({ tenantId: input.tenantId, eventKey: key, siteName: e.site.name, addsPence: after - before, totalAfterPence: after });
  }
  if (e.kind === "site_removed") return siteRemovedEvent({ eventKey: key, siteName: e.site.name, by });
  return siteRestoredEvent({ eventKey: key, siteName: e.site.name, by });
}

export async function handleDeskEvent(
  req: { keyId: string | null; timestamp: string | null; signature: string | null; raw: string },
  deps: DeskEventDeps,
): Promise<DeskEventResponse> {
  if (!req.keyId || req.raw.length > 20_000) return { status: 400, body: { ok: false, error: "bad request" } };
  const link = await deps.findLink(req.keyId);
  if (!link || link.revoked) return { status: 401, body: { ok: false, error: "unknown desk" } };
  const v = verifyDeskSignature({ secret: link.secret, timestamp: req.timestamp, signature: req.signature, body: req.raw, nowSeconds: deps.nowSeconds });
  if (!v.ok) return { status: 401, body: { ok: false, error: v.reason } };
  const event = parseDeskEvent(req.raw);
  if (!event) return { status: 400, body: { ok: false, error: "bad event" } };
  const acct = await deps.loadAccount(link.tenantId);
  if (!acct) return { status: 404, body: { ok: false, error: "no account" } };
  const ev = buildDeskEmail({ tenantId: link.tenantId, keyId: link.keyId, plan: normalizePlan(acct.plan), sites: acct.sites, event });
  await deps.send(link.tenantId, ev);
  await deps.note(link.tenantId, `Desk: ${ev.title}`, `${ev.lines.join(" ")}${event.kind === "site_added" || event.kind === "site_removed" || event.kind === "site_restored" ? " Billing not changed; use Office Sites to go live or archive." : ""}`);
  return { status: 200, body: { ok: true, kind: event.kind } };
}
