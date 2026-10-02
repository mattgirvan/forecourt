-- Undo team-owner-only.sql: back to how #41 left the team rules.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
-- Changes no rows. Safe to run more than once.
--
-- This REOPENS the problems team-owner-only.sql fixed: any staff member
-- (operators and unaccepted invites too) can again add owners, promote
-- themselves or revoke others. Only use it if the office is broken, and
-- revert the code of the follow-up PR at the same time.
--
-- Locked out of the office? Do not use this file. Run this one line instead:
--   update team_members set status = 'active' where email = 'hello@forecourt.me';
--
-- Kept: the invited_at and accepted_at columns (harmless) and the
-- (select public.is_team()) wrapping on other tables (same meaning).

drop policy if exists "owner add members" on public.team_members;
drop policy if exists "owner change members" on public.team_members;
drop policy if exists "owner remove members" on public.team_members;
drop policy if exists "team read members" on public.team_members;
drop policy if exists "team write members" on public.team_members;
drop policy if exists "owner add team_emails" on public.team_emails;
drop policy if exists "owner change team_emails" on public.team_emails;
drop policy if exists "owner remove team_emails" on public.team_emails;
drop policy if exists "team read team_emails" on public.team_emails;
drop policy if exists "team write team_emails" on public.team_emails;

drop trigger if exists team_members_guard on public.team_members;
drop function if exists public.team_members_guard();
drop function if exists public.accept_team_invite();
drop function if exists public.is_team_owner();

-- is_team() exactly as #41's team-domain-hotfix.sql had it (invited counts).
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

create policy "team read members" on public.team_members
  for select using (is_team());
create policy "team write members" on public.team_members
  for all using (is_team()) with check (is_team());
create policy "team read team_emails" on public.team_emails
  for select using (is_team());
create policy "team write team_emails" on public.team_emails
  for all using (is_team()) with check (is_team());
