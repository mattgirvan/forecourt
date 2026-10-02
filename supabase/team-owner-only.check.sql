-- Check team-owner-only.sql. Read only: changes nothing.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
-- Run it before and after team-owner-only.sql and save both outputs.

-- 1. Everyone on the team. After the SQL, "invited" rows have an invited_at
--    date and are NOT staff until they sign in from their own email and the
--    office accepts the invite (status becomes active, accepted_at is set).
select email, role, status, invited_by, created_at, invited_at, accepted_at, last_seen_at
from team_members
order by status, role, email;

-- 2. Active owners. You should recognise every one. hello@forecourt.me should
--    be here.
select email, last_seen_at
from team_members
where role = 'owner' and status = 'active'
order by email;

-- 3. The functions. After the SQL, all four exist, and is_team and
--    is_team_owner show search_path="" (no search path tricks).
select p.proname as function_name, p.prosecdef as security_definer, p.proconfig as settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_team', 'is_team_owner', 'accept_team_invite', 'team_members_guard')
order by p.proname;

-- 4. The guard trigger on team_members. After the SQL: one row.
select tgname as trigger_name, tgenabled as enabled
from pg_trigger
where tgrelid = 'public.team_members'::regclass and tgname = 'team_members_guard';

-- 5. Policies on the team tables. After the SQL: insert, update and delete
--    use is_team_owner(); there is no "team write members" or
--    "team write team_emails" any more.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('team_members', 'team_emails')
order by tablename, policyname;

-- 6. Staff policies that still call is_team() per row. After the SQL this
--    returns no rows (every one reads "( SELECT is_team() ...").
select tablename, policyname, qual, with_check
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') ~ 'is_team\(\)' or coalesce(with_check, '') ~ 'is_team\(\)')
  and not (coalesce(qual, '') ~ 'SELECT is_team\(\)' or coalesce(qual, '') ~ 'SELECT public\.is_team\(\)')
  and coalesce(qual, '') !~ 'is_team_owner';
