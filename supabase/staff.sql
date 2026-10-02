-- Forecourt staff (the office), separate from dealer accounts.
-- Paste after team-owner-only.sql and portal.sql. Safe to run more than once.
-- A re-run never brings anyone back: it does not copy team_emails into
-- team_members, it leaves an existing hello@forecourt.me row alone (even a
-- revoked one) and it never defines is_team().
-- Needs team-owner-only.sql first (it defines is_team() and is_team_owner()).
do $$
begin
  if to_regprocedure('public.is_team()') is null or to_regprocedure('public.is_team_owner()') is null then
    raise exception 'Run team-owner-only.sql first. It defines is_team() and is_team_owner().';
  end if;
end;
$$;

create table if not exists team_members (
  email        text primary key,
  name         text not null default '',
  role         text not null default 'operator',
  status       text not null default 'invited',
  invited_by   text not null default '',
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  invited_at   timestamptz,
  accepted_at  timestamptz,
  check (role in ('owner', 'operator')),
  check (status in ('active', 'invited', 'revoked'))
);

insert into team_members (email, name, role, status)
values
  ('hello@forecourt.me', 'Matt Girvan', 'owner', 'active')
on conflict (email) do nothing;

delete from team_members where email = 'mattgirvan39@gmail.com';
delete from team_emails where email = 'mattgirvan39@gmail.com';

alter table team_members enable row level security;

-- Same policies as team-owner-only.sql: staff read, everyone reads their own
-- row, only owners write.
drop policy if exists "team read members" on team_members;
create policy "team read members" on team_members
  for select using (
    (select public.is_team())
    or email = (select lower(coalesce(auth.jwt() ->> 'email', '')))
  );
drop policy if exists "team write members" on team_members;
drop policy if exists "owner add members" on team_members;
create policy "owner add members" on team_members
  for insert with check ((select public.is_team_owner()));
drop policy if exists "owner change members" on team_members;
create policy "owner change members" on team_members
  for update using ((select public.is_team_owner())) with check ((select public.is_team_owner()));
drop policy if exists "owner remove members" on team_members;
create policy "owner remove members" on team_members
  for delete using ((select public.is_team_owner()));
