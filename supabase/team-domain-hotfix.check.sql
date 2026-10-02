-- Read only: who has office access, and who signed up on @forecourt.me.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
-- Changes nothing. Run it before and after team-domain-hotfix.sql.
--
-- Look for anyone you do not know. Before the hotfix the app made ANY
-- @forecourt.me sign-in an active owner, with an empty invited_by, so a row
-- with "auto_owner_suspect" = true and an address that is not yours is a
-- stranger. To lock one out (an owner change, not part of the hotfix):
--   update team_members set status = 'revoked' where email = 'stranger@forecourt.me';
--   delete from team_emails where email = 'stranger@forecourt.me';

-- 1. Every team_members row, with its sign-in account if there is one.
select
  t.email,
  t.role,
  t.status,
  t.invited_by,
  t.created_at,
  t.last_seen_at,
  u.created_at as signed_up_at,
  u.email_confirmed_at,
  u.last_sign_in_at,
  (t.role = 'owner' and t.invited_by = '' and t.email <> 'hello@forecourt.me') as auto_owner_suspect
from team_members t
left join auth.users u on lower(u.email) = t.email
order by t.created_at;

-- 2. Every team_emails row, and whether it also has a team_members row.
select
  te.email,
  t.role,
  t.status,
  (t.email is null) as no_team_members_row
from team_emails te
left join team_members t on t.email = te.email
order by te.email;

-- 3. Every auth user on @forecourt.me, with their team status (null = none).
select
  u.id,
  u.email,
  u.created_at as signed_up_at,
  u.email_confirmed_at,
  u.last_sign_in_at,
  t.role,
  t.status,
  t.invited_by
from auth.users u
left join team_members t on t.email = lower(u.email)
where lower(coalesce(u.email, '')) like '%@forecourt.me'
order by u.created_at;

-- 4. The is_team() now in place. After the hotfix it has no "like '%@forecourt.me'".
select pg_get_functiondef('public.is_team()'::regprocedure) as is_team_definition;
