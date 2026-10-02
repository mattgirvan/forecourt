/**
 * Is this account's email really proven? Decided from the user's IDENTITIES,
 * never from how the current session started.
 *
 * Why: "Confirm email" is ON for this project now, but it was off for a long
 * time (`mailer_autoconfirm: true`), and it could be switched off again. In
 * that mode Supabase Auth links a Google sign-in to an existing account with
 * the same email even when Google says the email is not verified
 * (supabase/auth, models/linking.go: `email.Verified || Mailer.Autoconfirm`),
 * so accounts from that time may already carry such a link. Once linked, the
 * person holding that Google login can add a password or a passkey and start
 * sessions that do not look like Google at all. So the check has to look at
 * what is attached to the account, not at the session.
 *
 * A user counts as verified when BOTH hold:
 *  1. Nothing attached is unproven: every identity that is not the email
 *     identity (Google, or any provider added later) says, from the provider,
 *     `email_verified: true`. One unverified Google identity spoils the
 *     account until it is removed, because it may belong to someone else.
 *  2. There is a proof: an email identity for the account email with the
 *     email confirmed, or a Google identity that verified the same email.
 *
 * Email code users: with Confirm email on, their email is confirmed when the
 * first code is used. Older accounts, made while it was off, had
 * `email_confirmed_at` set at signup instead. Either is accepted here (`email_confirmed_at` on the user,
 * or `email_verified` on the identity), so nobody who signs in with a code
 * today is locked out. The same rule runs in the database:
 * supabase/signin-verified-guard.sql, `public.auth_email_verified()`.
 *
 * Pure, no Supabase import, so it is unit tested directly. The only caller on
 * the server is `verifiedUser()` in src/lib/server/staff-actor.ts.
 */

export type IdentityLike = {
  provider?: string | null;
  identity_data?: Record<string, unknown> | null;
};

export type UserLike = {
  email?: string | null;
  email_confirmed_at?: string | null;
  identities?: IdentityLike[] | null;
};

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

const sameEmail = (a: unknown, b: unknown) => norm(a) !== "" && norm(a) === norm(b);

/** `email_verified` as the provider sent it: JSON true, or the string "true". */
function providerVerified(identity: IdentityLike): boolean {
  const v = identity.identity_data?.email_verified;
  return v === true || norm(v) === "true";
}

/** True when the account email is proven by its identities (see above). */
export function emailVerified(user: UserLike | null | undefined): boolean {
  if (!user) return false;
  const email = norm(user.email);
  if (!email) return false;
  const ids = user.identities ?? [];

  if (ids.some((i) => norm(i.provider) !== "email" && !providerVerified(i))) return false;

  return ids.some((i) => {
    const provider = norm(i.provider);
    const idEmail = i.identity_data?.email;
    if (provider === "email") {
      return sameEmail(idEmail, email) && (Boolean(user.email_confirmed_at) || providerVerified(i));
    }
    if (provider === "google") return providerVerified(i) && sameEmail(idEmail, email);
    return false;
  });
}

export const UNVERIFIED_EMAIL_MESSAGE =
  "We could not confirm the email on this account, so we signed you out. Email hello@forecourt.me and we will sort it.";

/** Throws the plain message when the account email is not proven. */
export function assertEmailVerified(user: UserLike | null | undefined): void {
  if (!emailVerified(user)) throw new Error(UNVERIFIED_EMAIL_MESSAGE);
}
