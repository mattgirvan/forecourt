import { useEffect, useState } from "react";
import { SUPABASE_ANON, SUPABASE_URL, supabaseReady } from "@/lib/sb";
import {
  flagOn,
  googleShown,
  parseAuthSettings,
  passkeyState,
  signInSlots,
  webauthnSupported,
  type AuthSettings,
  type PasskeyState,
  type Slot,
  type WebAuthnWindow,
} from "./signin-options";

let cached: Promise<AuthSettings | null> | null = null;

/**
 * Public project auth settings (GET /auth/v1/settings, anon key). Cached per
 * page load. Any failure resolves to null, which hides passkeys and Google.
 */
export function loadAuthSettings(): Promise<AuthSettings | null> {
  if (!supabaseReady() || typeof window === "undefined") return Promise.resolve(null);
  if (!cached) {
    cached = fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON, accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j ? parseAuthSettings(j) : null))
      .catch(() => null);
  }
  return cached;
}

export type SignInOptions = {
  passkey: PasskeyState;
  google: boolean;
  /** Per button: show it, keep its space while we find out, or hide it. */
  slots: { passkey: Slot; google: Slot };
};

/** What extra sign-in buttons to show on this page, in this browser. */
export function useSignInOptions(): SignInOptions {
  const [settings, setSettings] = useState<AuthSettings | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [env, setEnv] = useState<{ hostname: string; webauthn: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    setEnv({
      hostname: window.location.hostname,
      webauthn: webauthnSupported(window as unknown as WebAuthnWindow),
    });
    void loadAuthSettings().then((s) => {
      if (!live) return;
      setSettings(s);
      setSettingsLoaded(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const passkeysFlag = import.meta.env.VITE_PASSKEYS;
  const googleFlag = import.meta.env.VITE_GOOGLE_SIGNIN;
  const slots = signInSlots({
    passkeysFlag,
    googleFlag,
    hostname: env?.hostname ?? null,
    webauthn: env?.webauthn ?? null,
    settings,
    settingsLoaded,
  });
  // Before mount (SSR and first paint) nothing extra is shown, only reserved.
  if (!env)
    return { passkey: flagOn(passkeysFlag) ? "checking" : "flag_off", google: false, slots };
  return {
    passkey: passkeyState({
      flag: passkeysFlag,
      hostname: env.hostname,
      webauthn: env.webauthn,
      settings,
    }),
    google: googleShown({ flag: googleFlag, settings }),
    slots,
  };
}
