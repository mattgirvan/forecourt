-- Template: remove one stranger from the office. Matt runs it by hand, one
-- person at a time, after reading the results of team-domain-hotfix.check.sql.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
--
-- Part 1 (forensics) is read only and changes nothing. Parts 2 and 3 are
-- commented out, so nothing changes until you edit them.
--
-- Why not just delete the sign-in account: deleting a user in auth.users
-- rarely fails. It cascades. It deletes every tenant (dealer site), order and
-- setup step that points at that user, and with each tenant its notes,
-- messages, build events, meetings and jobs. It also blanks the author on
-- notes and messages they wrote. A stranger with owner access could even have
-- pointed a real dealer's site at their own account. So: look first, ban by
-- default, and only delete an account that owns nothing.
--
-- Order matters:
-- 1. Only do this AFTER #41 is merged and the Production deploy is Ready.
--    The code before #41 turns a revoked row back into an active owner.
-- 2. Part 1: run the forensics for the person's user id (section 3 of the
--    check shows it). Save the output. Every row with a number above 0 is
--    data tied to that account. If a tenant is listed that you recognise as
--    a real dealer, stop and tell Forge before doing anything else.
-- 3. Part 2 (the default): set the team_members row to revoked (never delete
--    it), delete the team_emails row, and ban the sign-in account. Banning
--    keeps all their data in place, so nothing a dealer relies on is lost.
-- 4. Part 3 (optional): delete the sign-in account, ONLY if Part 1 showed 0
--    in every row. If in doubt, leave it banned.
-- 5. Run team-domain-hotfix.check.sql again: the address should show as
--    revoked in section 1 and be gone from section 2.
--
-- Never put hello@forecourt.me here.
--
-- Placeholders: replace 00000000-0000-0000-0000-000000000000 with the
-- person's user id, and stranger@forecourt.me with their address (lower
-- case), everywhere they appear in the part you are running.

-- Part 1. Forensics (read only). Everything tied to this user id, and what
-- deleting the account would do to it. It reads the database's own list of
-- links to auth.users and to tenants, so it also covers tables added later.
with target as (
  select '00000000-0000-0000-0000-000000000000'::uuid as id
),
direct as (
  select
    'links to the account' as kind,
    c.conrelid::regclass::text as table_name,
    a.attname::text as detail,
    case c.confdeltype
      when 'c' then 'DELETED with the account'
      when 'n' then 'blanked (set to null)'
      when 'd' then 'set to its default'
      else 'stops the delete'
    end as if_account_deleted,
    (xpath('/row/n/text()', query_to_xml(
      format('select count(*) as n from %s where %I = %L', c.conrelid::regclass, a.attname, (select id from target)),
      false, true, '')))[1]::text::bigint as rows
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f'
    and c.confrelid = 'auth.users'::regclass
    and array_length(c.conkey, 1) = 1
    and c.connamespace <> 'auth'::regnamespace
),
via_tenants as (
  select
    'belongs to their tenants' as kind,
    c.conrelid::regclass::text as table_name,
    a.attname::text as detail,
    case c.confdeltype
      when 'c' then 'DELETED with the account'
      when 'n' then 'blanked (set to null)'
      when 'd' then 'set to its default'
      else 'stops the delete'
    end as if_account_deleted,
    (xpath('/row/n/text()', query_to_xml(
      format('select count(*) as n from %s where %I in (select t.id from public.tenants t where t.user_id = %L)',
        c.conrelid::regclass, a.attname, (select id from target)),
      false, true, '')))[1]::text::bigint as rows
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f'
    and c.confrelid = 'public.tenants'::regclass
    and array_length(c.conkey, 1) = 1
),
their_tenants as (
  select
    'their tenant' as kind,
    'tenants' as table_name,
    format('id %s, %s (%s), status %s, created %s', t.id, t.name, t.slug, t.status, t.created_at) as detail,
    'DELETED with the account' as if_account_deleted,
    1::bigint as rows
  from public.tenants t
  where t.user_id = (select id from target)
)
select * from direct
union all
select * from via_tenants
union all
select * from their_tenants
order by kind, table_name, detail;

-- Part 2. The default: revoke and ban. Remove the two dashes at the start of
-- each line from "begin" to "commit", replace the placeholders, and run.
-- Instead of the "update auth.users" lines you can ban in the dashboard:
-- Authentication, Users, the user's menu, Ban user (choose the longest
-- time). Either way their data stays. Any sign-in they still have stops
-- working within the hour; their office access is already gone once the row
-- is revoked.
--
-- begin;
--
-- update team_members set status = 'revoked'
-- where email = 'stranger@forecourt.me' and email <> 'hello@forecourt.me';
--
-- delete from team_emails
-- where email = 'stranger@forecourt.me' and email <> 'hello@forecourt.me';
--
-- update auth.users set banned_until = '2999-12-31 00:00:00+00'
-- where id = '00000000-0000-0000-0000-000000000000' and lower(email) <> 'hello@forecourt.me';
--
-- commit;

-- Part 3. OPTIONAL, separate, and only if Part 1 showed 0 in every row.
-- Deletes the sign-in account. Run it on its own, after Part 2. It also
-- refuses (deletes nothing) if the account still has a tenant, order, setup
-- step, note or message; if it reports 0 rows deleted, leave the account
-- banned and tell Forge.
--
-- delete from auth.users u
-- where u.id = '00000000-0000-0000-0000-000000000000'
--   and lower(u.email) <> 'hello@forecourt.me'
--   and not exists (select 1 from public.tenants t where t.user_id = u.id)
--   and not exists (select 1 from public.orders o where o.user_id = u.id)
--   and not exists (select 1 from public.provision_steps p where p.user_id = u.id)
--   and not exists (select 1 from public.notes n where n.user_id = u.id)
--   and not exists (select 1 from public.messages m where m.user_id = u.id);
