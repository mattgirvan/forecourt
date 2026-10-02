-- Undo signin-verified-guard.sql: switch the real email check off again.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
-- Changes no rows. Safe to run more than once.
--
-- It puts back the stand-in auth_email_verified() (always yes), word for
-- word the body team-owner-only.sql creates, so section 7 of
-- team-owner-only.check.sql (and the last section of
-- signin-verified-guard.check.sql) says "placeholder (always yes)" again.
-- Only then does it drop email_verified_for(), which nothing else uses.
--
-- It NEVER drops auth_email_verified(): is_team(), is_team_owner(),
-- accept_team_invite() and the dealer policies all call it, and without it
-- every one of them would fail. It never touches those functions or any
-- policy either. They keep calling the check, which now always says yes, so
-- staff are exactly team-owner-only.sql's rule and dealers see their own
-- data as before. The email domain is never trusted.

begin;

create or replace function public.auth_email_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $body$ select true /* forecourt placeholder: signin-verified-guard.sql replaces this */ $body$;

grant execute on function public.auth_email_verified() to anon, authenticated;

drop function if exists public.email_verified_for(uuid);

commit;
