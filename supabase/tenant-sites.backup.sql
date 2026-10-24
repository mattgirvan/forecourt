-- 04 BACKUP for the tenant_sites backfill (group build PR 4). Files only, not run.
-- Run against the Forecourt app database ONLY after Matt says yes, BEFORE
-- tenant-sites.backfill.sql. Read only on tenants; makes copy tables.
-- Also take or confirm a dashboard backup: Database > Backups.
create table if not exists public.backup_04_tenants as
  select id, plan, status, sites, site_count, stripe_subscription_id, created_at from public.tenants;
create table if not exists public.backup_04_tenant_sites as table public.tenant_sites;
revoke all on public.backup_04_tenants from anon, authenticated;
revoke all on public.backup_04_tenant_sites from anon, authenticated;
-- Check: both counts should match the live tables.
select (select count(*) from public.backup_04_tenants) as tenants_copied,
       (select count(*) from public.backup_04_tenant_sites) as tenant_sites_copied;
