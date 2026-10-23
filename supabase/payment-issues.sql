-- Failed monthly payments (Stripe invoice.payment_failed), one row per
-- invoice. recovered_at is set when Stripe later collects it
-- (invoice.payment_succeeded / invoice.paid). An open issue is a row with
-- recovered_at null.
--
-- Paste into the SQL editor after control-plane.sql, staff.sql (is_team()),
-- build.sql and email-log.sql. Safe to run more than once.
--
-- Until this table exists the webhook still writes the timeline note, the
-- Office badge and the emails; only the account banner stays hidden.
--
-- Only the server (service role, which bypasses RLS) writes. A customer can
-- read their own site's rows; staff can read and change all of them.
-- No card data is stored: amounts, attempt count and Stripe ids only.

create table if not exists payment_issues (
  id                     bigserial primary key,
  tenant_id              integer not null references tenants (id) on delete cascade,
  stripe_invoice_id      text not null,
  stripe_subscription_id text,
  amount_due_pence       integer not null default 0,
  attempt_count          integer not null default 1,
  next_retry_at          timestamptz,
  first_failed_at        timestamptz not null default now(),
  last_failed_at         timestamptz not null default now(),
  recovered_at           timestamptz,
  created_at             timestamptz not null default now(),
  constraint payment_issues_invoice_key unique (stripe_invoice_id)
);
create index if not exists payment_issues_open_idx on payment_issues (tenant_id) where recovered_at is null;

alter table payment_issues enable row level security;

drop policy if exists "dealer read payment issues" on payment_issues;
create policy "dealer read payment issues" on payment_issues
  for select using (
    (select public.auth_email_verified())
    and exists (select 1 from tenants t where t.id = payment_issues.tenant_id and t.user_id = auth.uid())
  );

drop policy if exists "team payment issues" on payment_issues;
create policy "team payment issues" on payment_issues
  for all using ((select public.is_team())) with check ((select public.is_team()));
