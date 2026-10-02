-- Security hotfix: is_team() no longer trusts the @forecourt.me domain.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
-- Run after staff.sql. Safe to run more than once. Changes no rows.
--
-- Before: any signed-in address ending @forecourt.me could pass is_team()
-- (and the app made it an owner). Anyone can sign up with such an address.
-- After, a caller is staff only if:
--   * they have a team_members row that is active or invited, or
--   * they are hello@forecourt.me, or
--   * no one on team_members is active yet and their exact address is in
--     team_emails (the old first-run fallback, without the domain).
-- hello@forecourt.me only counts when that auth user's email is confirmed
-- (in every case above), and a revoked team_members row is never staff.
-- Undo: team-domain-hotfix.rollback.sql (puts the domain rule back).

create or replace function is_team()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select lower(coalesce(auth.jwt() ->> 'email', '')) as email
  )
  select
    (select email from me) <> ''
    -- Revoked is never staff.
    and not exists (
      select 1 from team_members t
      where t.email = (select email from me) and t.status = 'revoked'
    )
    -- hello@forecourt.me only counts once that auth user's email is confirmed.
    and (
      (select email from me) <> 'hello@forecourt.me'
      or exists (
        select 1 from auth.users u
        where u.id = auth.uid()
          and lower(u.email) = 'hello@forecourt.me'
          and u.email_confirmed_at is not null
      )
    )
    and (
      exists (
        select 1 from team_members t
        where t.email = (select email from me) and t.status in ('active', 'invited')
      )
      or (select email from me) = 'hello@forecourt.me'
      or (
        not exists (select 1 from team_members where status = 'active')
        and exists (select 1 from team_emails te where te.email = (select email from me))
      )
    );
$$;
