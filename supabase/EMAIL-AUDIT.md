# Email audit (group build PR 6)

Rule: every account event emails the account admin (the login email, falling back to tenants.email)
AND hello@forecourt.me, through the journey email engine (EMAIL_MODE gates, team redirect,
production only for live sends) with its own email_log dedupe key per copy.
No SQL needed: email_log already exists (supabase/email-log.sql).

| Event | Email | Admin | hello@ | Status |
|---|---|---|---|---|
| Site go live (Office Sites) | "<site> is live" + billing line | yes | yes | Added (PR 6) |
| Site archived (Office Sites) | "<site> archived" + billing line | yes | yes | Added (PR 6) |
| Account type changed, downgrade or no-payment change | "Account type changed to X" | yes | yes | Added (PR 6) |
| Account type changed, upgrade after setup paid | "Account type changed to X" | yes | yes | Added (PR 6) |
| Monthly billing started at go live | "Monthly billing has started" | yes | yes | Added (PR 6) |
| Monthly restarted (Resume order) | existing monthly restart email | yes (existed) | yes | hello@ copy added |
| Monthly payment failed | existing payment failed email | yes (existed) | yes | hello@ copy added |
| Manager invited to the account | "New access to your account" (invitee still gets the invite) | yes | yes | Added (PR 6) |
| Manager removed from the account | "Access removed from your account" | yes | yes | Added (PR 6) |
| Paid order, thank you | existing thank you | yes | team alert only on flags | Existed, unchanged |
| Duplicate or look-alike payment | existing staff alert | no (staff only) | team list | Existed, unchanged |
| Site added | admin + hello@ (builder `siteAddedEvent`, with price preview) | | `site-added:{key}` | Builder only in this PR. Sites are added in the desk, so the trigger is the desk event hook in #55. |
| Site removed (archived) | admin + hello@ | | `site-archived:{key}` | Sent from Office Archive. Says the bill goes down from the period end date, no part month refunds, restore within 30 days. |
| Site restored | none | | | Gap in this PR: restore does not exist anywhere yet. The desk 0006 has no restore and Office refuses archived to any other state. The 30 day restore promised in the copy is built in the desk in #55, with its email. Office has no restore action. |
| Desk staff site access change | none | | | Gap: happens in each desk database, which cannot reach the app email engine. |
| Payment recovered after a failure | none | | | Gap: not in scope list, flag only. |
