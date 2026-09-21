/**
 * Contact / enquiry handling for POST /api/contact.
 * Email via Resend; persist via Supabase service role. Prefer both; succeed if either works.
 */
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  contactBodySchema,
  labelForRole,
  labelForSites,
  labelForTopic,
  type ContactBody,
} from "@/lib/contact";
import { env } from "@/lib/env.server";
import { SITE } from "@/lib/site";
import { SUPABASE_URL } from "@/lib/sb";
import { jsonResponse } from "@/lib/server/build-api";

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 5;
/** In-memory only. Resets on cold start / multi-instance. Fine for v1. */
const rateHits = new Map<string, number[]>();

function serviceClient() {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? env("GROK_SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return null;
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function firstNonEmpty(...vals: Array<string | undefined>) {
  for (const v of vals) {
    const t = v?.trim();
    if (t) return t;
  }
  return undefined;
}

function resendKeyFromRuntimeConfig(): string | undefined {
  try {
    const req = createRequire(import.meta.url);
    const nitroRc = req("nitro/runtime-config") as {
      useRuntimeConfig: () => Record<string, unknown>;
    };
    const rc = nitroRc.useRuntimeConfig() ?? {};
    const asString = (v: unknown) => (typeof v === "string" ? v : undefined);
    return firstNonEmpty(
      asString(rc.resendApiKey),
      asString(rc.RESEND_API_KEY),
      asString(rc.GROK_RESEND_API_KEY),
    );
  } catch {
    return undefined;
  }
}

function resendKey() {
  return firstNonEmpty(env("RESEND_API_KEY"), env("GROK_RESEND_API_KEY"), resendKeyFromRuntimeConfig());
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 80);
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 80);
  return "unknown";
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const prev = rateHits.get(key) ?? [];
  const recent = prev.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    rateHits.set(key, recent);
    return true;
  }
  recent.push(now);
  rateHits.set(key, recent);
  return false;
}

function softSuccess() {
  return jsonResponse({ ok: true });
}

async function sendEnquiryEmail(data: ContactBody, meta: { ip: string; ua: string }) {
  const key = resendKey();
  if (!key) return { ok: false as const, reason: "email_not_configured" };

  const resend = new Resend(key);
  const subject = `Enquiry: ${labelForTopic(data.topic)} · ${data.dealership}`;
  const lines = [
    `Name: ${data.name}`,
    `Work email: ${data.email}`,
    `Phone: ${data.phone || "(none)"}`,
    `Dealership / group: ${data.dealership}`,
    `Role: ${labelForRole(data.role)}`,
    `Sites: ${labelForSites(data.sites)}`,
    `Topic: ${labelForTopic(data.topic)}`,
    "",
    data.message,
    "",
    `---`,
    `IP: ${meta.ip}`,
    `UA: ${meta.ua.slice(0, 240)}`,
  ];

  const { error } = await resend.emails.send({
    from: `Forecourt <${SITE.email}>`,
    to: [SITE.email],
    replyTo: data.email,
    subject,
    text: lines.join("\n"),
  });

  if (error) {
    console.error("[contact] resend failed:", error.message ?? error);
    return { ok: false as const, reason: "email_send_failed" };
  }
  return { ok: true as const };
}

async function saveEnquiry(data: ContactBody, meta: { ip: string; ua: string }) {
  const sb = serviceClient();
  if (!sb) return { ok: false as const, reason: "db_not_configured" };

  const { error } = await sb.from("enquiries").insert({
    name: data.name,
    email: data.email,
    phone: data.phone || null,
    dealership: data.dealership,
    role: data.role,
    sites: data.sites,
    topic: data.topic,
    message: data.message,
    user_agent: meta.ua.slice(0, 500) || null,
    ip: meta.ip === "unknown" ? null : meta.ip,
  });

  if (error) {
    console.error("[contact] supabase insert failed:", error.message);
    return { ok: false as const, reason: "db_insert_failed" };
  }
  return { ok: true as const };
}

export async function handleContactPost(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonResponse({ error: "Send a JSON body." }, 400);
  }

  const parsed = contactBodySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Check the form and try again.";
    return jsonResponse({ error: first }, 400);
  }

  const data = parsed.data;

  // Honeypot: pretend success so bots stop.
  if (data.website && data.website.trim().length > 0) {
    return softSuccess();
  }

  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? "";
  const rateKey = `${ip}|${data.email}`;
  if (rateLimited(rateKey)) {
    return jsonResponse(
      { error: "Too many enquiries from this address. Try again in a bit." },
      429,
    );
  }

  const meta = { ip, ua };
  const [mail, db] = await Promise.all([
    sendEnquiryEmail(data, meta),
    saveEnquiry(data, meta),
  ]);

  if (mail.ok || db.ok) {
    return softSuccess();
  }

  const bothMissing =
    mail.reason === "email_not_configured" && db.reason === "db_not_configured";
  console.error("[contact] both paths failed", { mail: mail.reason, db: db.reason });
  return jsonResponse(
    {
      error: bothMissing
        ? "Enquiry intake is not configured yet. Email hello@forecourt.me directly."
        : "Could not send your enquiry just now. Email hello@forecourt.me or try again.",
    },
    503,
  );
}
