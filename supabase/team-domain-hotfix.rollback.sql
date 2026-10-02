-- LAST RESORT. Undo team-domain-hotfix.sql: puts back the is_team() from
-- staff.sql before the hotfix. This REOPENS THE HOLE: any @forecourt.me
-- address is trusted again while no team member is active.
--
-- Locked out of the office? Do not use this file. Reactivate hello@ instead,
-- with this one line in the SQL editor:
--   update team_members set status = 'active' where email = 'hello@forecourt.me';
-- If hello@ has no confirmation date (email_confirmed_at), sign in once with
-- an email code first, then try the office again.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
-- Safe to run more than once. Changes no rows.

create or replace function is_team()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from team_members
      where email = lower(coalesce(auth.jwt() ->> 'email', ''))
        and status in ('active', 'invited')
    )
    or (
      not exists (select 1 from team_members where status = 'active')
      and (
        exists (
          select 1 from team_emails
          where email = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
        or lower(coalesce(auth.jwt() ->> 'email', '')) like '%@forecourt.me'
      )
    );
$$;
