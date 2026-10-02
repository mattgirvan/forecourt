/**
 * Wiring for the journey emails: who gets them, with what data, through
 * Resend. The rules live in email-engine.ts; the words in email/templates.ts.
 * Nothing here throws: an email problem must never break a payment or a
 * stage change.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { PLANS, monthTotalPence, normalizePlan } from "@/lib/catalog";
import { EMAIL_FROM, EMAIL_REPLY_TO, balanceLinkEmail, monthlyRestartEmail, progressEmail, thankYouEmail, type PaymentKind } from "@/lib/email/templates";
import { env } from "@/lib/env.server";
import { BOOK_URL, customerStepNumber } from "@/lib/journey";
import { SITE } from "@/lib/site";
import { SUPABASE_URL } from "@/lib/sb";
import { looksLikeTeam } from "@/lib/team";
import { resendKey } from "@/lib/server/resend-key";
import {
  deliverJourneyEmail,
  deliverStaffAlert,
  emailMode,
  supabaseEmailLog,
  teamList,
  type DeliverResult,
  type EmailLogDb,
  type EmailSender,
} from "@/lib/server/email-engine";

const ACCOUNT_URL = `${SITE.url}/account`;

function serviceClient(): SupabaseClient | null {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? env("GROK_SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function gateConfig() {
  return {
    mode: emailMode(env("EMAIL_MODE")),
    teamTo: teamList(env("EMAIL_TEAM_TO")),
    vercelEnv: env("VERCEL_ENV"),
  };
}

function resendSender(): EmailSender | null {
  const key = resendKey();
  if (!key) return null;
  const resend = new Resend(key);
  return async (msg, idempotencyKey) => {
    const { data, error } = await resend.emails.send(
      { from: msg.from, to: msg.to, replyTo: msg.replyTo, subject: msg.subject, html: msg.html, text: msg.text },
      { idempotencyKey },
    );
    return { id: data?.id ?? null, error: error ? error.message ?? String(error) : null };
  };
}

async function isStaffEmail(sb: SupabaseClient, email: string | null | undefined) {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  if (looksLikeTeam(e)) return true;
  try {
    const { data } = await sb.from("team_members").select("status").eq("email", e).maybeSingle();
    return Boolean(data && data.status !== "revoked");
  } catch {
    return false;
  }
}

/** The account login email (who bought), falling back to the sales inbox on the site. */
async function recipientFor(sb: SupabaseClient, userId: string | null | undefined, fallback: string | null | undefined) {
  let login: string | null = null;
  if (userId) {
    try {
      const { data } = await sb.auth.admin.getUserById(userId);
      login = data.user?.email?.toLowerCase() ?? null;
    } catch {
      login = null;
    }
  }
  return { login, to: login || (fallback ?? "").trim().toLowerCase() || null };
}

type TenantForEmail = {
  id: number;
  name: string | null;
  principal_name: string | null;
  email: string | null;
  domain: string | null;
  preview_url: string | null;
  plan: string | null;
  site_count: number | null;
  user_id: string | null;
  stage?: string | null;
  archived_at?: string | null;
};

async function loadTenant(sb: SupabaseClient, tenantId: number): Promise<TenantForEmail | null> {
  const cols = "id, name, principal_name, email, domain, preview_url, plan, site_count, user_id, stage";
  const withArchive = await sb.from("tenants").select(`${cols}, archived_at`).eq("id", tenantId).maybeSingle();
  if (!withArchive.error) return (withArchive.data as TenantForEmail | null) ?? null;
  // archive.sql may not be applied yet.
  const plain = await sb.from("tenants").select(cols).eq("id", tenantId).maybeSingle();
  return (plain.data as TenantForEmail | null) ?? null;
}

/**
 * Thank-you email after a paid Checkout session (Stripe webhook). One per
 * order, whichever of the webhook or the return URL applied the payment.
 */
export async function sendThankYouEmail(input: {
  order: { id: number; user_id: string; tenant_id: number | null; plan: string; amount_pence: number; kind?: string | null; site_count?: number | null };
  stripeLivemode: boolean | null;
  monthlyFrom: string | null | undefined;
}): Promise<DeliverResult | null> {
  try {
    const config = gateConfig();
    if (config.mode === "off") return { sent: false, reason: "mode_off" };
    const sb = serviceClient();
    if (!sb || !input.order.tenant_id) return null;
    const t = await loadTenant(sb, input.order.tenant_id);
    if (!t) return null;
    const plan = normalizePlan(input.order.plan);
    const kind: PaymentKind = input.order.kind === "trial" ? "trial" : input.order.kind === "convert" ? "convert" : "subscription";
    const { login, to } = await recipientFor(sb, input.order.user_id, t.email);
    const staff = (await isStaffEmail(sb, login)) || (await isStaffEmail(sb, to));
    const mail = thankYouEmail({
      firstName: t.principal_name,
      dealer: t.name || "your dealership",
      planName: PLANS[plan].name,
      kind,
      paidPence: input.order.amount_pence,
      monthlyPence: monthTotalPence(plan, input.order.site_count ?? t.site_count ?? 1),
      monthlyChargedToday: input.monthlyFrom === "checkout",
      bookUrl: BOOK_URL,
      accountUrl: ACCOUNT_URL,
      stage: t.stage ?? null,
    });
    return await deliverJourneyEmail(
      { config, log: supabaseEmailLog(sb as unknown as EmailLogDb), send: resendSender(), logger: console },
      {
        dedupeKey: `thank-you:order:${input.order.id}`,
        tenantId: t.id,
        kind: "thank_you",
        step: 1,
        recipient: to,
        from: EMAIL_FROM,
        replyTo: EMAIL_REPLY_TO,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        recipientIsStaff: staff,
        stripeLivemode: input.stripeLivemode,
        archived: Boolean(t.archived_at),
      },
    );
  } catch (err) {
    console.error("[email] thank-you failed", err);
    return null;
  }
}

/**
 * Progress email when staff move a site on and tick "Notify customer".
 * One per customer step (pack and build are both step 3), forward moves only.
 */
export async function sendProgressEmail(input: {
  tenantId: number;
  stage: string;
  previousStage: string | null | undefined;
  monthlyStartsToday?: boolean;
}): Promise<DeliverResult | { sent: false; reason: "not_forward" | "no_email_for_step" } | null> {
  try {
    const n = customerStepNumber(input.stage);
    if (n <= customerStepNumber(input.previousStage)) return { sent: false, reason: "not_forward" };
    const config = gateConfig();
    if (config.mode === "off") return { sent: false, reason: "mode_off" };
    const sb = serviceClient();
    if (!sb) return null;
    const t = await loadTenant(sb, input.tenantId);
    if (!t) return null;
    const plan = normalizePlan(t.plan);
    const mail = progressEmail({
      firstName: t.principal_name,
      dealer: t.name || "your dealership",
      stage: input.stage,
      previewUrl: t.preview_url,
      domain: t.domain,
      monthlyPence: monthTotalPence(plan, t.site_count ?? 1),
      monthlyStartsToday: input.monthlyStartsToday,
      bookUrl: BOOK_URL,
      accountUrl: ACCOUNT_URL,
    });
    if (!mail) return { sent: false, reason: "no_email_for_step" };
    const { login, to } = await recipientFor(sb, t.user_id, t.email);
    const staff = (await isStaffEmail(sb, login)) || (await isStaffEmail(sb, to));
    return await deliverJourneyEmail(
      { config, log: supabaseEmailLog(sb as unknown as EmailLogDb), send: resendSender(), logger: console },
      {
        dedupeKey: `progress:tenant:${t.id}:step:${n}`,
        tenantId: t.id,
        kind: "progress",
        step: n,
        recipient: to,
        from: EMAIL_FROM,
        replyTo: EMAIL_REPLY_TO,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        recipientIsStaff: staff,
        stripeLivemode: null,
        archived: Boolean(t.archived_at),
      },
    );
  } catch (err) {
    console.error("[email] progress failed", err);
    return null;
  }
}

/**
 * Balance payment link, only when staff press Send on Resume order. Goes
 * through the same engine (EMAIL_MODE, team copies, email_log dedupe), one
 * email per Stripe link.
 */
export async function sendBalanceLinkEmail(input: {
  tenantId: number;
  url: string;
  amountPence: number;
  sessionId: string;
}): Promise<DeliverResult | null> {
  try {
    const config = gateConfig();
    if (config.mode === "off") return { sent: false, reason: "mode_off" };
    const sb = serviceClient();
    if (!sb) return null;
    const t = await loadTenant(sb, input.tenantId);
    if (!t) return null;
    const mail = balanceLinkEmail({
      firstName: t.principal_name,
      dealer: t.name || "your dealership",
      amountPence: input.amountPence,
      payUrl: input.url,
      accountUrl: ACCOUNT_URL,
    });
    const { login, to } = await recipientFor(sb, t.user_id, t.email);
    const staff = (await isStaffEmail(sb, login)) || (await isStaffEmail(sb, to));
    return await deliverJourneyEmail(
      { config, log: supabaseEmailLog(sb as unknown as EmailLogDb), send: resendSender(), logger: console },
      {
        dedupeKey: `balance-link:tenant:${t.id}:session:${input.sessionId}`,
        tenantId: t.id,
        kind: "balance_link",
        step: null,
        recipient: to,
        from: EMAIL_FROM,
        replyTo: EMAIL_REPLY_TO,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        recipientIsStaff: staff,
        stripeLivemode: null,
        archived: Boolean(t.archived_at),
      },
    );
  } catch (err) {
    console.error("[email] balance link failed", err);
    return null;
  }
}

/**
 * Resume restarted the monthly and charged the first month (the owner ticked
 * that the customer agreed). Same engine as every journey email (EMAIL_MODE,
 * team copies), deduped in email_log: one email per subscription.
 */
export async function sendMonthlyRestartEmail(input: {
  tenantId: number;
  subscriptionId: string;
  monthlyPence: number;
  chargedAt: Date;
}): Promise<DeliverResult | null> {
  try {
    const config = gateConfig();
    if (config.mode === "off") return { sent: false, reason: "mode_off" };
    const sb = serviceClient();
    if (!sb) return null;
    const t = await loadTenant(sb, input.tenantId);
    if (!t) return null;
    const mail = monthlyRestartEmail({
      firstName: t.principal_name,
      dealer: t.name || "your dealership",
      monthlyPence: input.monthlyPence,
      chargedOn: input.chargedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }),
      accountUrl: ACCOUNT_URL,
    });
    const { login, to } = await recipientFor(sb, t.user_id, t.email);
    const staff = (await isStaffEmail(sb, login)) || (await isStaffEmail(sb, to));
    return await deliverJourneyEmail(
      { config, log: supabaseEmailLog(sb as unknown as EmailLogDb), send: resendSender(), logger: console },
      {
        dedupeKey: monthlyRestartDedupeKey(t.id, input.subscriptionId),
        tenantId: t.id,
        kind: "monthly_restart",
        step: null,
        recipient: to,
        from: EMAIL_FROM,
        replyTo: EMAIL_REPLY_TO,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        recipientIsStaff: staff,
        stripeLivemode: null,
        archived: Boolean(t.archived_at),
      },
    );
  } catch (err) {
    console.error("[email] monthly restart failed", err);
    return null;
  }
}

/** One restart email per subscription, ever. */
export function monthlyRestartDedupeKey(tenantId: number, subscriptionId: string) {
  return `monthly-restart:tenant:${tenantId}:sub:${subscriptionId}`;
}

/** One line for staff under the stage rail. */
export function emailOutcomeMessage(r: Awaited<ReturnType<typeof sendProgressEmail>>): string {
  if (!r) return "Customer email not sent (server not configured).";
  if (r.sent) return r.mode === "team" ? `Team copy sent to ${r.to.join(", ")}.` : "Customer emailed.";
  switch (r.reason) {
    case "mode_off":
      return "Emails are off (EMAIL_MODE is not set), so nothing was sent.";
    case "team_list_empty":
      return "EMAIL_MODE is team but EMAIL_TEAM_TO is empty, so nothing was sent.";
    case "duplicate":
      return "Already emailed for this step, so nothing new was sent.";
    case "log_unavailable":
      return "Email skipped: the email_log table is not set up yet (run supabase/email-log.sql).";
    case "not_forward":
      return "No email: the customer step did not move forward.";
    case "staff_recipient":
      return "No email: this is a staff account.";
    case "not_production":
      return "No email: only production sends to customers.";
    case "archived":
      return "No email: this order is archived.";
    case "no_recipient":
      return "No email: no customer address on this order.";
    case "no_sender":
      return "No email: RESEND_API_KEY is not reachable.";
    case "send_failed":
      return `Email failed: ${r.detail ?? "unknown error"}.`;
    default:
      return `No email (${r.reason}).`;
  }
}

/** Team-only email for a staff flag on a payment (duplicate, look-alike). Never throws. */
export async function sendStaffAlert(flag: {
  tenantId: number;
  title: string;
  body: string;
  dedupeKey: string;
}): Promise<DeliverResult | null> {
  try {
    const config = gateConfig();
    if (config.mode === "off") return { sent: false, reason: "mode_off" };
    const sb = serviceClient();
    const officeUrl = `${SITE.url}/office`;
    const text = `${flag.title}\n\n${flag.body}\n\nSite #${flag.tenantId}. Open the office: ${officeUrl}`;
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<p><strong>${esc(flag.title)}</strong></p><p>${esc(flag.body)}</p><p>Site #${flag.tenantId}. <a href="${officeUrl}">Open the office</a></p>`;
    return await deliverStaffAlert(
      { config, log: supabaseEmailLog(sb as unknown as EmailLogDb), send: resendSender(), logger: console },
      {
        dedupeKey: flag.dedupeKey,
        tenantId: flag.tenantId,
        from: EMAIL_FROM,
        replyTo: EMAIL_REPLY_TO,
        subject: flag.title,
        text,
        html,
      },
    );
  } catch (err) {
    console.error("[email] staff alert failed", err);
    return null;
  }
}
