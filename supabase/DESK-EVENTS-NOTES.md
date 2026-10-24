# Desk events to Forecourt (group build, PR 7)

What it does
- Every desk header has a "Forecourt" link to https://forecourt.me/account.
- Desk migration 0007 queues an event when a site is added, archived (removed) or restored, and when a staff member's site access changes (one event per person per save). At commit it signs the event (HMAC SHA256 over "timestamp.body", per desk secret) and posts it with pg_net to /api/desk/events.
- /api/desk/events looks up the desk by X-Forecourt-Desk in desk_links, checks the signature and a 5 minute window, then emails the account admin and hello@ through sendAccountEventEmail (email_log dedupe key per desk event, so resends never email twice) and adds a build_events note.
- Site added email carries the price preview from the account's plan and tenant_sites: what the site adds a month from its go live day and the new monthly total (Group £249, Franchise included up to 5 then £100).
- Restore within 30 days: desk admins get an Archived sites list in Admin and admin_restore_site(code). It refuses after 30 days, refuses staff who are not desk admins or cannot see the site, and puts the site back to the state it had before archiving.

What it does not do
- Billing is not changed by desk events. Office Sites stays the one place a site goes live or comes off the bill. The removed email says "We will take it off your bill from the end of this billing period"; the hello@ copy and the build_events note are the team's prompt to archive it in Office.
- Office has no restore action. Restore lives in the desk only.
- No env changes: the secret lives in desk_links (app, service role only) and forecourt_link (desk, no grants).
- pg_net must be enabled on each desk project (Supabase: Database, Extensions). Without it events stay queued with last_error "pg_net not installed"; nothing fails.

Order (nothing run yet)
1. App: 07-desk-links.sql.
2. Deploy the app (endpoint live).
3. Each desk: 07-desk-0007_forecourt_events.sql, then the desk template code (link and restore UI) via the forecourt-desk follow up. That repo is not pushed from here.
4. Each desk: 07-desk-link-setup.sql steps 1 and 2.

Unverified here
- pg_net on a real desk: tests stub net.http_post. The signature is over body::text, which is what pg_net sends; worth one test event on the first desk.
