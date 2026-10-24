# 04 Billing wiring (group build PR 4)

Nothing here has been run. No SQL on any live database, no Stripe calls, no env changes.

## What happens
- Go live (Office Sites, per site): the site becomes live, then the subscription is put in step.
  - Group: £249 per live site, never below 2 sites.
  - Franchise: extra sites past the included ones are billed under the Franchise product.
  - Part month goes on the next bill (create_prorations, no immediate invoice). Trialing subscriptions never prorate.
- Archive: the site stops counting from the next period. The current month is not refunded
  (a site live at the start of the period stays paid for that period). Group stays at 2 minimum.
- First bill: when an account goes live (both go live paths call startMonthlyForTenant), the
  site count is trued up while the subscription is still trialing, so the first Group bill is max(2, live).
- Accounts with no tenant_sites rows are untouched by all of the above.

## Safety gate
Stripe is only changed when the env var `SITE_BILLING_SYNC` is exactly `on`. It is not set,
so everything is a dry run: site state changes, Stripe is read, and the would-be update is
written to the internal timeline as "Dry run, Stripe not changed. Would have: ...".

## Known edge: double charge (accepted)
If a site is archived and another goes live in the same period, the archived one is still
paid for this period and the new one prorates on top, so that month bills one extra part
month. Same if a site is archived and brought back live in one period. Accepted by Matt, 24 Oct 2026.

## Run order (only after Matt says yes)
1. 03-site-billing.sql (tables) on the app database.
2. 04-tenant-sites.backup.sql, keep the counts it prints.
3. 04-tenant-sites.backfill.sql.
4. Per desk: `DESK_DB_URL=... 04-desk-backfill.sh --desk <slug> --yes` (backup, 0005, 0006, backfill).
5. Check Office Sites in dry run, then decide whether to set SITE_BILLING_SYNC=on.

Billed through (no double part month)
- supabase/site-billed-through.sql adds tenant_sites.billed_through (not run yet). When a go live is really prorated (SITE_BILLING_SYNC=on), the app stores the subscription period end there.
- A site with billed_through after the current period start counts as a paid slot, so a site that went live this period, was archived and is restored in the same period is not prorated again. After the period rolls over the record no longer counts.
- Without the column the app reads sites as before (old count), so order does not matter, but run it before turning sync on.
