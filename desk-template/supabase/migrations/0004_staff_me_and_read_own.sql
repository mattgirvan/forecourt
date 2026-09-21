-- Read-own staff_users + staff_me() for auth-bound LoginGate.
-- staff_users had RLS enabled with no SELECT policy, so the client could
-- not load role/site and only got staff_role() (role, no site).

create or replace function public.staff_me()
returns table (
  email text,
  role text,
  display_name text,
  site text,
  franchise text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.email,
    s.role,
    s.display_name,
    s.site,
    s.franchise
  from staff_users s
  where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

revoke all on function public.staff_me() from public;
revoke all on function public.staff_me() from anon;
grant execute on function public.staff_me() to authenticated;

drop policy if exists "staff read own row" on staff_users;
create policy "staff read own row" on staff_users
  for select
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
