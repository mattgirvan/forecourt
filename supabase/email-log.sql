-- Customer journey emails: one row per email we decide to send, written
-- BEFORE the send. The unique dedupe_key means a retry (Stripe webhook
-- retries, a double click on the stage rail) can never send the same email
-- twice. Paste after build.sql. Safe to run more than once.
--
-- Until this table exists the app skips journey emails (fail safe): no crash,
-- no duplicates, nothing sent.

create table if not exists email_log (
  id           bigserial primary key,
  dedupe_key   text not null,
  tenant_id    integer references tenants (id) on delete set null,
  kind         text not null,
  step         integer,
  mode         text not null,
  recipient    text not null default '',
  subject      text not null default '',
  status       text not null default 'sending',
  provider_id  text not null default '',
  error        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint email_log_dedupe_key_key unique (dedupe_key),
  check (mode in ('team', 'live')),
  check (status in ('sending', 'sent', 'failed'))
);
create index if not exists email_log_tenant_idx on email_log (tenant_id, created_at desc);

-- Only the server (service role, which bypasses RLS) writes. Staff can read.
alter table email_log enable row level security;

drop policy if exists "team read email log" on email_log;
create policy "team read email log" on email_log
  for select using (is_team());
