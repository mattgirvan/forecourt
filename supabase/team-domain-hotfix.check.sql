-- Read only: who has office access, and who signed up on @forecourt.me.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
-- Changes nothing. Run it before and after team-domain-hotfix.sql, and again
-- after any clean-up. Save the output each time.
--
-- What to look for:
-- * Section 1: revoke EVERY team_members row you do not personally
--   recognise. "auto_owner_suspect" and "invited_by_unknown" are only hints:
--   a stranger who got owner access could have invited others through the
--   app, or written rows straight into the table with any invited_by.
-- * Section 3: every @forecourt.me sign-in account you do not recognise must
--   be deleted (Supabase, Authentication, Users), even with no team row.
--   Otherwise whoever made it becomes staff the moment you invite that
--   address (for example sales@ or ops@).
-- * hello@forecourt.me must show an email_confirmed_at date. If it does not,
--   stop and do not run the hotfix.
--
-- How to remove a stranger: see team-domain-hotfix.cleanup.sql. Only do it
-- AFTER the #41 code is live: the code before #41 quietly turns a revoked
-- row back into an active owner.

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
  -- Hint only: an owner row the old code made by itself for any @forecourt.me sign-in.
  (t.role = 'owner' and t.invited_by = '' and t.email <> 'hello@forecourt.me') as auto_owner_suspect,
  -- Hint only: invited by someone who is not on the team, or by a suspect owner.
  (
    t.invited_by <> ''
    and (
      not exists (select 1 from team_members i where i.email = lower(t.invited_by))
      or exists (
        select 1 from team_members i
        where i.email = lower(t.invited_by)
          and i.role = 'owner' and i.invited_by = '' and i.email <> 'hello@forecourt.me'
      )
    )
  ) as invited_by_unknown
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
