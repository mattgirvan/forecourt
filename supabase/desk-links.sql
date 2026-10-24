-- Desk links (group build, PR 7). One row per desk: the key id the desk sends
-- in X-Forecourt-Desk and the secret it signs events with (desk 0007
-- forecourt_link holds the same pair). Service role only: RLS on, no policies.
-- Safe to re-run.

create table if not exists public.desk_links (
  key_id text primary key,
  tenant_id bigint not null references public.tenants (id) on delete cascade,
  secret text not null check (length(secret) >= 32),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists desk_links_tenant on public.desk_links (tenant_id);
alter table public.desk_links enable row level security;
revoke all on public.desk_links from public, anon, authenticated;
