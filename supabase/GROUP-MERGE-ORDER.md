# Group build merge order and SQL per PR

Merge in this order. Each PR's base is the one before it. Nothing has been run.

| Order | PR | Branch | SQL / scripts to run with it |
|---|---|---|---|
| 1 | #49 | hold/group-01-sites | 01-sites-access.sql (desk), then 01-sites-access.backfill.sql (desk) |
| 2 | #50 | hold/group-02-desk-ui | 02-sites-admin.sql (desk 0006) |
| 3 | #51 | hold/group-03-billing | 03-site-billing.sql (app) |
| 4 | #52 | hold/group-04-billing-wiring | 04-tenant-sites.backup.sql, then 04-tenant-sites.backfill.sql (app), 04-desk-backfill.sh (reads each desk). SITE_BILLING_SYNC stays off. |
| 5 | #53 | hold/group-05-plan-change | 05-plan-changes.sql (app). PLAN_CHANGE_SYNC stays off. |
| 6 | #54 | hold/group-06-email-audit | none |
| 7 | #55 | hold/group-07-desk-events | 07-desk-links.sql (app), deploy, then per desk 07-desk-0007_forecourt_events.sql and 07-desk-link-setup.sql. Needs pg_net on each desk. |

The forecourt-desk repo follow up (FORECOURT-DESK-FOLLOWUP.md) carries the desk template code, 0006 and 0007 into live desks. Not pushed from here.
