-- Forecourt desk — core schema for one site.
-- Run on a NEW Supabase project. Never on Aberdeen.

create sequence if not exists orders_id_seq start with 1000;

create table if not exists orders (
  id text primary key default ('ORD-' || nextval('orders_id_seq')),
  customer_name text not null,
  customer_email text not null,
  phone text not null default '',
  vehicle text not null,
  colour text not null default '',
  vin text not null default '',
  customer_type text not null check (customer_type in ('Motability', 'Finance', 'Cash', 'Lease')),
  car_type text not null check (car_type in ('New', 'Used')),
  site text not null default 'Main',
  stage_index int not null default 0,
  locator_index int not null default 0,
  gp numeric,
  month_end boolean not null default false,
  confirmed boolean not null default false,
  handover_date date,
  missing jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  last_updated timestamptz not null default now()
);

create index if not exists orders_email_idx on orders (lower(customer_email));
create index if not exists orders_vin_idx on orders (vin);

create table if not exists stock (
  id text primary key,
  vin text not null unique,
  vehicle text not null,
  colour text not null default '',
  car_type text not null check (car_type in ('New', 'Used')),
  site text not null default 'Main',
  keys text not null default 'Unknown',
  days_on_site int not null default 0,
  price numeric not null default 0,
  miles int,
  missing boolean not null default false,
  matched_deal_id text references orders (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists briefs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  want text not null default '',
  colour text not null default 'Any',
  max_miles int,
  max_price numeric,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references orders (id) on delete cascade,
  sender text not null check (sender in ('customer', 'dealer')),
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists staff_users (
  email text primary key
);

alter table orders enable row level security;
alter table stock enable row level security;
alter table briefs enable row level security;
alter table messages enable row level security;
alter table staff_users enable row level security;

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create policy "customers read own order" on orders
  for select
  using (lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy "staff manage orders" on orders
  for all using (is_staff()) with check (is_staff());

create policy "staff manage stock" on stock
  for all using (is_staff()) with check (is_staff());

create policy "staff manage briefs" on briefs
  for all using (is_staff()) with check (is_staff());

create policy "read own thread" on messages
  for select
  using (
    is_staff()
    or exists (
      select 1 from orders o
      where o.id = messages.order_id
        and lower(o.customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

create policy "customer sends into own thread" on messages
  for insert
  with check (
    sender = 'customer'
    and exists (
      select 1 from orders o
      where o.id = messages.order_id
        and lower(o.customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

create policy "staff sends into any thread" on messages
  for insert
  with check (sender = 'dealer' and is_staff());
