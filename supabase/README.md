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

15. Security hotfix (staff never by email domain), once:
    - SQL editor: paste `team-domain-hotfix.check.sql`, run it, and keep the results. It is read only.
    - SQL editor: paste `team-domain-hotfix.sql` and run it. It is safe to run more than once and changes no rows.
    - Run `team-domain-hotfix.check.sql` again. Section 4 should show no `like '%@forecourt.me'`.
    - Revoke anyone in the results you do not know, especially rows with `auto_owner_suspect` = true (the app used to make any @forecourt.me sign-in an owner). Use the two lines at the top of the check file. Revoke rather than delete: re-running `staff.sql` copies `team_emails` back into `team_members`.
    - Authentication: turn Confirm email on.
    - Undo: `team-domain-hotfix.rollback.sql`. It puts the domain rule back, so only use it if real staff are locked out.

Stripe webhook (optional, return-URL confirm still works): `https://www.forecourt.me/api/stripe/webhook`
Needs `STRIPE_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` on Vercel. Do not put the service-role key in `VITE_` vars.

Do not paste Aberdeen keys here.
