-- Forecourt: only accounts with a PROVEN email reach staff or dealer data.
--
-- Same rule as the app (src/lib/auth/verified-email.ts), checked in the
-- database so a session cannot skip the server and call the API directly.
-- It looks at what is attached to the account (auth.identities), never at
-- how the current session started, so adding a password or a passkey after
-- a bad Google link does not get round it.
--
-- REQUIRED FIRST: turn Confirm email ON in Supabase (Authentication, Sign In
-- / Providers, Email: "Confirm email"). While it is off, Supabase marks every
-- new password sign-up as confirmed straight away, without the inbox, so a
-- confirmed email is NOT real proof and this guard only stops the unverified
-- Google case. Do not run this file until Confirm email is on and a
-- brand-new dealer can still sign in with an email code.
--
-- A signed-in user counts as verified when BOTH hold:
--   1. every identity that is not the email identity (Google, or any provider
--      added later) has identity_data.email_verified = true; and
--   2. there is a proof: an email identity for the account email that is
--      confirmed (auth.users.email_confirmed_at set, or the identity's own
--      email_verified = true), or a Google identity that verified the same
--      email.
--
-- WHAT THIS FILE DOES: it only switches on the real check. It replaces the
-- stand-in public.auth_email_verified() (always yes, created by
-- team-owner-only.sql, main's team-domain-hotfix.sql, control-plane.sql,
-- portal.sql and build.sql) with the rule above. It never defines is_team(),
-- is_team_owner() or accept_team_invite(), and never touches the
-- team_members or team_emails policies: team-owner-only.sql owns those, and
-- they already call auth_email_verified(). The dealer policies below are
-- copied word for word from control-plane.sql, portal.sql and build.sql
-- (which carry the check too), so a database set up before those files
-- gained it gets it here. Re-running any of main's SQL files afterwards
-- keeps the check on.
--
-- Email code users are NOT locked out. They all have an email identity, and
-- Supabase sets email_confirmed_at when the first code is used. That counts.
--
-- RUN (Matt, Supabase SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co):
--   1. Confirm email is ON (see REQUIRED FIRST above).
--   2. team-owner-only.sql (PR #42) has been run, after main's
--      team-domain-hotfix.sql (PR #41).
--   3. Paste signin-verified-guard.check.sql and run it. It changes nothing.
--      Expect 0 rows in "would_be_refused" for real staff and dealers. If
--      someone is listed, read the reason column before going on. Its last
--      section should say "placeholder (always yes)".
--   4. Paste this whole file and run it. It runs in one transaction and is
--      safe to run more than once.
--   5. Run the check again: the last section should now say "real guard",
--      and "calls the guard, checks the session" for is_team and
--      is_team_owner.
--   6. Sign in on www.forecourt.me with an email code as hello@forecourt.me:
--      the office must load. Sign in as a test dealer: /account must load.
--   7. If anything is wrong, run signin-verified-guard.rollback.sql. It puts
--      the stand-in back (always yes) at once.

begin;

-- The rule for one user. Private: only the definer functions below call it,
-- so nobody can ask about other people's accounts.
create or replace function public.email_verified_for(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with u as (
    select lower(trim(coalesce(email, ''))) as email, email_confirmed_at
    from auth.users
    where id = uid
  ),
  ids as (
    select
      lower(coalesce(provider, '')) as provider,
      lower(trim(coalesce(identity_data ->> 'email', ''))) as email,
      lower(coalesce(identity_data ->> 'email_verified', '')) = 'true' as verified
    from auth.identities
    where user_id = uid
  )
  select coalesce((
    select
      u.email <> ''
      and not exists (select 1 from ids where ids.provider <> 'email' and not ids.verified)
      and exists (
        select 1 from ids
        where (ids.provider = 'email' and ids.email = u.email and (u.email_confirmed_at is not null or ids.verified))
           or (ids.provider = 'google' and ids.verified and ids.email = u.email)
      )
    from u
  ), false);
$$;

revoke all on function public.email_verified_for(uuid) from public, anon, authenticated;

-- The rule for whoever is signed in. is_team(), is_team_owner(),
-- accept_team_invite() and every dealer policy call this. This is the one
-- file that installs the real check, so "create or replace" is right here.
create or replace function public.auth_email_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and public.email_verified_for(auth.uid());
$$;

grant execute on function public.auth_email_verified() to anon, authenticated;

-- Dealers: the same policies as control-plane.sql, portal.sql and build.sql,
-- which already need a proven email. "(select ...)" lets Postgres work it
-- out once per query instead of once per row.

-- From control-plane.sql, word for word.
drop policy if exists "own tenants" on tenants;
create policy "own tenants" on tenants
  for all using (auth.uid() = user_id and (select public.auth_email_verified())) with check (auth.uid() = user_id and (select public.auth_email_verified()));
drop policy if exists "own orders" on orders;
create policy "own orders" on orders
  for all using (auth.uid() = user_id and (select public.auth_email_verified())) with check (auth.uid() = user_id and (select public.auth_email_verified()));
drop policy if exists "own provision" on provision_steps;
create policy "own provision" on provision_steps
  for all using (auth.uid() = user_id and (select public.auth_email_verified())) with check (auth.uid() = user_id and (select public.auth_email_verified()));

-- From portal.sql, word for word.
drop policy if exists "dealer customer notes" on notes;
create policy "dealer customer notes" on notes
  for select using (
    visibility = 'customer'
    and (select public.auth_email_verified())
    and exists (select 1 from tenants t where t.id = notes.tenant_id and t.user_id = auth.uid())
  );
drop policy if exists "dealer write customer notes" on notes;
create policy "dealer write customer notes" on notes
  for insert with check (
    visibility = 'customer'
    and (select public.auth_email_verified())
    and exists (select 1 from tenants t where t.id = notes.tenant_id and t.user_id = auth.uid())
  );
drop policy if exists "dealer messages" on messages;
create policy "dealer messages" on messages
  for select using (
    (select public.auth_email_verified())
    and exists (select 1 from tenants t where t.id = messages.tenant_id and t.user_id = auth.uid())
  );
drop policy if exists "dealer send messages" on messages;
create policy "dealer send messages" on messages
  for insert with check (
    from_team = false
    and (select public.auth_email_verified())
    and exists (select 1 from tenants t where t.id = messages.tenant_id and t.user_id = auth.uid())
  );

-- From build.sql, word for word.
drop policy if exists "dealer events" on build_events;
create policy "dealer events" on build_events
  for select using (
    visibility = 'customer'
    and (select public.auth_email_verified())
    and exists (select 1 from tenants t where t.id = build_events.tenant_id and t.user_id = auth.uid())
  );
drop policy if exists "dealer write events" on build_events;
create policy "dealer write events" on build_events
  for insert with check (
    visibility = 'customer'
    and (select public.auth_email_verified())
    and exists (select 1 from tenants t where t.id = build_events.tenant_id and t.user_id = auth.uid())
  );
drop policy if exists "dealer meetings" on meetings;
create policy "dealer meetings" on meetings
  for select using (
    (select public.auth_email_verified())
    and exists (select 1 from tenants t where t.id = meetings.tenant_id and t.user_id = auth.uid())
  );

commit;

-- UNDO: run supabase/signin-verified-guard.rollback.sql. It puts the
-- stand-in auth_email_verified() back (always yes), so everyone signed in
-- gets through again straight away, and it never drops the function.
