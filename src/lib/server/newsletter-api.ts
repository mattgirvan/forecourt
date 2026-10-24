/** Wires the pure newsletter rules to env, Resend and the request. */
import { env } from "@/lib/env.server";
import { SITE } from "@/lib/site";
import { jsonResponse } from "@/lib/server/build-api";
import { resendKey } from "@/lib/server/resend-key";
import { sbAdmin } from "@/lib/server/staff-actor";
import { recordConfirmed } from "@/lib/server/newsletter-sequence-store";
import {
  handleSubscribe,
  handleToken,
  makeLimiter,
  MSG,
  type Deps,
  type Purpose,
} from "@/lib/server/newsletter";

const ipLimited = makeLimiter(8, 15 * 60 * 1000);
const emailLimited = makeLimiter(3, 60 * 60 * 1000);

export function newsletterConfig(): Deps["config"] {
  return deps().config;
}

function deps(): Deps {
  return {
    config: {
      apiKey: resendKey(),
      // Resend renamed Audiences to Segments; the old name still works as a fallback.
      segmentId: env("RESEND_NEWSLETTER_SEGMENT_ID") ?? env("RESEND_NEWSLETTER_AUDIENCE_ID"),
      monthlySegmentId: env("RESEND_NEWSLETTER_MONTHLY_SEGMENT_ID"),
      secret: env("NEWSLETTER_TOKEN_SECRET"),
      // Same sender as contact mail.
      from: `Forecourt <${SITE.email}>`,
      replyTo: SITE.email,
      baseUrl: (env("NEWSLETTER_BASE_URL") ?? SITE.url).replace(/\/+$/, ""),
    },
    fetch: (u, i) => fetch(u, i),
    ipLimited,
    emailLimited,
    onConfirmed: (email, at) => recordConfirmed(sbAdmin(), email, at),
  };
}

function clientIp(request: Request): string {
  const f = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (f || request.headers.get("x-real-ip")?.trim() || "unknown").slice(0, 80);
}

export async function subscribePost(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    const type = request.headers.get("content-type") ?? "";
    raw = type.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
  } catch {
    return jsonResponse({ ok: false, message: MSG.invalid }, 400);
  }
  try {
    const r = await handleSubscribe(raw, clientIp(request), deps());
    return jsonResponse(r.body, r.status);
  } catch {
    return jsonResponse({ ok: false, message: MSG.failed }, 500);
  }
}

async function outcome(token: string | null, p: Purpose) {
  try {
    return await handleToken(token, p, deps());
  } catch {
    return "error" as const;
  }
}

/** GET from the email link: act, then show the result page. */
export async function tokenRedirect(request: Request, p: Purpose): Promise<Response> {
  const url = new URL(request.url);
  const result = await outcome(url.searchParams.get("t"), p);
  const page = p === "c" ? "/newsletter/confirmed" : "/newsletter/unsubscribed";
  return new Response(null, { status: 303, headers: { Location: `${page}?status=${result}`, "Cache-Control": "no-store" } });
}

/** RFC 8058 one-click POST from the mail client. */
export async function unsubscribeOneClick(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let token = url.searchParams.get("t");
  if (!token) {
    try {
      token = String((await request.formData()).get("t") ?? "") || null;
    } catch {
      token = null;
    }
  }
  const result = await outcome(token, "u");
  return jsonResponse({ ok: result === "ok", status: result }, result === "ok" ? 200 : result === "error" || result === "unavailable" ? 503 : 400);
}
