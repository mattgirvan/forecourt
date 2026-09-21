-- Order execution: timeline, pack, meetings, build queue.
-- Paste after staff.sql. Safe to run more than once.

alter table tenants add column if not exists stage text not null default 'briefing';
alter table tenants add column if not exists pack_json text not null default '';
alter table tenants add column if not exists preview_url text not null default '';
alter table tenants add column if not exists repo_slug text not null default '';

create table if not exists build_events (
  id            serial primary key,
  tenant_id     integer not null references tenants (id) on delete cascade,
  kind          text not null default 'note',
  stage         text,
  title         text not null,
  body          text not null default '',
  visibility    text not null default 'customer',
  actor_email   text not null default '',
  created_at    timestamptz not null default now(),
  check (visibility in ('customer', 'internal'))
);
create index if not exists build_events_tenant_idx on build_events (tenant_id, created_at);

create table if not exists meetings (
  id          serial primary key,
  tenant_id   integer not null references tenants (id) on delete cascade,
  title       text not null,
  starts_at   timestamptz not null,
  notes       text not null default '',
  created_by  text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists meetings_tenant_idx on meetings (tenant_id, starts_at);

create table if not exists build_jobs (
  id          serial primary key,
  tenant_id   integer not null references tenants (id) on delete cascade,
  status      text not null default 'queued',
  pack_json   text not null default '{}',
  brief_md    text not null default '',
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz
);
create index if not exists build_jobs_status_idx on build_jobs (status, created_at desc);

-- Phase 1 scaffold outcomes (safe to re-run)
alter table build_jobs add column if not exists error_message text not null default '';
alter table build_jobs add column if not exists finished_at timestamptz;
alter table build_jobs add column if not exists repo_html_url text not null default '';


alter table build_events enable row level security;
alter table meetings enable row level security;
alter table build_jobs enable row level security;

drop policy if exists "dealer events" on build_events;
create policy "dealer events" on build_events
  for select using (
    visibility = 'customer'
    and exists (select 1 from tenants t where t.id = build_events.tenant_id and t.user_id = auth.uid())
  );
drop policy if exists "dealer write events" on build_events;
create policy "dealer write events" on build_events
  for insert with check (
    visibility = 'customer'
    and exists (select 1 from tenants t where t.id = build_events.tenant_id and t.user_id = auth.uid())
  );
drop policy if exists "team events" on build_events;
create policy "team events" on build_events
  for all using (is_team()) with check (is_team());

drop policy if exists "dealer meetings" on meetings;
create policy "dealer meetings" on meetings
  for select using (
    exists (select 1 from tenants t where t.id = meetings.tenant_id and t.user_id = auth.uid())
  );
drop policy if exists "team meetings" on meetings;
create policy "team meetings" on meetings
  for all using (is_team()) with check (is_team());

drop policy if exists "team jobs" on build_jobs;
create policy "team jobs" on build_jobs
  for all using (is_team()) with check (is_team());

update tenants
set stage = 'paid'
where status in ('trial', 'subscribed', 'paid', 'live')
  and (stage = 'briefing' or stage = '');
