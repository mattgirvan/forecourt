# Desk events to Forecourt (group build, PR 7)

What it does
- Every desk header has a "Forecourt" link to https://forecourt.me/account.
- Desk migration 0007 queues an event when a site is added, archived (removed) or restored, and when a staff member's site access changes (one event per person per save). At commit it signs the event (HMAC SHA256 over "timestamp.body", per desk secret) and posts it with pg_net to /api/desk/events.
- /api/desk/events looks up the desk by X-Forecourt-Desk in desk_links, checks the signature and a 5 minute window, then emails the account admin and hello@ through sendAccountEventEmail (email_log dedupe key per desk event, so resends never email twice) and adds a build_events note.
- Site added email carries the price preview from the account's plan and tenant_sites: what the site adds a month from its go live day and the new monthly total (Group £249, Franchise included up to 5 then £100).
- Restore within 30 days: desk admins get an Archived sites list in Admin (grey pill "Archived, restore within {n} days" and the hint "You can restore an archived site within 30 days.") and admin_restore_site(code). It refuses after 30 days, refuses staff who are not desk admins or cannot see the site, and puts the site back to the state it had before archiving. The event carries that state (site.status).

Billing follows the desk (Matt's decision, #55)
- Customers archive and restore sites themselves in the desk. There is no Office step.
- Archive in the desk runs the same changeSiteState path as an Office archive (notify off, the desk email is the one sent): the bill drops by one site from the next period, no part month refunds, Group 2 site minimum and Franchise 5 included sites apply. The email says which.
- Restore in the desk within 30 days puts it back on the bill. Restored before the period it was archived in ends: live_at is kept, the paid slot is reused, nothing changes on the bill ("Its archive is cancelled and it stays on your bill as before."). Restored after the period rolled over: live_at is today, so it is prorated like a go live ("It goes back on your bill from today ..."). Office still has no restore action.
- Site added in the desk is recorded in tenant_sites as setting_up (an existing row is left alone). It is not billed until it goes live through Office or go live.
- All Stripe changes stay behind SITE_BILLING_SYNC. While it is off (now) this is a dry run: tenant_sites changes, Stripe does not, and the build_events note says "Dry run". The customer email still describes what the bill will do once sync is on.
- The hello@ copy is information only. No email says the team will act.

What it does not do
- Going live is not a desk event. Office Sites or the go live path still does that.
- Office has no restore action. Restore lives in the desk only.
- No env changes: the secret lives in desk_links (app, service role only) and forecourt_link (desk, no grants).
- pg_net must be enabled on each desk project (Supabase: Database, Extensions). Without it events stay queued with last_error "pg_net not installed"; nothing fails.

Order (nothing run yet)
1. App: 07-desk-links.sql.
2. Deploy the app (endpoint live).
3. Each desk: 07-desk-0007_forecourt_events.sql, then the desk template code (link and restore UI) via the forecourt-desk follow up. That repo is not pushed from here.
4. Each desk: 07-desk-link-setup.sql steps 1 and 2.

Known edge
- A site that went live in the current period, is archived and then restored in the same period may be prorated a second time, because paid slots only count sites live before the period start. Rare; worth a look before SITE_BILLING_SYNC goes on.

Unverified here
- pg_net on a real desk: tests stub net.http_post. The signature is over body::text, which is what pg_net sends; worth one test event on the first desk.
