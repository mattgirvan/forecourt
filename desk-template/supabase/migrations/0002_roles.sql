-- Seats on this rooftop. Job title is display_name. Role is the product seat.
-- Pilot: sales + management only (Aberdeen as it runs).
-- Site: + progressor, host, admin, accounts.
-- Group: + principal, and franchise/site on the row.

alter table staff_users add column if not exists role text not null default 'sales';
alter table staff_users add column if not exists display_name text;
alter table staff_users add column if not exists site text;
alter table staff_users add column if not exists franchise text;

alter table staff_users drop constraint if exists staff_users_role_check;
alter table staff_users add constraint staff_users_role_check
  check (role in ('sales', 'management', 'progressor', 'host', 'admin', 'accounts', 'principal'));

alter table orders add column if not exists salesperson_email text
  default lower(coalesce(auth.jwt() ->> 'email', ''));

create or replace function staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from staff_users
  where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

create or replace function is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role in ('management', 'principal')
  );
$$;

-- sales: own book. management/principal: all. others: read per later policies.
drop policy if exists "staff manage orders" on orders;
drop policy if exists "management manage all orders" on orders;
drop policy if exists "sales manage own orders" on orders;

create policy "management manage all orders" on orders
  for all using (is_management()) with check (is_management());

create policy "sales manage own orders" on orders
  for all
  using (is_staff() and staff_role() = 'sales'
    and lower(coalesce(salesperson_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (is_staff() and staff_role() = 'sales'
    and lower(coalesce(salesperson_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy "floor read orders" on orders
  for select
  using (is_staff() and staff_role() in ('progressor', 'host', 'admin', 'accounts'));
