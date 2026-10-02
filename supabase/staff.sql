-- Forecourt staff (the office), separate from dealer accounts.
-- Paste after portal.sql. Safe to run more than once.

create table if not exists team_members (
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

insert into team_members (email, name, role, status)
values
  ('hello@forecourt.me', 'Matt Girvan', 'owner', 'active')
on conflict (email) do update
  set name = excluded.name,
      role = 'owner',
      status = 'active';

delete from team_members where email = 'mattgirvan39@gmail.com';
delete from team_emails where email = 'mattgirvan39@gmail.com';

insert into team_members (email, role, status)
select email, 'operator', 'active' from team_emails
on conflict (email) do nothing;

-- Never by email domain: see team-domain-hotfix.sql (kept identical).
create or replace function is_team()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select lower(coalesce(auth.jwt() ->> 'email', '')) as email
  )
  select
    (select email from me) <> ''
    -- Revoked is never staff.
    and not exists (
      select 1 from team_members t
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
      exists (
        select 1 from team_members t
        where t.email = (select email from me) and t.status in ('active', 'invited')
      )
      or (select email from me) = 'hello@forecourt.me'
      or (
        not exists (select 1 from team_members where status = 'active')
        and exists (select 1 from team_emails te where te.email = (select email from me))
      )
    );
$$;

alter table team_members enable row level security;

drop policy if exists "team read members" on team_members;
create policy "team read members" on team_members
  for select using (is_team());

drop policy if exists "team write members" on team_members;
create policy "team write members" on team_members
  for all using (is_team()) with check (is_team());
