-- 0006 Site status, site switcher data and desk admin tools (group build, PR 2).
--
-- Adds: sites.status (setting_up, live, archived) and sites.archived_at;
-- my_site_list() is the switcher feed: status included, archived never listed;
-- my_site_access() for the desk header; admin_staff_list() and
-- admin_set_staff_sites() for the Admin tab (staff on several sites, and the
-- explicit "All sites" option, unticked by default).
--
-- Safe to re-run. No backfill: existing sites rows default to 'live', and a
-- desk with an empty sites table keeps behaving as before (0005).
-- Data access rules are unchanged: can_see_site() is still the only gate.

alter table public.sites add column if not exists status text not null default 'live';
alter table public.sites add column if not exists archived_at timestamptz;
alter table public.sites drop constraint if exists sites_status_check;
alter table public.sites add constraint sites_status_check
  check (status in ('setting_up', 'live', 'archived'));

-- Desk admins: managers, admins and the principal.
create or replace function public.is_desk_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role in ('management', 'admin', 'principal')
  );
$$;

-- Switcher feed with status. my_sites() from 0005 stays as is, so 0005 can
-- still be re-run after this file.
drop function if exists public.my_site_list();
create function public.my_site_list()
returns table (code text, name text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select s.code, s.name, s.status from sites s
  where public.is_staff() and s.active and s.status <> 'archived'
    and public.can_see_site(s.code)
  order by s.name;
$$;

drop function if exists public.my_site_access();
create function public.my_site_access()
returns table (all_sites boolean, can_switch boolean, scoping_on boolean)
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff() and public.sees_all_sites(),
         public.is_desk_admin(),
         public.site_scoping_on();
$$;

-- Staff the caller may manage, with only the sites the caller can see.
drop function if exists public.admin_staff_list();
create function public.admin_staff_list()
returns table (email text, display_name text, role text, all_sites boolean, sites text[])
language sql
stable
security definer
set search_path = public
as $$
  select u.email, u.display_name, u.role, u.all_sites,
    coalesce(array(
      select ss.site_code from staff_sites ss
      where ss.email = u.email and public.can_see_site(ss.site_code)
      order by ss.site_code
    ), '{}')
  from staff_users u
  where public.is_desk_admin()
    and (
      public.sees_all_sites()
      or exists (select 1 from staff_sites ss where ss.email = u.email and public.can_see_site(ss.site_code))
      or (not u.all_sites and not exists (select 1 from staff_sites ss where ss.email = u.email))
    )
    and (u.role <> 'principal' or public.sees_all_sites())
  order by u.role, u.email;
$$;

-- Set one person's sites. Only touches links at sites the caller can see;
-- links elsewhere are kept. Only an all-sites caller can tick All sites.
create or replace function public.admin_set_staff_sites(p_email text, p_sites text[], p_all_sites boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := lower(coalesce(auth.jwt() ->> 'email', ''));
  target staff_users%rowtype;
  s text;
begin
  if not public.is_desk_admin() then
    raise exception 'not allowed: desk admins only';
  end if;
  select * into target from staff_users where email = lower(p_email);
  if not found then
    raise exception 'no such staff member';
  end if;
  if target.role = 'principal' and (select role from staff_users where email = me) <> 'principal' then
    raise exception 'not allowed: only the principal changes the principal';
  end if;
  if target.email = me and (select role from staff_users where email = me) <> 'principal' then
    raise exception 'not allowed: you cannot change your own sites';
  end if;
  if not public.sees_all_sites() then
    if p_all_sites or target.all_sites then
      raise exception 'not allowed: All sites is set by someone who sees all sites';
    end if;
    if exists (select 1 from staff_sites ss where ss.email = target.email)
       and not exists (select 1 from staff_sites ss where ss.email = target.email and public.can_see_site(ss.site_code)) then
      raise exception 'not allowed: this person is not on any of your sites';
    end if;
  end if;
  foreach s in array coalesce(p_sites, '{}') loop
    if not exists (select 1 from sites where code = s and status <> 'archived') then
      raise exception 'unknown or archived site: %', s;
    end if;
    if not public.can_see_site(s) then
      raise exception 'not allowed: site % is not one of yours', s;
    end if;
  end loop;

  delete from staff_sites ss
  where ss.email = target.email and public.can_see_site(ss.site_code)
    and not (ss.site_code = any (coalesce(p_sites, '{}')));
  insert into staff_sites (email, site_code)
  select target.email, x from unnest(coalesce(p_sites, '{}')) x
  on conflict do nothing;
  if public.sees_all_sites() then
    update staff_users set all_sites = coalesce(p_all_sites, false) where email = target.email;
  end if;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'is_desk_admin()', 'my_site_list()', 'my_site_access()',
    'admin_staff_list()', 'admin_set_staff_sites(text, text[], boolean)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('revoke all on function public.%s from anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
