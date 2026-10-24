-- Account type changes (group build PR 5). Safe to re-run. Files only, not run.
-- One row per requested change. Upgrades wait in pending_payment until the
-- setup difference is paid (Stripe webhook), then become applied.
create table if not exists public.plan_changes (
  id bigserial primary key,
  tenant_id integer not null references public.tenants (id) on delete cascade,
  from_plan text not null,
  to_plan text not null,
  direction text not null,
  status text not null default 'pending_payment',
  setup_diff_pence integer not null default 0,
  prorated_pence integer not null default 0,
  new_monthly_pence integer not null default 0,
  effective text not null,
  checkout_session_id text,
  requested_by text not null,
  message text,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plan_changes_status_check') then
    alter table public.plan_changes
      add constraint plan_changes_status_check check (status in ('pending_payment', 'applied', 'scheduled', 'cancelled', 'failed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plan_changes_plans_check') then
    alter table public.plan_changes
      add constraint plan_changes_plans_check check (from_plan in ('site', 'franchise', 'group') and to_plan in ('site', 'franchise', 'group') and from_plan <> to_plan);
  end if;
end $$;
-- Only one open upgrade per account at a time.
create unique index if not exists plan_changes_one_open on public.plan_changes (tenant_id) where status = 'pending_payment';
create unique index if not exists plan_changes_session on public.plan_changes (checkout_session_id) where checkout_session_id is not null;
alter table public.plan_changes enable row level security;
revoke all on public.plan_changes from anon, authenticated;
