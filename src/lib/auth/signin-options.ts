/**
 * Which extra sign-in methods the sign-in and account pages may offer.
 *
 * Pure and browser-free so it can be unit tested. The email code stays the
 * backup on every page: these helpers only ever ADD a button when it is safe.
 *
 * Passkeys (Supabase Auth passkeys, experimental in supabase-js 2.105+):
 *  - the build flag VITE_PASSKEYS must be on (like VITE_GOOGLE_SIGNIN), so
 *    passkeys do not go live just because this code is merged;
 *  - the relying party is forecourt.me, so a passkey only works on
 *    https://forecourt.me and https://www.forecourt.me. Vercel previews
 *    (*.vercel.app) and localhost cannot use it, so we hide it there;
 *  - the browser must support WebAuthn;
 *  - the project must report `passkeys_enabled: true` from /auth/v1/settings.
 *
 * Google: shown only when the build flag VITE_GOOGLE_SIGNIN is on AND the
 * project reports the Google provider as enabled, so nothing breaks before
 * Google is set up.
 */

export const PASSKEY_RP_ID = "forecourt.me";
export const PASSKEY_HOSTS: readonly string[] = ["forecourt.me", "www.forecourt.me"];

/** True for "1", "true", "yes" or "on" (any case). Anything else is off. */
export function flagOn(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function passkeyHostAllowed(hostname: string | null | undefined): boolean {
  const h = (hostname ?? "").trim().toLowerCase().replace(/\.$/, "");
  return PASSKEY_HOSTS.includes(h);
}

/** Minimal shape of the window bits we read, so tests can pass a fake. */
export type WebAuthnWindow = {
  PublicKeyCredential?: unknown;
  navigator?: { credentials?: { create?: unknown; get?: unknown } };
  isSecureContext?: boolean;
};

export function webauthnSupported(win: WebAuthnWindow | null | undefined): boolean {
  if (!win) return false;
  if (win.isSecureContext === false) return false;
  const creds = win.navigator?.credentials;
  return (
    typeof win.PublicKeyCredential === "function" &&
    typeof creds?.create === "function" &&
    typeof creds?.get === "function"
  );
}

export type AuthSettings = { passkeys: boolean; google: boolean; email: boolean };

/** Read GET /auth/v1/settings. Unknown or malformed means "off". */
export function parseAuthSettings(json: unknown): AuthSettings {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const ext = (o.external && typeof o.external === "object" ? o.external : {}) as Record<
    string,
    unknown
  >;
  return {
    passkeys: o.passkeys_enabled === true,
    google: ext.google === true,
    email: ext.email === true,
  };
}

export type PasskeyState =
  | "ready"
  /** Build flag VITE_PASSKEYS is off. */
  | "flag_off"
  /** Settings not loaded yet. */
  | "checking"
  /** Not on forecourt.me, e.g. a Vercel preview or localhost. */
  | "off_domain"
  /** Browser has no WebAuthn. */
  | "unsupported"
  /** Project has passkeys switched off. */
  | "server_off";

export function passkeyState(input: {
  flag: unknown;
  hostname: string | null | undefined;
  webauthn: boolean;
  settings: AuthSettings | null;
}): PasskeyState {
  if (!flagOn(input.flag)) return "flag_off";
  if (!passkeyHostAllowed(input.hostname)) return "off_domain";
  if (!input.webauthn) return "unsupported";
  if (!input.settings) return "checking";
  return input.settings.passkeys ? "ready" : "server_off";
}

export function googleShown(input: { flag: unknown; settings: AuthSettings | null }): boolean {
  return flagOn(input.flag) && input.settings?.google === true;
}

/**
 * What each extra button on the sign-in page should do right now:
 *  - "show": it works here, show it;
 *  - "reserve": it might work but we are still finding out (before mount, or
 *    while /auth/v1/settings loads), so keep its space and show nothing, and
 *    the email box does not jump when it arrives;
 *  - "hide": it cannot work here, take no space.
 */
export type Slot = "show" | "reserve" | "hide";

export function signInSlots(input: {
  passkeysFlag: unknown;
  googleFlag: unknown;
  /** null before mount (SSR and first paint). */
  hostname: string | null;
  webauthn: boolean | null;
  settings: AuthSettings | null;
  settingsLoaded: boolean;
}): { passkey: Slot; google: Slot } {
  let passkey: Slot;
  if (!flagOn(input.passkeysFlag)) passkey = "hide";
  else if (input.hostname === null || input.webauthn === null) passkey = "reserve";
  else if (!passkeyHostAllowed(input.hostname) || !input.webauthn) passkey = "hide";
  else if (!input.settingsLoaded) passkey = "reserve";
  else passkey = input.settings?.passkeys ? "show" : "hide";

  let google: Slot;
  if (!flagOn(input.googleFlag)) google = "hide";
  else if (!input.settingsLoaded) google = "reserve";
  else google = input.settings?.google ? "show" : "hide";

  return { passkey, google };
}

/** Where Google sends people back to. Must be in Supabase Redirect URLs. */
export function oauthReturnPath(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/login`;
}

type ErrorLike =
  { name?: unknown; code?: unknown; message?: unknown; cause?: unknown; status?: unknown } | null | undefined;

/** Every code or name on the error and its cause (auth-js wraps browser errors). */
function errCodes(e: ErrorLike): Set<string> {
  const out = new Set<string>();
  const add = (x: ErrorLike) => {
    if (!x || typeof x !== "object") return;
    if (typeof x.code === "string" && x.code) out.add(x.code);
    if (typeof x.name === "string" && x.name) out.add(x.name);
  };
  add(e);
  add(e?.cause as ErrorLike);
  return out;
}

const CANCELLED = ["NotAllowedError", "AbortError", "ERROR_CEREMONY_ABORTED"];

function cancelled(e: ErrorLike, codes: Set<string>): boolean {
  const msg = typeof e?.message === "string" ? e.message : "";
  return CANCELLED.some((c) => codes.has(c)) || /cancel|not allowed|timed out/i.test(msg);
}

/** Plain words for a failed passkey sign-in, or null when the visitor just cancelled. */
export function passkeySignInMessage(e: ErrorLike): string | null {
  const codes = errCodes(e);
  const has = (c: string) => codes.has(c);
  if (cancelled(e, codes)) return null;
  if (has("webauthn_credential_not_found"))
    return "That passkey is not linked to a Forecourt account. Sign in with an email code, then add a passkey on your account page.";
  if (has("passkey_disabled"))
    return "Passkey sign-in is not switched on yet. Use an email code for now.";
  if (has("webauthn_challenge_expired") || has("webauthn_challenge_not_found"))
    return "That took too long. Try the passkey again.";
  if (has("user_banned")) return "This account is blocked. Email hello@forecourt.me.";
  if (has("email_not_confirmed"))
    return "Confirm your email with a code first, then use your passkey.";
  return "Passkey sign-in did not work. Try again, or use an email code.";
}

/** Plain words for a failed "Add a passkey", or null when the visitor just cancelled. */
export function passkeyAddMessage(e: ErrorLike): string | null {
  const codes = errCodes(e);
  const has = (c: string) => codes.has(c);
  if (
    has("webauthn_credential_exists") ||
    has("InvalidStateError") ||
    has("ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED")
  )
    return "This device already has a passkey for your account.";
  if (cancelled(e, codes)) return null;
  if (has("too_many_passkeys")) return "You have the most passkeys allowed. Remove one first.";
  if (has("passkey_disabled")) return "Passkeys are not switched on yet.";
  return "Could not add the passkey. Try again.";
}

/** Plain words for a failed "Send code". Never Supabase's raw text. */
export function otpSendMessage(e: ErrorLike): string {
  const codes = errCodes(e);
  const status = typeof e?.status === "number" ? e.status : 0;
  if (codes.has("over_email_send_rate_limit") || codes.has("over_request_rate_limit") || status === 429)
    return "Too many codes asked for. Wait a minute, then try again.";
  if (codes.has("email_address_invalid") || codes.has("validation_failed"))
    return "That email address does not look right. Check it and try again.";
  if (codes.has("signup_disabled")) return "New accounts are not open right now. Email hello@forecourt.me.";
  return "Could not send a code. Check the email address and try again.";
}

/** Plain words for a code that did not sign in. Never Supabase's raw text. */
export function otpVerifyMessage(e: ErrorLike): string {
  const codes = errCodes(e);
  const status = typeof e?.status === "number" ? e.status : 0;
  if (codes.has("over_request_rate_limit") || status === 429) return "Too many tries. Wait a minute, then try again.";
  return "That code did not work. Check it or ask for a new one.";
}

/**
 * Error Google or Supabase put on the return URL (?error=...&error_description=...,
 * in the query or the hash). Returns plain words, or null when there is none.
 */
export function oauthReturnError(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const get = (k: string) => url.searchParams.get(k) ?? hash.get(k);
  const error = get("error");
  const code = get("error_code") ?? "";
  const desc = get("error_description") ?? "";
  if (!error && !code && !desc) return null;
  if (error === "access_denied")
    return "Google sign-in was cancelled. Use an email code, or try Google again.";
  if (/provider is not enabled|unsupported provider/i.test(desc))
    return "Google sign-in is not switched on yet. Use an email code for now.";
  if (
    code === "bad_oauth_state" ||
    code === "bad_oauth_callback" ||
    code === "flow_state_not_found" ||
    code === "flow_state_expired"
  )
    return "That sign-in link expired. Try Google again, or use an email code.";
  return "Google sign-in did not finish. Use an email code, or try Google again.";
}

/** The URL with any OAuth error params removed (query and hash). */
export function stripOauthError(href: string): string {
  const url = new URL(href);
  for (const k of ["error", "error_code", "error_description", "sb"]) url.searchParams.delete(k);
  if (/error/.test(url.hash)) url.hash = "";
  return url.pathname + url.search + url.hash;
}
