-- Forecourt control plane: public enquiries from /contact.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
-- Run after staff.sql (needs is_team()). Safe to run more than once.
-- API inserts with the service role only (bypasses RLS).

create table if not exists enquiries (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  name        text not null,
  email       text not null,
  phone       text,
  dealership  text not null,
  role        text not null,
  sites       text not null,
  topic       text not null,
  message     text not null,
  user_agent  text,
  ip          text,
  check (char_length(name) <= 120),
  check (char_length(email) <= 200),
  check (char_length(coalesce(phone, '')) <= 40),
  check (char_length(dealership) <= 200),
  check (char_length(message) <= 5000)
);

create index if not exists enquiries_created_at_idx on enquiries (created_at desc);
create index if not exists enquiries_email_idx on enquiries (lower(email));

alter table enquiries enable row level security;

-- No anon / public write or read. Service role bypasses RLS for inserts from /api/contact.
drop policy if exists "team read enquiries" on enquiries;
create policy "team read enquiries" on enquiries
  for select using (is_team());
