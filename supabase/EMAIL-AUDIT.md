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
| Site add, remove, restore | none | | | Gap: no app action exists. Sites are added in the desk (per desk database) and archived sites cannot be brought back from Office. Needs a desk to app hook. |
| Desk staff site access change | none | | | Gap: happens in each desk database, which cannot reach the app email engine. |
| Payment recovered after a failure | none | | | Gap: not in scope list, flag only. |
