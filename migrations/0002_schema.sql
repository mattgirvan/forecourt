-- Forecourt commercial + tenant template (one codebase, never a fork)
create table if not exists tenants (
  id           serial primary key,
  user_id      text not null,
  slug         text not null,
  name         text not null,
  legal        text not null default '',
  phone        text not null default '',
  email        text not null default '',
  domain       text not null default '',
  sites        text not null default '[]',
  features     text not null default '{}',
  ingest       text not null default 'excel',
  plan         text not null default 'pilot',
  status       text not null default 'briefing',
  created_at   timestamptz not null default now(),
  unique (user_id, slug)
);
create index if not exists tenants_user_id_idx on tenants (user_id);

create table if not exists orders (
  id                 serial primary key,
  user_id            text not null,
  tenant_id          integer references tenants(id) on delete set null,
  plan               text not null,
  amount_pence       integer not null,
  stripe_session_id  text,
  status             text not null default 'pending',
  created_at         timestamptz not null default now()
);
create index if not exists orders_user_id_idx on orders (user_id);

create table if not exists provision_steps (
  id         serial primary key,
  tenant_id  integer not null references tenants(id) on delete cascade,
  user_id    text not null,
  step       text not null,
  done       boolean not null default false,
  note       text not null default ''
);
create index if not exists provision_steps_tenant_idx on provision_steps (tenant_id);
