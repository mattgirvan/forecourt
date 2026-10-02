-- Template: remove one stranger from the office. Matt runs it by hand, one
-- person at a time, after reading the results of team-domain-hotfix.check.sql.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
--
-- Part 1 (forensics) is read only and changes nothing. Parts 2 and 3 are
-- commented out, so nothing changes until you remove their dashes.
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
-- 2. Part 1: put the person's address on the set_config line under "How to
--    use" and run the file. Save the output. Every row with a number above 0
--    is data tied to that account. If a tenant is listed that you recognise as
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
-- How to use: put the person's address on the first line below (it is
-- the only place you type it). Every part looks up their user id from that
-- address, so it can never revoke one person and ban another. If no sign-in
-- account has that address, or more than one does, or it is hello@, the run
-- stops with an error and changes nothing. The whole run is one transaction.
--
-- ALWAYS RUN THE WHOLE FILE. Never highlight one part and run only that:
-- the address check would be skipped. The address only lasts for one run
-- (set_config with true), so a highlighted Part 2 on its own matches nobody
-- and changes nothing, but it does not do the job either.

select set_config('cleanup.email', lower(trim('stranger@forecourt.me')), true);

do $$
declare
  e text := current_setting('cleanup.email');
  n integer;
begin
  if e = 'hello@forecourt.me' then
    raise exception 'Never use this template for hello@forecourt.me.';
  end if;
  select count(*) into n from auth.users where lower(email) = e;
  if n = 0 then
    raise exception 'No sign-in account has the address %. Check the spelling against section 3 of the check. If the person only has a team row and no account, revoke them in the office Staff list instead.', e;
  elsif n > 1 then
    raise exception '% sign-in accounts have the address %. Stop and tell Forge.', n, e;
  end if;
end;
$$;

-- Part 1. Forensics (read only). Everything tied to this user id, and what
-- deleting the account would do to it. It reads the database's own list of
-- links to auth.users and to tenants, so it also covers tables added later.
-- It goes one level deep: rows linked to the account, and rows linked to
-- their tenants. A future table that links to orders or setup steps would
-- not be listed; tell Forge if the schema grows.
with target as (
  select id from auth.users where lower(email) = current_setting('cleanup.email')
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
-- each line from "update team_members" to the end of Part 2, and run the
-- file again. Instead of the "update auth.users" lines you can ban in the
-- dashboard: Authentication, Users, the user's menu, Ban user (choose the
-- longest time). Either way their data stays. Their office access is gone
-- once the row is revoked. For a ban: the app refuses them at once; a token
-- already issued keeps working directly against the database until it
-- expires (1 hour by default).
--
-- update team_members set status = 'revoked'
-- where email = current_setting('cleanup.email') and email <> 'hello@forecourt.me';
--
-- delete from team_emails
-- where email = current_setting('cleanup.email') and email <> 'hello@forecourt.me';
--
-- update auth.users set banned_until = '2999-12-31 00:00:00+00'
-- where id = (select u.id from auth.users u where lower(u.email) = current_setting('cleanup.email'))
--   and lower(email) <> 'hello@forecourt.me';

-- Part 3. OPTIONAL, separate, and only if Part 1 showed 0 in every row.
-- Deletes the sign-in account. Put the dashes back on Part 2 (or leave it:
-- running it twice changes nothing), remove the dashes on Part 3, and run
-- the file again. It also refuses (deletes nothing) if the account still has
-- a tenant, order, setup step, note or message; if it reports 0 rows
-- deleted, leave the account banned and tell Forge.
--
-- delete from auth.users u
-- where u.id = (select x.id from auth.users x where lower(x.email) = current_setting('cleanup.email'))
--   and lower(u.email) <> 'hello@forecourt.me'
--   and not exists (select 1 from public.tenants t where t.user_id = u.id)
--   and not exists (select 1 from public.orders o where o.user_id = u.id)
--   and not exists (select 1 from public.provision_steps p where p.user_id = u.id)
--   and not exists (select 1 from public.notes n where n.user_id = u.id)
--   and not exists (select 1 from public.messages m where m.user_id = u.id);
