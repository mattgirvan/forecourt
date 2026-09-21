-- Soft-archive Office orders (tenants). Never deletes rows or cascades.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
-- Safe to run more than once.

alter table tenants add column if not exists archived_at timestamptz;

create index if not exists tenants_archived_at_idx on tenants (archived_at);
