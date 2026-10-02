-- Safety check for signin-verified-guard.sql. Read only: changes nothing.
-- Run it in the Supabase SQL editor BEFORE the guard. Same rule as
-- public.email_verified_for() in that file, written out inline so it works
-- before the guard exists.
--
-- Confirm email must be ON before the guard runs (see the header of
-- signin-verified-guard.sql). This check is fine to run at any time: before
-- the guard, after it, and after the rollback.
--
-- Result: one row per account that would be REFUSED, newest sign-in first.
-- Expect none for real staff and dealers. "reason" says why.

with u as (
  select id, lower(trim(coalesce(email, ''))) as email, email_confirmed_at, last_sign_in_at, created_at
  from auth.users
),
ids as (
  select
    user_id,
    lower(coalesce(provider, '')) as provider,
    lower(trim(coalesce(identity_data ->> 'email', ''))) as email,
    lower(coalesce(identity_data ->> 'email_verified', '')) = 'true' as verified
  from auth.identities
),
judged as (
  select
    u.*,
    (select string_agg(i.provider || case when i.verified then '' else ' (unverified)' end, ', ' order by i.provider)
       from ids i where i.user_id = u.id) as identities,
    exists (select 1 from ids i where i.user_id = u.id and i.provider <> 'email' and not i.verified) as has_unverified_provider,
    exists (
      select 1 from ids i
      where i.user_id = u.id
        and ((i.provider = 'email' and i.email = u.email and (u.email_confirmed_at is not null or i.verified))
          or (i.provider = 'google' and i.verified and i.email = u.email))
    ) as has_proof
  from u
)
select
  email,
  identities,
  case
    when email = '' then 'no email on the account'
    when has_unverified_provider then 'a non-email identity (usually Google) did not verify the email'
    when identities is null then 'no identities at all (very old account?)'
    else 'no confirmed email identity and no verified Google identity'
  end as reason,
  email_confirmed_at,
  last_sign_in_at,
  created_at,
  exists (select 1 from public.team_members m where m.email = judged.email and m.status = 'active') as is_staff,
  exists (select 1 from public.tenants t where t.user_id = judged.id) as has_tenant,
  true as would_be_refused
from judged
where not (email <> '' and not has_unverified_provider and has_proof)
order by last_sign_in_at desc nulls last;

-- And the totals, for the record.
select
  count(*) as accounts,
  count(*) filter (where email_confirmed_at is not null) as email_confirmed,
  (select count(distinct user_id) from auth.identities where provider = 'email') as with_email_identity,
  (select count(distinct user_id) from auth.identities where provider = 'google') as with_google_identity
from auth.users;

-- Which check is on. A copy of section 7 of team-owner-only.check.sql.
-- Before the guard and after its rollback: "placeholder (always yes)".
-- After the guard: "real guard". is_team and is_team_owner must both say
-- "calls the guard, checks the session". "DOES NOT call the guard" means an
-- old copy of a file was run (#41's original team-domain-hotfix.sql, or
-- team-domain-hotfix.rollback.sql): run main's team-owner-only.sql again.
select 'auth_email_verified' as item,
  case
    when to_regprocedure('public.auth_email_verified()') is null then 'missing'
    when (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public.auth_email_verified()')) ~ 'forecourt placeholder'
      then 'placeholder (always yes)'
    else 'real guard'
  end as state
union all
select f.name,
  case
    when to_regprocedure('public.' || f.name || '()') is null then 'missing'
    else concat_ws(', ',
      case when p.prosrc ~ 'auth_email_verified\(\)' then 'calls the guard' else 'DOES NOT call the guard' end,
      case when p.prosrc ~ 'auth\.sessions' then 'checks the session' else 'DOES NOT check the session' end)
  end
from (values ('is_team'), ('is_team_owner')) as f (name)
left join pg_proc p on p.oid = to_regprocedure('public.' || f.name || '()');
