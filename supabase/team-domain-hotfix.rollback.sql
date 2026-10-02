-- Undo team-domain-hotfix.sql: puts back the is_team() from staff.sql before
-- the hotfix. WARNING: this trusts any @forecourt.me address again while no
-- team member is active. Only use it if the hotfix locks out real staff.
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
