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
  ('mattgirvan39@gmail.com', 'Matt Girvan', 'owner', 'active'),
  ('hello@forecourt.me', 'Forecourt', 'owner', 'active')
on conflict (email) do nothing;

insert into team_members (email, role, status)
select email, 'operator', 'active' from team_emails
on conflict (email) do nothing;

create or replace function is_team()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from team_members
      where email = lower(coalesce(auth.jwt() ->> 'email', ''))
        and status in ('active', 'invited')
    )
    or (
      not exists (select 1 from team_members where status = 'active')
      and (
        exists (
          select 1 from team_emails
          where email = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
        or lower(coalesce(auth.jwt() ->> 'email', '')) like '%@forecourt.me'
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
