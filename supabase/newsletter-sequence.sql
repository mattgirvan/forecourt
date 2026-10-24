-- Newsletter launch sequence (portal database). Files only, NOT run by any
-- build or deploy. Paste in the Supabase SQL editor before turning on
-- NEWSLETTER_SEQUENCE_ENABLED. Safe to run more than once. New tables only,
-- no change to any existing table or row.
--
-- newsletter_subscribers: when each person confirmed. The confirm link writes
--   a row (source 'confirm'). The daily run backfills anyone who confirmed
--   before this table existed from their Resend contact created_at (source
--   'backfill'). Rows are insert only, never overwritten.
-- newsletter_sequence_sends: one row per (email, step), written BEFORE the
--   email goes out. The unique (email, step) key means a step can never be
--   sent twice, even if two runs overlap.
--
-- Until this exists the daily run sends nothing (fail safe).
-- Service role only: RLS on, staff can read, nobody else can see anything.

create table if not exists public.newsletter_subscribers (
  email         text primary key,
  confirmed_at  timestamptz not null,
  source        text not null default 'confirm',
  created_at    timestamptz not null default now(),
  check (source in ('confirm', 'backfill')),
  check (email = lower(email))
);

create table if not exists public.newsletter_sequence_sends (
  id           bigserial primary key,
  email        text not null,
  step         smallint not null,
  status       text not null default 'sending',
  provider_id  text not null default '',
  error        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint newsletter_sequence_sends_email_step_key unique (email, step),
  check (step between 1 and 4),
  check (status in ('sending', 'sent', 'failed'))
);

alter table public.newsletter_subscribers enable row level security;
alter table public.newsletter_sequence_sends enable row level security;

drop policy if exists "team read newsletter subscribers" on public.newsletter_subscribers;
create policy "team read newsletter subscribers" on public.newsletter_subscribers
  for select using ((select public.is_team()));

drop policy if exists "team read newsletter sends" on public.newsletter_sequence_sends;
create policy "team read newsletter sends" on public.newsletter_sequence_sends
  for select using ((select public.is_team()));

-- Check after running:
--   select count(*) from public.newsletter_subscribers;
--   select step, status, count(*) from public.newsletter_sequence_sends group by 1, 2 order by 1, 2;
--
-- Optional, only if you would rather pg_cron ran it than Vercel Cron (do not
-- use both; it would be harmless but pointless). Reuses the migration cron
-- secret already in Vault, so no env var is needed:
--
-- select cron.schedule(
--   'forecourt-newsletter-daily',
--   '0 9 * * *',
--   $job$ select net.http_post(
--        url := 'https://www.forecourt.me/api/cron/newsletter',
--        headers := jsonb_build_object(
--          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'migration_cron_secret' limit 1),
--          'Content-Type', 'application/json'),
--        body := '{}'::jsonb
--      ); $job$
-- );
