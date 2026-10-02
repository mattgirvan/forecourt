-- Team safety: only owners can change the team. Follows #41.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
-- Live database: run once after #41's team-domain-hotfix.sql.
-- New database: run after billing.sql and BEFORE portal.sql (portal.sql,
-- staff.sql, build.sql, email-log.sql and enquiries.sql use these functions).
-- Safe to run more than once. Changes no team rows, except filling in
-- invited_at for rows that are already invited.
--
-- What it does:
--   * auth_email_verified(): a stand-in that always says yes, created only
--     if it is missing. The sign-in work (#38) replaces it with the real
--     check. This file never replaces it, so a re-run cannot switch the
--     real check off.
--   * is_team(): active staff only. An invite grants nothing until accepted.
--     A revoked row is never staff. The email domain is never trusted. The
--     sign-in session must still exist, so signing someone out ends their
--     database access at once, not when their token runs out.
--   * is_team_owner(): an active owner row, or a confirmed hello@forecourt.me
--     with no row yet. Only owners can add, change or remove team_members and
--     team_emails rows (RLS below).
--   * accept_team_invite(): the invited person turns their own invite into
--     access, only with proof they opened their mailbox AFTER the invite (an
--     email code or link sign-in in their current session, see below).
--   * A trigger: invited_at is always set by the database; nobody signed in
--     can make a row active directly (only accepting does that) or change a
--     row's email address; and hello@forecourt.me's row can only be added or
--     changed here, in the SQL editor.
--   * Every staff policy calls (select public.is_team()), so Postgres works
--     it out once per query instead of once per row.
-- Check: team-owner-only.check.sql. Undo: team-owner-only.rollback.sql.

create table if not exists public.team_emails (
  email text primary key
);

create table if not exists public.team_members (
  email        text primary key,
  name         text not null default '',
  role         text not null default 'operator',
  status       text not null default 'invited',
  invited_by   text not null default '',
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  check (role in ('owner', 'operator')),
  check (status in ('active', 'invited', 'revoked'))
);
alter table public.team_members add column if not exists invited_at timestamptz;
alter table public.team_members add column if not exists accepted_at timestamptz;
update public.team_members set invited_at = created_at
where status = 'invited' and invited_at is null;

-- invited_at comes from the database clock, never from a request. Signed-in
-- callers (PostgREST roles) cannot make a row active: only accepting can.
create or replace function public.team_members_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  signed_in boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'DELETE' then
    if signed_in and old.email = 'hello@forecourt.me' then
      raise exception 'hello@forecourt.me can only be changed in the Supabase SQL editor.';
    end if;
    return old;
  end if;
  new.email := lower(trim(new.email));
  if tg_op = 'INSERT' then
    if signed_in and new.email = 'hello@forecourt.me' then
      raise exception 'hello@forecourt.me can only be changed in the Supabase SQL editor.';
    end if;
    if new.status = 'invited' then
      new.invited_at := now();
      new.accepted_at := null;
    elsif signed_in then
      raise exception 'New staff start as invited. They get access once they accept from their own email.';
    end if;
    return new;
  end if;
  if signed_in and old.email = 'hello@forecourt.me'
     and (new.email <> old.email or new.role <> old.role or new.status <> old.status) then
    raise exception 'hello@forecourt.me can only be changed in the Supabase SQL editor.';
  end if;
  -- No renames from the office: a new address would inherit the row's
  -- access with no invite or acceptance (and nobody can be renamed to
  -- hello@forecourt.me, even when its row is missing).
  if signed_in and new.email <> lower(trim(old.email)) then
    raise exception 'An email address cannot be changed. Revoke this person and invite the new address instead.';
  end if;
  if new.status = 'invited' and old.status <> 'invited' then
    new.invited_at := now();
    new.accepted_at := null;
  elsif signed_in then
    if new.status = 'active' and old.status <> 'active' then
      raise exception 'Only the invited person can accept an invite, from their own email.';
    end if;
    new.invited_at := old.invited_at;
    new.accepted_at := old.accepted_at;
  end if;
  return new;
end;
$$;

drop trigger if exists team_members_guard on public.team_members;
create trigger team_members_guard
  before insert or update or delete on public.team_members
  for each row execute function public.team_members_guard();

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

-- Never by email domain. team-domain-hotfix.sql carries an identical copy so
-- re-running it cannot weaken this.
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

create or replace function public.is_team_owner()
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
    and not exists (
      select 1 from public.team_members t
      where t.email = (select email from me) and t.status = 'revoked'
    )
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
        select 1 from public.team_members t
        where t.email = (select email from me) and t.status = 'active' and t.role = 'owner'
      )
      or (
        (select email from me) = 'hello@forecourt.me'
        and not exists (select 1 from public.team_members t where t.email = (select email from me))
      )
    );
$$;

-- Mailbox proof. Supabase puts an "amr" list in every session token: how
-- this session signed in, and when (unix seconds). otp, magiclink, invite,
-- recovery and email/signup all mean an email code or link was used, so the
-- person had the mailbox at that moment. We need one dated at or after
-- invited_at. Not used: email_confirmed_at (set once, years ago or at a
-- stranger's sign-up, and automatic while Confirm email is off) and
-- last_sign_in_at (also moves for password sign-ins, so it proves nothing
-- about the mailbox).
-- An SMS code is also recorded as "otp", so an account with a phone number
-- never qualifies here, and phone sign-in must stay off in Supabase.
-- Do NOT add a custom access token hook (Supabase, Authentication, Hooks)
-- without revisiting this function: a hook can rewrite the amr claim.
-- No other way into the account: no linked identity other than email (such
-- as Google or phone) and no verified authenticator factor. Once the row is
-- active, is_team() is true however the account signs in, so a stranger's
-- Google link would keep working. Also no passkey (auth.webauthn_credentials,
-- where that table exists); the app checks passkeys with the Admin API too.
-- After a successful accept, the app (service role) gives the account a
-- random password and signs out its other sessions, so a stranger who
-- registered the address before the invite cannot keep using it.
create or replace function public.accept_team_invite()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me text := lower(coalesce(auth.jwt() ->> 'email', ''));
  amr jsonb := auth.jwt() -> 'amr';
  since timestamptz;
  has_passkey boolean := false;
begin
  if me = '' or amr is null or jsonb_typeof(amr) <> 'array' then
    return false;
  end if;
  -- The sign-in guard: always yes until the sign-in work (#38) installs the
  -- real check, then a proven email is needed to accept as well.
  if not public.auth_email_verified() then
    return false;
  end if;
  -- The token's email must be this user's own sign-in address.
  -- No phone on the account: an SMS code would also show up as "otp".
  if not exists (
    select 1 from auth.users u
    where u.id = auth.uid() and lower(u.email) = me and coalesce(u.phone, '') = ''
  ) then
    return false;
  end if;
  if exists (
    select 1 from auth.identities i
    where i.user_id = auth.uid() and i.provider <> 'email'
  ) or exists (
    select 1 from auth.mfa_factors f
    where f.user_id = auth.uid() and f.status::text = 'verified'
  ) then
    return false;
  end if;
  -- Passkeys (Supabase keeps them in auth.webauthn_credentials). Checked only
  -- where that table exists, so this works on any Auth version.
  if to_regclass('auth.webauthn_credentials') is not null then
    execute 'select exists (select 1 from auth.webauthn_credentials where user_id = $1)'
      into has_passkey using auth.uid();
    if has_passkey then
      return false;
    end if;
  end if;
  select t.invited_at into since
  from public.team_members t
  where t.email = me and t.status = 'invited';
  if since is null then
    return false;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(amr) a
    where a ->> 'method' in ('otp', 'magiclink', 'invite', 'recovery', 'email/signup')
      and (a ->> 'timestamp') ~ '^[0-9]+$'
      and (a ->> 'timestamp')::bigint >= floor(extract(epoch from since))::bigint
  ) then
    return false;
  end if;
  update public.team_members
  set status = 'active', accepted_at = now(), last_seen_at = now()
  where email = me and status = 'invited';
  return found;
end;
$$;
revoke all on function public.accept_team_invite() from public;
revoke all on function public.accept_team_invite() from anon;
grant execute on function public.accept_team_invite() to authenticated;

alter table public.team_emails enable row level security;
alter table public.team_members enable row level security;

-- Staff read the list. Anyone signed in can read their own row (so a revoked
-- or invited person sees why). Only owners write.
drop policy if exists "team read members" on public.team_members;
create policy "team read members" on public.team_members
  for select using (
    (select public.is_team())
    or email = (select lower(coalesce(auth.jwt() ->> 'email', '')))
  );
drop policy if exists "team write members" on public.team_members;
drop policy if exists "owner add members" on public.team_members;
create policy "owner add members" on public.team_members
  for insert with check ((select public.is_team_owner()));
drop policy if exists "owner change members" on public.team_members;
create policy "owner change members" on public.team_members
  for update using ((select public.is_team_owner())) with check ((select public.is_team_owner()));
drop policy if exists "owner remove members" on public.team_members;
create policy "owner remove members" on public.team_members
  for delete using ((select public.is_team_owner()));

drop policy if exists "team read team_emails" on public.team_emails;
create policy "team read team_emails" on public.team_emails
  for select using ((select public.is_team()));
drop policy if exists "team write team_emails" on public.team_emails;
drop policy if exists "owner add team_emails" on public.team_emails;
create policy "owner add team_emails" on public.team_emails
  for insert with check ((select public.is_team_owner()));
drop policy if exists "owner change team_emails" on public.team_emails;
create policy "owner change team_emails" on public.team_emails
  for update using ((select public.is_team_owner())) with check ((select public.is_team_owner()));
drop policy if exists "owner remove team_emails" on public.team_emails;
create policy "owner remove team_emails" on public.team_emails
  for delete using ((select public.is_team_owner()));

-- The other staff policies, wrapped as (select public.is_team()). Tables that
-- do not exist yet (a new database) are skipped; their own files create the
-- same wrapped policy.
do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('tenants', 'team tenants', 'all'),
      ('orders', 'team orders', 'all'),
      ('provision_steps', 'team provision', 'all'),
      ('notes', 'team notes', 'all'),
      ('messages', 'team messages', 'all'),
      ('build_events', 'team events', 'all'),
      ('meetings', 'team meetings', 'all'),
      ('build_jobs', 'team jobs', 'all'),
      ('email_log', 'team read email log', 'select'),
      ('enquiries', 'team read enquiries', 'select')
    ) as v (tbl, pol, cmd)
  loop
    if to_regclass('public.' || p.tbl) is not null then
      execute format('drop policy if exists %I on public.%I', p.pol, p.tbl);
      if p.cmd = 'all' then
        execute format(
          'create policy %I on public.%I for all using ((select public.is_team())) with check ((select public.is_team()))',
          p.pol, p.tbl);
      else
        execute format('create policy %I on public.%I for select using ((select public.is_team()))', p.pol, p.tbl);
      end if;
    end if;
  end loop;
end;
$$;
