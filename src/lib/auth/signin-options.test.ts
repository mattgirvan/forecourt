import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  flagOn,
  googleShown,
  oauthReturnError,
  oauthReturnPath,
  otpSendMessage,
  otpVerifyMessage,
  parseAuthSettings,
  passkeyAddMessage,
  passkeyHostAllowed,
  passkeySignInMessage,
  passkeyState,
  signInSlots,
  stripOauthError,
  webauthnSupported,
} from "./signin-options.ts";

const on = { passkeys: true, google: true, email: true };
const off = { passkeys: false, google: false, email: true };

describe("passkey host gate (RP ID forecourt.me)", () => {
  it("allows only the two forecourt.me origins", () => {
    assert.equal(passkeyHostAllowed("www.forecourt.me"), true);
    assert.equal(passkeyHostAllowed("forecourt.me"), true);
    assert.equal(passkeyHostAllowed("WWW.Forecourt.me."), true);
  });
  it("hides passkeys on Vercel previews, localhost and look-alikes", () => {
    for (const h of [
      "forecourt-git-feat-signin-skoda-aberdeen.vercel.app",
      "forecourt.vercel.app",
      "localhost",
      "127.0.0.1",
      "forecourt.me.evil.com",
      "evilforecourt.me",
      "app.forecourt.me",
      "",
      null,
    ]) {
      assert.equal(passkeyHostAllowed(h), false, String(h));
    }
  });
});

describe("webauthnSupported", () => {
  const creds = { create: () => {}, get: () => {} };
  it("needs PublicKeyCredential and navigator.credentials create/get", () => {
    assert.equal(webauthnSupported({ PublicKeyCredential: function () {}, navigator: { credentials: creds } }), true);
    assert.equal(webauthnSupported({ navigator: { credentials: creds } }), false);
    assert.equal(webauthnSupported({ PublicKeyCredential: function () {}, navigator: {} }), false);
    assert.equal(webauthnSupported(null), false);
  });
  it("is off outside a secure context", () => {
    assert.equal(
      webauthnSupported({ PublicKeyCredential: function () {}, navigator: { credentials: creds }, isSecureContext: false }),
      false,
    );
  });
});

describe("parseAuthSettings", () => {
  it("reads passkeys_enabled and external.google from /auth/v1/settings", () => {
    assert.deepEqual(
      parseAuthSettings({ passkeys_enabled: true, external: { google: true, email: true } }),
      { passkeys: true, google: true, email: true },
    );
  });
  it("treats missing or odd values as off", () => {
    assert.deepEqual(parseAuthSettings(null), { passkeys: false, google: false, email: false });
    assert.deepEqual(parseAuthSettings({ passkeys_enabled: "true", external: "x" }), {
      passkeys: false,
      google: false,
      email: false,
    });
  });
});

describe("passkeyState", () => {
  const www = "www.forecourt.me";
  it("is ready only on forecourt.me, with WebAuthn, and the project switched on", () => {
    assert.equal(passkeyState({ flag: "1", hostname: www, webauthn: true, settings: on }), "ready");
  });
  it("says off_domain on a preview before anything else", () => {
    assert.equal(passkeyState({ flag: "1", hostname: "x.vercel.app", webauthn: true, settings: on }), "off_domain");
  });
  it("hides for a browser without WebAuthn", () => {
    assert.equal(passkeyState({ flag: "1", hostname: www, webauthn: false, settings: on }), "unsupported");
  });
  it("waits for settings, then hides when the project has passkeys off", () => {
    assert.equal(passkeyState({ flag: "1", hostname: www, webauthn: true, settings: null }), "checking");
    assert.equal(passkeyState({ flag: "1", hostname: www, webauthn: true, settings: off }), "server_off");
  });
});

describe("passkeys build flag (VITE_PASSKEYS)", () => {
  const www = "www.forecourt.me";
  it("is off unless VITE_PASSKEYS is on, even on forecourt.me with the project switched on", () => {
    for (const flag of [undefined, "", "0", "false"]) {
      assert.equal(passkeyState({ flag, hostname: www, webauthn: true, settings: on }), "flag_off", String(flag));
    }
    assert.equal(passkeyState({ flag: "1", hostname: www, webauthn: true, settings: on }), "ready");
  });
  it("flag off wins over everything, so previews show no passkey line either", () => {
    assert.equal(passkeyState({ flag: undefined, hostname: "x.vercel.app", webauthn: true, settings: on }), "flag_off");
  });
});

describe("signInSlots: keep the space while we find out", () => {
  const base = { passkeysFlag: "1", googleFlag: "1", hostname: "www.forecourt.me", webauthn: true, settings: on, settingsLoaded: true };
  it("shows both once settings say yes", () => {
    assert.deepEqual(signInSlots(base), { passkey: "show", google: "show" });
  });
  it("reserves both before mount and while settings load", () => {
    assert.deepEqual(signInSlots({ ...base, hostname: null, webauthn: null, settings: null, settingsLoaded: false }), {
      passkey: "reserve",
      google: "reserve",
    });
    assert.deepEqual(signInSlots({ ...base, settings: null, settingsLoaded: false }), { passkey: "reserve", google: "reserve" });
  });
  it("hides at once what can never work here, without waiting", () => {
    assert.deepEqual(signInSlots({ ...base, hostname: "x.vercel.app", settingsLoaded: false, settings: null }), {
      passkey: "hide",
      google: "reserve",
    });
    assert.deepEqual(signInSlots({ ...base, webauthn: false }).passkey, "hide");
  });
  it("flags off: nothing is shown or reserved", () => {
    assert.deepEqual(signInSlots({ ...base, passkeysFlag: undefined, googleFlag: undefined, settingsLoaded: false }), {
      passkey: "hide",
      google: "hide",
    });
  });
  it("settings failed or provider off: hide", () => {
    assert.deepEqual(signInSlots({ ...base, settings: null }), { passkey: "hide", google: "hide" });
    assert.deepEqual(signInSlots({ ...base, settings: off }), { passkey: "hide", google: "hide" });
  });
});

describe("Google button gate", () => {
  it("needs the public flag AND the provider switched on", () => {
    assert.equal(googleShown({ flag: "1", settings: on }), true);
    assert.equal(googleShown({ flag: "true", settings: on }), true);
    assert.equal(googleShown({ flag: "1", settings: off }), false);
    assert.equal(googleShown({ flag: "1", settings: null }), false);
    assert.equal(googleShown({ flag: undefined, settings: on }), false);
    assert.equal(googleShown({ flag: "0", settings: on }), false);
  });
  it("flagOn accepts the usual spellings only", () => {
    for (const v of ["1", "true", "TRUE", " yes ", "on"]) assert.equal(flagOn(v), true, v);
    for (const v of ["0", "false", "", "no", undefined, 1, true]) assert.equal(flagOn(v), false, String(v));
  });
  it("returns people to /login on the same origin", () => {
    assert.equal(oauthReturnPath("https://www.forecourt.me"), "https://www.forecourt.me/login");
    assert.equal(oauthReturnPath("https://www.forecourt.me/"), "https://www.forecourt.me/login");
  });
});

describe("OAuth return errors", () => {
  it("is null on a normal return", () => {
    assert.equal(oauthReturnError("https://www.forecourt.me/login?code=abc"), null);
    assert.equal(oauthReturnError("not a url"), null);
  });
  it("explains a cancel, a provider that is off and an expired flow", () => {
    assert.match(
      oauthReturnError("https://www.forecourt.me/login?error=access_denied&error_description=denied")!,
      /cancelled/,
    );
    assert.match(
      oauthReturnError(
        "https://www.forecourt.me/login?error=validation_failed&error_description=Unsupported+provider%3A+provider+is+not+enabled",
      )!,
      /not switched on/,
    );
    assert.match(
      oauthReturnError("https://www.forecourt.me/login#error=invalid_request&error_code=bad_oauth_state&error_description=x")!,
      /expired/,
    );
  });
  it("strips the error params but keeps the rest", () => {
    assert.equal(
      stripOauthError("https://www.forecourt.me/login?error=access_denied&error_description=x&keep=1"),
      "/login?keep=1",
    );
    assert.equal(stripOauthError("https://www.forecourt.me/login#error=x&error_code=y"), "/login");
  });
});

describe("passkey messages", () => {
  const passthrough = (name: string) => ({
    name: "WebAuthnError",
    code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
    message: "x",
    cause: { name },
  });
  it("stays quiet when the visitor cancels the device prompt", () => {
    assert.equal(passkeySignInMessage(passthrough("NotAllowedError")), null);
    assert.equal(passkeySignInMessage({ code: "ERROR_CEREMONY_ABORTED", message: "aborted" }), null);
    assert.equal(passkeyAddMessage(passthrough("NotAllowedError")), null);
  });
  it("points an unknown passkey at the email code", () => {
    assert.match(passkeySignInMessage({ code: "webauthn_credential_not_found", message: "x" })!, /email code/);
  });
  it("explains a passkey that is already on this device", () => {
    assert.match(passkeyAddMessage({ code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED", message: "x" })!, /already/);
    assert.match(passkeyAddMessage({ code: "webauthn_credential_exists", message: "x" })!, /already/);
  });
  it("has a plain fallback", () => {
    assert.match(passkeySignInMessage({ message: "boom" })!, /email code/);
    assert.match(passkeyAddMessage({ code: "too_many_passkeys", message: "x" })!, /Remove one/);
  });
  it("never uses em or en dashes or the banned word", () => {
    const all = [
      passkeySignInMessage({ code: "webauthn_credential_not_found" }),
      passkeySignInMessage({ code: "passkey_disabled" }),
      passkeySignInMessage({ code: "webauthn_challenge_expired" }),
      passkeySignInMessage({ code: "user_banned" }),
      passkeySignInMessage({ code: "email_not_confirmed" }),
      passkeySignInMessage({}),
      passkeyAddMessage({ code: "webauthn_credential_exists" }),
      passkeyAddMessage({ code: "too_many_passkeys" }),
      passkeyAddMessage({ code: "passkey_disabled" }),
      passkeyAddMessage({}),
      oauthReturnError("https://x.me/?error=access_denied"),
      oauthReturnError("https://x.me/?error=x&error_description=provider+is+not+enabled"),
      oauthReturnError("https://x.me/?error=x&error_code=bad_oauth_state"),
      oauthReturnError("https://x.me/?error=x"),
    ].join(" ");
    assert.doesNotMatch(all, /[\u2013\u2014]|gl[a]ss/i);
  });
});

describe("email code errors are plain words, never Supabase's raw text", () => {
  it("a wrong or expired code", () => {
    for (const e of [{ code: "otp_expired", message: "Token has expired or is invalid" }, { message: "Invalid login credentials" }, null]) {
      assert.equal(otpVerifyMessage(e), "That code did not work. Check it or ask for a new one.");
    }
    assert.equal(otpVerifyMessage({ status: 429, message: "x" }), "Too many tries. Wait a minute, then try again.");
  });
  it("sending a code", () => {
    assert.equal(otpSendMessage({ code: "over_email_send_rate_limit", message: "email rate limit exceeded" }), "Too many codes asked for. Wait a minute, then try again.");
    assert.equal(otpSendMessage({ code: "email_address_invalid" }), "That email address does not look right. Check it and try again.");
    assert.equal(otpSendMessage({ message: "Database error saving new user" }), "Could not send a code. Check the email address and try again.");
  });
  it("login never shows error.message", () => {
    const login = readFileSync("src/routes/login.tsx", "utf8");
    assert.doesNotMatch(login, /setNotice\((error|err|e)\.message\)/);
  });
  it("no dashes or banned word in the new copy", () => {
    for (const m of [otpVerifyMessage(null), otpSendMessage(null), otpSendMessage({ status: 429 }), otpSendMessage({ code: "signup_disabled" })]) {
      assert.doesNotMatch(m, /[\u2013\u2014]|glass/i);
    }
  });
});
