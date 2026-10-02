-- Check entitlement-guard.sql on the live project. Changes nothing: it runs
-- inside a transaction that is rolled back.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
-- Expect NOTICE lines starting "ok:" and no error. An error starting
-- "GUARD MISSING" means a customer could still change that field.

begin;

-- Act as the owner of one customer site (not staff), the way the API would.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', t.user_id, 'email', u.email, 'role', 'authenticated')::text,
  true
)
from tenants t
join auth.users u on u.id = t.user_id
-- Skip anyone with a team_members row (any status): staff pass the guard, so
-- testing as one of them would prove nothing. Also skip hello@forecourt.me,
-- which is staff even without a row. Other @forecourt.me sign-ups are NOT
-- skipped: the domain grants nothing, so they are customers like any other.
where lower(coalesce(u.email, '')) not in (select email from team_members)
  and lower(coalesce(u.email, '')) <> 'hello@forecourt.me'
order by t.id
limit 1;

set local role authenticated;

do $$
declare
  tid integer;
  oid integer;
begin
  select id into tid from tenants where user_id = auth.uid() order by id limit 1;
  if tid is null then
    raise notice 'skip: no customer site to test with';
    return;
  end if;

  begin
    update tenants set status = 'live' where id = tid;
    raise exception 'GUARD MISSING: customer changed tenants.status';
  exception when insufficient_privilege then
    raise notice 'ok: tenants.status is locked';
  end;

  begin
    update tenants set stripe_subscription_id = 'sub_guard_check' where id = tid;
    raise exception 'GUARD MISSING: customer changed tenants.stripe_subscription_id';
  exception when insufficient_privilege then
    raise notice 'ok: tenants.stripe_subscription_id is locked';
  end;

  begin
    update tenants set trial_ends_at = now() + interval '10 years' where id = tid;
    raise exception 'GUARD MISSING: customer changed tenants.trial_ends_at';
  exception when insufficient_privilege then
    raise notice 'ok: tenants.trial_ends_at is locked';
  end;

  -- The brief stays editable (rolled back at the end).
  update tenants set phone = phone where id = tid;
  raise notice 'ok: brief fields still editable';

  select id into oid from orders where user_id = auth.uid() order by id limit 1;
  if oid is not null then
    begin
      update orders set status = 'paid' where id = oid;
      raise exception 'GUARD MISSING: customer changed orders.status';
    exception when insufficient_privilege then
      raise notice 'ok: orders are read only for customers';
    end;
  end if;
end;
$$;

rollback;
