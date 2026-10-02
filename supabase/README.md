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
5. Settings → API → anon key is already in the app (public by design; RLS holds the line)
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
       - In section 3, delete EVERY @forecourt.me sign-in account you do not recognise, even if it has no team row. Otherwise whoever made it becomes staff the moment you invite that address.
       - Use `team-domain-hotfix.cleanup.sql` (a template, nothing runs until you edit it). It sets the person to revoked, deletes their `team_emails` row and deletes their sign-in account. Never delete a `team_members` row while its `team_emails` row is still there: re-running `staff.sql` would bring them back.
       - Run the check again and save the output.
    6. If any stranger had owner access, look at what they did: notes and build events they wrote, any refunds or Resume actions, and any payment links made while they were in.
    - Locked out of the office after step 3? Do not use the rollback. Run this one line instead: `update team_members set status = 'active' where email = 'hello@forecourt.me';`
    - `team-domain-hotfix.rollback.sql` is a last resort only. It puts the domain rule back and reopens the hole.

Running the tests needs Node 22.6 or later (`npm test` uses `node --test` with file globs and TypeScript type stripping).

Stripe webhook (optional, return-URL confirm still works): `https://www.forecourt.me/api/stripe/webhook`
Needs `STRIPE_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` on Vercel. Do not put the service-role key in `VITE_` vars.

Do not paste Aberdeen keys here.
