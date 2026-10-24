-- 01 backfill: switch site scoping ON for an existing desk.
-- Run ONLY after Matt says yes, per desk, AFTER 01-sites-access.sql.
-- Keeps today's access exactly: every existing site becomes a row, management
-- and principal get "All sites" ticked explicitly, everyone else is linked to
-- their staff_users.site, or to every existing site if they have none.
-- Untick all_sites or remove links afterwards to limit a manager.

-- STEP 0: BACKUP (run first, keep the output). Read only.
--   Supabase dashboard: Database > Backups, take or confirm a backup, or:
--   pg_dump --data-only -t public.staff_users -t public.orders -t public.stock
--           -t public.briefs -t public.messages "$DESK_DB_URL" > desk-backup.sql
create table if not exists public.backup_01_staff_users as table public.staff_users;

-- STEP 1: backfill, all or nothing.
begin;

insert into public.sites (code, name)
select distinct on (lower(s)) s, s
from (
  select site as s from public.orders
  union select site from public.stock
  union select site from public.staff_users where site is not null and site <> ''
) x
where s is not null and s <> ''
order by lower(s), s
on conflict do nothing;

-- Make sure at least one site exists (the default is 'Main').
insert into public.sites (code, name)
select 'Main', 'Main' where not exists (select 1 from public.sites);

update public.staff_users set all_sites = true
where role in ('management', 'principal') and not all_sites;

insert into public.staff_sites (email, site_code)
select u.email, st.code
from public.staff_users u
join public.sites st on lower(st.code) = lower(u.site)
where u.site is not null and u.site <> ''
on conflict do nothing;

insert into public.staff_sites (email, site_code)
select u.email, st.code
from public.staff_users u
cross join public.sites st
where (u.site is null or u.site = '')
  and u.role not in ('management', 'principal')
on conflict do nothing;

commit;

-- STEP 2: check (read only). Every non manager should have at least one link.
select u.email, u.role, u.all_sites, count(ss.site_code) as sites
from public.staff_users u left join public.staff_sites ss on ss.email = u.email
group by 1, 2, 3 order by 2, 1;

-- ROLLBACK (switches scoping off again; access returns to pre-backfill):
--   begin; delete from public.staff_sites; delete from public.sites;
--   update public.staff_users u set all_sites = b.all_sites
--     from public.backup_01_staff_users b where b.email = u.email; commit;
