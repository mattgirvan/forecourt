-- Forecourt account: dealer portal + team office.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
-- Safe to run more than once.

create table if not exists team_emails (
  email text primary key
);
insert into team_emails (email) values
  ('hello@forecourt.me'),
  ('mattgirvan39@gmail.com')
on conflict do nothing;

create or replace function is_team()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  or lower(coalesce(auth.jwt() ->> 'email', '')) like '%@forecourt.me';
$$;

alter table tenants add column if not exists principal_name text not null default '';
alter table tenants add column if not exists group_name text not null default '';
alter table tenants add column if not exists research text not null default '';
alter table tenants add column if not exists staff_json text not null default '[]';
alter table tenants add column if not exists created_at timestamptz not null default now();

create table if not exists notes (
  id            serial primary key,
  tenant_id     integer not null references tenants (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null,
  author_email  text not null default '',
  visibility    text not null default 'customer',
  body          text not null,
  created_at    timestamptz not null default now(),
  check (visibility in ('customer', 'internal'))
);
create index if not exists notes_tenant_idx on notes (tenant_id, created_at desc);

create table if not exists messages (
  id            serial primary key,
  tenant_id     integer not null references tenants (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null,
  author_email  text not null default '',
  from_team     boolean not null default false,
  body          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists messages_tenant_idx on messages (tenant_id, created_at);

alter table team_emails enable row level security;
alter table notes enable row level security;
alter table messages enable row level security;

drop policy if exists "team read team_emails" on team_emails;
create policy "team read team_emails" on team_emails
  for select using (is_team());
drop policy if exists "team write team_emails" on team_emails;
create policy "team write team_emails" on team_emails
  for all using (is_team()) with check (is_team());

drop policy if exists "team tenants" on tenants;
create policy "team tenants" on tenants
  for all using (is_team()) with check (is_team());

drop policy if exists "team orders" on orders;
create policy "team orders" on orders
  for all using (is_team()) with check (is_team());

drop policy if exists "team provision" on provision_steps;
create policy "team provision" on provision_steps
  for all using (is_team()) with check (is_team());

drop policy if exists "dealer customer notes" on notes;
create policy "dealer customer notes" on notes
  for select using (
    visibility = 'customer'
    and exists (select 1 from tenants t where t.id = notes.tenant_id and t.user_id = auth.uid())
  );
drop policy if exists "dealer write customer notes" on notes;
create policy "dealer write customer notes" on notes
  for insert with check (
    visibility = 'customer'
    and exists (select 1 from tenants t where t.id = notes.tenant_id and t.user_id = auth.uid())
  );
drop policy if exists "team notes" on notes;
create policy "team notes" on notes
  for all using (is_team()) with check (is_team());

drop policy if exists "dealer messages" on messages;
create policy "dealer messages" on messages
  for select using (
    exists (select 1 from tenants t where t.id = messages.tenant_id and t.user_id = auth.uid())
  );
drop policy if exists "dealer send messages" on messages;
create policy "dealer send messages" on messages
  for insert with check (
    from_team = false
    and exists (select 1 from tenants t where t.id = messages.tenant_id and t.user_id = auth.uid())
  );
drop policy if exists "team messages" on messages;
create policy "team messages" on messages
  for all using (is_team()) with check (is_team());
