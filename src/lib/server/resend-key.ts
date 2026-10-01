/** RESEND_API_KEY from process env, or Nitro runtime config on Vercel. */
import { createRequire } from "node:module";
import { env } from "@/lib/env.server";

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

export function resendKey() {
  return firstNonEmpty(env("RESEND_API_KEY"), env("GROK_RESEND_API_KEY"), resendKeyFromRuntimeConfig());
}

