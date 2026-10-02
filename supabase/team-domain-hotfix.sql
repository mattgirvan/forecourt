-- Security hotfix: is_team() no longer trusts the @forecourt.me domain.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
-- Run after staff.sql. Safe to run more than once. Changes no rows.
--
-- Before: any signed-in address ending @forecourt.me could pass is_team()
-- (and the app made it an owner). Anyone can sign up with such an address.
-- After, a caller is staff only if:
--   * they have a team_members row that is active, or
--   * they are hello@forecourt.me, or
--   * no one on team_members is active yet and their exact address is in
--     team_emails and no row of their own (the old first-run fallback,
--     without the domain).
-- Since team-owner-only.sql (the follow-up), an invite no longer counts until
-- it is accepted. This file carries the exact same is_team() as
-- team-owner-only.sql, so running it again later cannot weaken anything.
-- After #42 is merged, only ever re-run THIS copy (the one on main). The
-- original copy from #41 lets unaccepted invites count as staff again.
-- hello@forecourt.me only counts when that auth user's email is confirmed
-- (in every case above), and a revoked team_members row is never staff.
-- Since #42 the caller's sign-in session must also still exist, and
-- is_team() calls auth_email_verified() (a stand-in that always says yes
-- until the sign-in work replaces it; created here only if missing).
-- Undo: team-domain-hotfix.rollback.sql (puts the domain rule back).

-- auth_email_verified(): always yes until the sign-in work (#38) installs
-- the real check (signin-verified-guard.sql). Created ONLY if missing, never
-- with "create or replace", so re-running team-owner-only.sql or main's
-- team-domain-hotfix.sql (both carry this same block) can never overwrite
-- the real check. It must come before is_team(), which calls it.
do $$
begin
  if to_regprocedure('public.auth_email_verified()') is null then
    execute $create$
      create function public.auth_email_verified()
      returns boolean
      language sql
      stable
      security definer
      set search_path = ''
      as $body$ select true /* forecourt placeholder: signin-verified-guard.sql replaces this */ $body$
    $create$;
    execute 'grant execute on function public.auth_email_verified() to anon, authenticated';
  end if;
end;
$$;

create or replace function public.is_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select lower(coalesce(auth.jwt() ->> 'email', '')) as email
  )
  select
    public.auth_email_verified()
    and (select email from me) <> ''
    -- The sign-in session must still exist. Signing out (or the office's
    -- "sign out other sessions" after an accept) deletes it, and the token
    -- stops working here at once instead of when it expires.
    and exists (
      select 1 from auth.sessions s
      where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        and s.user_id = auth.uid()
    )
    -- Revoked is never staff.
    and not exists (
      select 1 from public.team_members t
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
      -- Active only: an invite grants nothing until it is accepted.
      exists (
        select 1 from public.team_members t
        where t.email = (select email from me) and t.status = 'active'
      )
      or (select email from me) = 'hello@forecourt.me'
      -- First-run fallback: nobody active yet, the exact address is listed,
      -- and it has no team_members row of its own (invited or revoked).
      or (
        not exists (select 1 from public.team_members where status = 'active')
        and not exists (select 1 from public.team_members t where t.email = (select email from me))
        and exists (select 1 from public.team_emails te where te.email = (select email from me))
      )
    );
$$;
