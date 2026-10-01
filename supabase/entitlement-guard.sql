-- Entitlement guard: customers keep editing their own brief, but never their
-- payment status, plan once paid, Stripe ids, trial or billing dates.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
-- Run after control-plane.sql, billing.sql, portal.sql, staff.sql (needs is_team()), build.sql, archive.sql.
-- Safe to run more than once. Before running: SUPABASE_SERVICE_ROLE_KEY must be
-- set on Vercel Production and deployed, because payment confirmation and the
-- Stripe webhook write these fields with the service role.
--
-- Why a trigger (not column grants or narrower policies):
--   * Staff and customers both arrive as the `authenticated` role, so a column
--     grant that blocks customers would block staff too.
--   * RLS policies cannot compare OLD with NEW, so they cannot say "plan may
--     change only while the site is still in briefing".
--   * The trigger runs for every path (REST with a customer token, server
--     functions using the customer token) and fails closed with 42501.
--   * service_role, postgres (SQL editor, migrations) and is_team() users pass.
-- Existing "own ..." and "team ..." policies are left exactly as they are.

create or replace function forecourt_customer_writer()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select current_user in ('authenticated', 'anon') and not coalesce(is_team(), false);
$$;

create or replace function forecourt_guard_tenants()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  -- Never changed by a customer.
  locked text[] := array[
    'id', 'user_id', 'slug', 'created_at',
    'status', 'stage',
    'stripe_customer_id', 'stripe_subscription_id',
    'trial_ends_at', 'signed_off_at', 'cancelled_at', 'archived_at',
    'research', 'preview_url', 'repo_slug'
  ];
  -- Package choice: editable only while the site is still in briefing (unpaid).
  package text[] := array['plan', 'billing', 'site_count', 'term_months'];
  o jsonb;
  n jsonb;
  c text;
begin
  if not forecourt_customer_writer() then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    n := to_jsonb(new);
    foreach c in array locked loop
      if (n -> c) is distinct from (o -> c) then
        raise exception using errcode = '42501',
          message = format('tenants.%s can only be changed by Forecourt', c);
      end if;
    end loop;
    if coalesce(o ->> 'status', '') <> 'briefing' then
      foreach c in array package loop
        if (n -> c) is distinct from (o -> c) then
          raise exception using errcode = '42501',
            message = format('tenants.%s is fixed once a package is paid for', c);
        end if;
      end loop;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    n := to_jsonb(new);
    if coalesce(n ->> 'status', '') <> 'briefing' then
      raise exception using errcode = '42501', message = 'new tenants start in briefing';
    end if;
    if coalesce(n ->> 'stage', 'briefing') not in ('briefing', '') then
      raise exception using errcode = '42501', message = 'new tenants start in briefing';
    end if;
    foreach c in array array[
      'stripe_customer_id', 'stripe_subscription_id',
      'trial_ends_at', 'signed_off_at', 'cancelled_at', 'archived_at'
    ] loop
      if n ->> c is not null then
        raise exception using errcode = '42501',
          message = format('tenants.%s is set by Forecourt', c);
      end if;
    end loop;
    foreach c in array array['research', 'preview_url', 'repo_slug'] loop
      if coalesce(n ->> c, '') <> '' then
        raise exception using errcode = '42501',
          message = format('tenants.%s is set by Forecourt', c);
      end if;
    end loop;
    return new;
  end if;

  -- DELETE: a customer may only remove a site nothing has been paid for.
  if coalesce(to_jsonb(old) ->> 'status', '') <> 'briefing' then
    raise exception using errcode = '42501', message = 'paid sites can only be removed by Forecourt';
  end if;
  return old;
end;
$$;

create or replace function forecourt_guard_orders()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  n jsonb;
begin
  if not forecourt_customer_writer() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    n := to_jsonb(new);
    if coalesce(n ->> 'status', '') <> 'pending' then
      raise exception using errcode = '42501', message = 'new orders start pending';
    end if;
    if n ->> 'stripe_session_id' is not null or n ->> 'stripe_subscription_id' is not null then
      raise exception using errcode = '42501', message = 'orders.stripe ids are set by Forecourt';
    end if;
    -- An order may only point at a site on the same account.
    if new.tenant_id is not null and not exists (
      select 1 from tenants t where t.id = new.tenant_id and t.user_id = new.user_id
    ) then
      raise exception using errcode = '42501', message = 'orders.tenant_id must be your own site';
    end if;
    return new;
  end if;

  -- Orders are a payment record: after insert only Forecourt changes them.
  raise exception using errcode = '42501', message = 'orders can only be changed by Forecourt';
end;
$$;

drop trigger if exists forecourt_guard_tenants on tenants;
create trigger forecourt_guard_tenants
  before insert or update or delete on tenants
  for each row execute function forecourt_guard_tenants();

drop trigger if exists forecourt_guard_orders on orders;
create trigger forecourt_guard_orders
  before insert or update or delete on orders
  for each row execute function forecourt_guard_orders();

-- Verify (read only):
--   select tgname, tgrelid::regclass, tgenabled from pg_trigger
--    where tgname in ('forecourt_guard_tenants', 'forecourt_guard_orders');
--   select tablename, policyname, cmd, qual, with_check from pg_policies
--    where schemaname = 'public' and tablename in ('tenants', 'orders');
--
-- Roll back:
--   drop trigger if exists forecourt_guard_tenants on tenants;
--   drop trigger if exists forecourt_guard_orders on orders;
--   drop function if exists forecourt_guard_tenants();
--   drop function if exists forecourt_guard_orders();
--   drop function if exists forecourt_customer_writer();
