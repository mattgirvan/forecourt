-- Sales-readiness RLS: Aberdeen-shaped helpers + fail-closed order writes.
-- Stock-only seats (host, progressor) must never INSERT/UPDATE/DELETE deals.
-- Hosts are site-scoped on stock via staff_users.site ↔ stock.site (desk has no dealer_site).

-- 1) Helpers -----------------------------------------------------------------

create or replace function public.is_salesperson()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role = 'sales'
  );
$$;

create or replace function public.is_showroom_host()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Desk seat is `host` (PROVISION / tenant.schema). Aberdeen used showroom_host.
  select exists (
    select 1 from staff_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role = 'host'
  );
$$;

create or replace function public.is_stock_only()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Roles that may touch stock/locator but must not write deals.
  -- Desk has no `driver`; map is host + progressor (+ admin/accounts stay read-only on orders).
  select exists (
    select 1 from staff_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role in ('host', 'progressor')
  );
$$;

create or replace function public.staff_site()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select site from staff_users
  where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

-- Keep is_management() current (management + principal) — already in 0002.
create or replace function public.is_management()
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

revoke all on function public.is_salesperson() from public;
revoke all on function public.is_salesperson() from anon;
grant execute on function public.is_salesperson() to authenticated;

revoke all on function public.is_showroom_host() from public;
revoke all on function public.is_showroom_host() from anon;
grant execute on function public.is_showroom_host() to authenticated;

revoke all on function public.is_stock_only() from public;
revoke all on function public.is_stock_only() from anon;
grant execute on function public.is_stock_only() to authenticated;

revoke all on function public.staff_site() from public;
revoke all on function public.staff_site() from anon;
grant execute on function public.staff_site() to authenticated;

revoke all on function public.is_management() from public;
revoke all on function public.is_management() from anon;
grant execute on function public.is_management() to authenticated;

-- 2) Orders — management all; sales own book only; stock-only cannot write ----

drop policy if exists "staff manage orders" on orders;
drop policy if exists "management manage all orders" on orders;
drop policy if exists "sales manage own orders" on orders;
drop policy if exists "floor read orders" on orders;

create policy "management manage all orders" on orders
  for all
  using (is_management())
  with check (is_management());

create policy "sales manage own orders" on orders
  for all
  using (
    is_salesperson()
    and lower(coalesce(salesperson_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    is_salesperson()
    and lower(coalesce(salesperson_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- Floor (host, progressor, admin, accounts): SELECT only — never write deals.
create policy "floor read orders" on orders
  for select
  using (
    is_staff()
    and staff_role() in ('progressor', 'host', 'admin', 'accounts')
  );

-- 3) Messages — mirror order ownership (hosts must not post as dealer on any thread)

drop policy if exists "read own thread" on messages;
create policy "read own thread" on messages
  for select
  using (
    is_management()
    or is_salesperson() and exists (
      select 1 from orders o
      where o.id = messages.order_id
        and lower(coalesce(o.salesperson_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    or exists (
      select 1 from orders o
      where o.id = messages.order_id
        and lower(o.customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    or (
      is_staff()
      and staff_role() in ('progressor', 'host', 'admin', 'accounts')
    )
  );

drop policy if exists "staff sends into any thread" on messages;
drop policy if exists "staff sends into own thread" on messages;
create policy "staff sends into own thread" on messages
  for insert
  with check (
    sender = 'dealer'
    and (
      is_management()
      or (
        is_salesperson()
        and exists (
          select 1 from orders o
          where o.id = messages.order_id
            and lower(coalesce(o.salesperson_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
    )
  );

-- 4) Stock — hosts site-scoped; everyone else on staff keeps full book ---------
-- Desk stock already has `site` (0001_core). No dealer_site column needed.
-- Hosts match staff_users.site; if staff.site is null, host sees nothing writable.

drop policy if exists "staff manage stock" on stock;
create policy "staff manage stock" on stock
  for all
  using (
    is_staff()
    and (
      not is_showroom_host()
      or (
        staff_site() is not null
        and lower(coalesce(site, '')) = lower(staff_site())
      )
    )
  )
  with check (
    is_staff()
    and (
      not is_showroom_host()
      or (
        staff_site() is not null
        and lower(coalesce(site, '')) = lower(staff_site())
      )
    )
  );
