import { createClient, type EmailOtpType, type SupabaseClient } from "@supabase/supabase-js";
import { SITE } from "./site";

export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
  "https://hxodmtmrnpxzkfwhrsjg.supabase.co";

export const SUPABASE_ANON =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4b2RtdG1ybnB4emtmd2hyc2pnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTQzODMsImV4cCI6MjEwNTEzMDM4M30.eJumLs7-b58H7Ft5-RzpymhZjhHThQNWEMRZB9hgbpc";

export function supabaseReady() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON);
}

let browser: SupabaseClient | null = null;

export function getSb(): SupabaseClient {
  if (!SUPABASE_ANON) {
    throw new Error("Set VITE_SUPABASE_ANON_KEY on the Forecourt Vercel project.");
  }
  if (typeof window === "undefined") {
    return createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  if (!browser) {
    browser = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        storageKey: "forecourt-auth",
      },
    });
  }
  return browser;
}

export function magicRedirect() {
  if (typeof window !== "undefined") return `${window.location.origin}/login`;
  return `${SITE.url}/login`;
}

const OTP_TYPES: EmailOtpType[] = ["email", "magiclink", "signup", "invite"];

/** Finish a mail-app link (token_hash) so PKCE in another window is not required. */
export async function consumeAuthFromUrl(): Promise<boolean> {
  if (typeof window === "undefined" || !supabaseReady()) return false;
  const url = new URL(window.location.href);
  const tokenHash = url.searchParams.get("token_hash") ?? url.searchParams.get("token");
  const rawType = url.searchParams.get("type");
  if (!tokenHash) {
    const { data } = await getSb().auth.getSession();
    return Boolean(data.session);
  }
  const sb = getSb();
  const order: EmailOtpType[] = [
    ...(OTP_TYPES.includes(rawType as EmailOtpType) ? [rawType as EmailOtpType] : []),
    ...OTP_TYPES,
  ];
  let last: string | null = null;
  for (const type of order) {
    const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      url.searchParams.delete("token_hash");
      url.searchParams.delete("token");
      url.searchParams.delete("type");
      window.history.replaceState({}, "", url.pathname + url.search);
      return true;
    }
    last = error.message;
  }
  console.warn("sign-in link", last);
  return false;
}