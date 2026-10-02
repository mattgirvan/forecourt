# Forecourt control plane

Project: `https://hxodmtmrnpxzkfwhrsjg.supabase.co`

This is the **office** — sign-in, tenants, orders. Not Aberdeen. Not a customer desk.

## Once

1. SQL editor → paste `control-plane.sql` → run
2. SQL editor → paste `billing.sql` → run (site / franchise / group + Stripe columns)
3. Authentication → URL configuration
   - Site URL: `https://www.forecourt.me`
   - Redirects: `https://www.forecourt.me/**` and `https://forecourt.me/**`
4. Authentication → Providers → Email on (magic link)
   - Authentication → Emails: set **Magic link** to `magic-link.html` and **Confirm signup** to `confirm-signup.html`. Both show the code and a sign-in link. With Confirm email on, a brand-new person (for example a new staff invite) gets the Confirm signup email, so it needs the same code and link (its link uses `type=signup`; the app handles both).
   - Keep **Phone** sign-in off. An SMS code would look like an email code to the staff invite check (accounts with a phone number cannot accept a staff invite anyway).
5. Settings → API → anon key is already in the app (public by design; RLS holds the line)
6. SQL editor → paste `team-owner-only.sql` → run (who is staff and who is owner; portal.sql and staff.sql need it first)
7. SQL editor → paste `portal.sql` → run (dealer notes, support messages, team office)
8. SQL editor → paste `staff.sql` → run (staff roles, invite, revoke)
9. SQL editor → paste `build.sql` → run (order timeline, pack, meetings)
10. SQL editor → paste `enquiries.sql` → run (contact form storage)
11. Optional: SQL editor → paste `app-settings.sql` → run (GH_TEMPLATE_TOKEN fallback if Vercel env never reaches serverless)
12. Redeploy Forecourt on Vercel (the next git push does this)
13. Before taking live payments: set `SUPABASE_SERVICE_ROLE_KEY` on Vercel Production and redeploy, then SQL editor → paste `entitlement-guard.sql` → run (customers can no longer change status, plan once paid, Stripe ids, trial or billing fields). Check with `entitlement-guard.verify.sql` (rolls back, changes nothing). Undo: the drop lines at the end of `entitlement-guard.sql`.

14. Before turning on journey emails: SQL editor → paste `email-log.sql` → run. Then set `EMAIL_MODE` on Vercel Production (`team` first, then `live`). Unset or `off` sends nothing.

15. Security hotfix (#41: staff are never let in just for having an @forecourt.me address). Do these steps in this exact order:
    1. Supabase, Authentication, Sign In / Providers, Email: turn **Confirm email** ON and **Secure email change** ON. Check that **Google** is off. Until Confirm email is on, every new sign-up counts as confirmed, so the checks below prove nothing.
    2. SQL editor: paste `team-domain-hotfix.check.sql`, run it, and save the output (it changes nothing). In section 1 or 3, check that hello@forecourt.me has a date under `email_confirmed_at`. If it does not, stop here and ask.
    3. SQL editor: paste `team-domain-hotfix.sql` and run it. Then run the check again and save the output. Section 4 should no longer contain `like '%@forecourt.me'`.
    4. Merge #41 and wait until the Production deploy on Vercel shows Ready. Sign in as hello@forecourt.me and check that /office loads.
    5. Clean up, only now that #41 is live (the old code lets a removed person straight back in):
       - In section 1 of the check, remove EVERY person you do not personally recognise, not only rows marked `auto_owner_suspect` or `invited_by_unknown`. Those marks are only hints: a stranger with owner access could have invited others or added rows directly.
       - In section 3, deal with EVERY @forecourt.me sign-in account you do not recognise, even if it has no team row. Otherwise whoever made it becomes staff the moment you invite that address.
       - Use `team-domain-hotfix.cleanup.sql`, one person at a time:
         - Type the person's address once, on the line near the top of the file. Everything else in the file works from that address, so it cannot mix up two people. If no sign-in account has that address, or more than one does, or it is hello@forecourt.me, the run stops with an error and changes nothing. (Someone with a team row but no sign-in account: revoke them in the office Staff list instead.)
         - Part 1 runs every time (read only). Save the output. It lists everything tied to that account: their dealer sites (tenants), orders, setup steps, and the notes, messages and build events on those sites. If you see a real dealer's site in it, stop and tell Forge.
         - Part 2 is the normal step: remove its dashes and run the file again. It sets the person to revoked, deletes their `team_emails` row and bans their sign-in account. You can ban in Supabase instead of with the SQL line: Authentication, Users, the user's menu, Ban user. Banning keeps their data, so nothing a dealer relies on is lost. After a ban the app refuses them at once; a token already issued keeps working directly against the database until it expires (1 hour by default).
         - Part 3 is optional: delete the sign-in account, but only if Part 1 showed 0 in every row. Deleting an account also deletes every dealer site, order and setup step that points at it, with their notes, messages and build events. If in doubt, leave it banned.
         - Never delete a `team_members` row while its `team_emails` row is still there: re-running `staff.sql` would bring them back.
       - Run the check again and save the output.
    6. If any stranger had owner access, look at what they did: notes and build events they wrote, any refunds or Resume actions, and any payment links made while they were in.
    - Locked out of the office after step 3? Do not use the rollback. Run this one line instead: `update team_members set status = 'active' where email = 'hello@forecourt.me';`
    - `team-domain-hotfix.rollback.sql` is a last resort only. It puts the domain rule back and reopens the hole.
    - After #42 is merged, only ever re-run the copy of `team-domain-hotfix.sql` on main. The original #41 copy would let unaccepted invites count as staff again.

16. Team safety follow-up (only owners can change the team). Do this after step 15 is finished and #41 is live:
    1. SQL editor: paste `team-owner-only.check.sql`, run it, and save the output (it changes nothing).
    2. SQL editor: paste `team-owner-only.sql` and run it. Run the check again and save the output. Section 3 should list four functions, section 4 should show one row, section 6 should show no rows, and section 7 should show `placeholder (always yes)` and `calls the guard, checks the session` twice.
    3. Merge the follow-up PR and wait until the Production deploy on Vercel shows Ready. Sign in as hello@forecourt.me and check that /office loads and the staff list shows.
    - Why this order: either order is safe (nobody gets extra access in between), but until both are done, people you invite cannot get in yet.
    - Before you start: in Supabase, Authentication, Emails, check the **Confirm signup** template is `confirm-signup.html` (see step 4), and that **Phone** sign-in is off.
    - Accepting an invite needs `SUPABASE_SERVICE_ROLE_KEY` on Vercel Production (the same key as step 13). Without it, invites stay pending and nobody new can get in.
    - What changes for you:
      - Only owners can add, remove or change staff. Operators cannot, and neither can someone who has been invited but not signed in yet.
      - Before inviting, check the address has no account you don't recognise: in Supabase, Authentication, Users, search for the address. If an account is there that you or the new person did not make, do not invite yet: ask Forge.
      - Someone you invite gets no access until they sign in with the code from the invite email. A password, Google, a passkey, or a code from before the invite does not count. If they are already signed in some other way, the office tells them to sign out and get an email code.
      - When they accept, the app gives their account a new random password and signs out every other session on it, so nobody else who knew an old password can get in. They keep signing in with email codes.
      - Signing out ends database access at once: staff access needs the sign-in session to still exist, so a signed-out token stops working straight away instead of an hour later.
      - An invite cannot be accepted while the account has another way to sign in: Google or a phone number linked to it, a passkey, or an authenticator app. The office tells the person to tell you. Do not remove these yourself: ask Forge first, because it can mean someone else set the account up.
      - If accepting goes wrong part way, the invite is put back and the office says "Couldn't finish accepting, try again or tell Matt." If the Vercel logs ever show `SECURITY: team row ... is ACTIVE`, revoke that person in the office Staff list straight away and tell Forge.
      - A staff email address cannot be changed. To move someone to a new address, revoke the old one and invite the new one.
      - Restoring a revoked person sends them a fresh invite. They get access again once they sign in from that email.
      - hello@forecourt.me can only be changed here in the SQL editor, never from the office. Locked out? The same one line as in step 15 still works.
    - Only ever re-run the copies of `team-owner-only.sql` and `team-domain-hotfix.sql` on main. Section 7 of the check shows whether the sign-in guard is still on.
    - `team-owner-only.rollback.sql` is a last resort only. It lets any staff member change the team again. It keeps the sign-in guard and drops the session check.

Running the tests needs Node 22.6 or later (`npm test` uses `node --test` with file globs and TypeScript type stripping).

Stripe webhook (optional, return-URL confirm still works): `https://www.forecourt.me/api/stripe/webhook`
Needs `STRIPE_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` on Vercel. Do not put the service-role key in `VITE_` vars.

Do not paste Aberdeen keys here.
