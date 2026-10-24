-- Group build PR 4 follow up: remember what each site has already been charged this period.
-- Set by the app when a go live is prorated in live mode (SITE_BILLING_SYNC=on).
-- A site whose billed_through is after the current period start counts as a paid slot, so a site
-- that went live, was archived and is restored in the same period is never prorated twice.
-- Safe to run more than once. Not run yet. The app works without it (falls back to the old count).
alter table public.tenant_sites add column if not exists billed_through timestamptz;
