-- Group build PR 3: per-site billing (portal database). Safe to re-run.
-- New tables only. No changes to existing rows, no backfill here.
-- Service role only (RLS on, no policies): read and written by server code.

create table if not exists public.tenant_sites (
  id bigserial primary key,
  tenant_id integer not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'setting_up',
  live_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

do $$ begin
  alter table public.tenant_sites
    add constraint tenant_sites_status_check check (status in ('setting_up', 'live', 'archived'));
exception when duplicate_object then null; end $$;

create index if not exists tenant_sites_tenant_idx on public.tenant_sites (tenant_id);

-- One row per site state change. The unique key stops the same change from
-- being billed twice if a request is retried.
create table if not exists public.site_billing_events (
  id bigserial primary key,
  tenant_id integer not null references public.tenants(id) on delete cascade,
  site_code text not null,
  from_status text,
  to_status text not null,
  event_key text not null unique,
  result text,
  detail text,
  actor_email text,
  created_at timestamptz not null default now()
);

create index if not exists site_billing_events_tenant_idx on public.site_billing_events (tenant_id, created_at desc);

alter table public.tenant_sites enable row level security;
alter table public.site_billing_events enable row level security;
revoke all on public.tenant_sites from anon, authenticated;
revoke all on public.site_billing_events from anon, authenticated;
