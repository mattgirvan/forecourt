-- Forecourt control plane (this website). NOT Aberdeen. NOT a customer desk.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co

-- auth_email_verified(): the sign-in guard used by the dealer policies below.
-- Always yes until signin-verified-guard.sql installs the real check. Created
-- ONLY if missing (the same block as team-owner-only.sql), so re-running this
-- file never overwrites the real check.
do $$
begin
  if to_regprocedure('public.auth_email_verified()') is null then
    execute $create$
      create function public.auth_email_verified()
      returns boolean
      language sql
      stable
      security definer
      set search_path = ''
      as $body$ select true /* forecourt placeholder: signin-verified-guard.sql replaces this */ $body$
    $create$;
    execute 'grant execute on function public.auth_email_verified() to anon, authenticated';
  end if;
end;
$$;

create table if not exists tenants (
  id           serial primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  slug         text not null,
  name         text not null,
  legal        text not null default '',
  phone        text not null default '',
  email        text not null default '',
  domain       text not null default '',
  sites        text not null default '[]',
  features     text not null default '{}',
  ingest       text not null default 'excel',
  plan         text not null default 'site',
  billing      text not null default 'trial',
  site_count   integer not null default 1,
  stripe_customer_id text,
  stripe_subscription_id text,
  term_months  integer,
  trial_ends_at timestamptz,
  status       text not null default 'briefing',
  created_at   timestamptz not null default now(),
  unique (user_id, slug)
);
create index if not exists tenants_user_id_idx on tenants (user_id);

create table if not exists orders (
  id                 serial primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  tenant_id          integer references tenants (id) on delete set null,
  plan               text not null,
  amount_pence       integer not null,
  stripe_session_id  text,
  stripe_subscription_id text,
  kind               text not null default 'trial',
  site_count         integer not null default 1,
  status             text not null default 'pending',
  created_at         timestamptz not null default now()
);
create index if not exists orders_user_id_idx on orders (user_id);

create table if not exists provision_steps (
  id         serial primary key,
  tenant_id  integer not null references tenants (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  step       text not null,
  done       boolean not null default false,
  note       text not null default ''
);
create index if not exists provision_steps_tenant_idx on provision_steps (tenant_id);

alter table tenants enable row level security;
alter table orders enable row level security;
alter table provision_steps enable row level security;

drop policy if exists "own tenants" on tenants;
create policy "own tenants" on tenants
  for all using (auth.uid() = user_id and (select public.auth_email_verified())) with check (auth.uid() = user_id and (select public.auth_email_verified()));

drop policy if exists "own orders" on orders;
create policy "own orders" on orders
  for all using (auth.uid() = user_id and (select public.auth_email_verified())) with check (auth.uid() = user_id and (select public.auth_email_verified()));

drop policy if exists "own provision" on provision_steps;
create policy "own provision" on provision_steps
  for all using (auth.uid() = user_id and (select public.auth_email_verified())) with check (auth.uid() = user_id and (select public.auth_email_verified()));
