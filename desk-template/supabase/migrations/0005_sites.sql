-- 0005 Sites and site-scoped access (group build, PR 1 of the stack).
--
-- Adds: sites, staff_sites (staff to sites, many to many), staff_users.all_sites
-- (the explicit "All sites" option), helper functions, and RESTRICTIVE policies
-- that narrow staff reads and writes on orders, stock, messages and briefs to
-- the sites a person can see.
--
-- Safe to re-run. Changes nothing for an existing desk until the backfill:
-- while the sites table is empty, site_scoping_on() is false and every
-- helper answers "yes", so the existing policies decide exactly as before.
-- The backfill (01-sites-access.backfill.sql) fills sites and staff_sites in
-- one transaction, so scoping switches on with everyone already mapped.
--
-- Rules once scoping is on:
--   principal (owner): every site, always.
--   staff_users.all_sites = true: every site, including sites added later.
--   anyone else: only the sites listed for them in staff_sites. A site added
--   later is NOT given to them automatically.
-- Customers (not staff) are untouched: these policies only narrow staff.

-- 1) Tables --------------------------------------------------------------

create table if not exists public.sites (
  code text primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists sites_code_lower_idx on public.sites (lower(code));

alter table public.staff_users add column if not exists all_sites boolean not null default false;

create table if not exists public.staff_sites (
  email text not null references public.staff_users (email) on delete cascade,
  site_code text not null references public.sites (code) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key (email, site_code)
);
create index if not exists staff_sites_site_idx on public.staff_sites (site_code);

alter table public.briefs add column if not exists site text;

alter table public.sites enable row level security;
alter table public.staff_sites enable row level security;

-- 2) Helpers (security definer, fixed search_path) ------------------------

create or replace function public.site_scoping_on()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from sites);
$$;

create or replace function public.sees_all_sites()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.site_scoping_on()
    or exists (
      select 1 from staff_users
      where email = lower(coalesce(auth.jwt() ->> 'email', ''))
        and (role = 'principal' or all_sites)
    );
$$;

create or replace function public.can_see_site(p_site text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.sees_all_sites()
    or exists (
      select 1 from staff_sites ss
      where ss.email = lower(coalesce(auth.jwt() ->> 'email', ''))
        and lower(ss.site_code) = lower(coalesce(p_site, ''))
    );
$$;

create or replace function public.can_see_order_site(p_order_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from orders o
    where o.id = p_order_id and public.can_see_site(o.site)
  );
$$;

-- Sites the signed-in staff member can see, for the site switcher (PR 2).
create or replace function public.my_sites()
returns table (code text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select s.code, s.name from sites s
  where public.is_staff() and s.active and public.can_see_site(s.code)
  order by s.name;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'site_scoping_on()', 'sees_all_sites()', 'can_see_site(text)',
    'can_see_order_site(text)', 'my_sites()'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('revoke all on function public.%s from anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- 3) Policies on the new tables (read only for clients) ------------------

drop policy if exists "staff read visible sites" on public.sites;
create policy "staff read visible sites" on public.sites
  for select to authenticated
  using (public.is_staff() and public.can_see_site(code));

drop policy if exists "staff read own site links" on public.staff_sites;
create policy "staff read own site links" on public.staff_sites
  for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

-- No insert, update or delete policies: sites and links are managed with the
-- service role (desk admin tools, PR 2) or by Matt in SQL.

-- 4) Restrictive site scope on customer data ------------------------------
-- RESTRICTIVE policies are ANDed with the existing permissive ones, so they
-- can only take access away, never add it.

drop policy if exists "site scope orders" on public.orders;
create policy "site scope orders" on public.orders
  as restrictive for all
  using (not public.is_staff() or public.can_see_site(site))
  with check (not public.is_staff() or public.can_see_site(site));

drop policy if exists "site scope stock" on public.stock;
create policy "site scope stock" on public.stock
  as restrictive for all
  using (not public.is_staff() or public.can_see_site(site))
  with check (not public.is_staff() or public.can_see_site(site));

drop policy if exists "site scope messages" on public.messages;
create policy "site scope messages" on public.messages
  as restrictive for all
  using (not public.is_staff() or public.can_see_order_site(order_id))
  with check (not public.is_staff() or public.can_see_order_site(order_id));

-- Briefs with no site are shared across the desk (as today).
drop policy if exists "site scope briefs" on public.briefs;
create policy "site scope briefs" on public.briefs
  as restrictive for all
  using (not public.is_staff() or site is null or public.can_see_site(site))
  with check (not public.is_staff() or site is null or public.can_see_site(site));
