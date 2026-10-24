-- Plan change flow (PR 1 of 6). FILE ONLY. Not run anywhere. Matt pastes it
-- into the Supabase SQL editor. Safe to re-run. Needs plan-changes.sql and the
-- migration tracker SQL (group/08-migration-tracker.sql) run first.
-- Kept in supabase/, not migrations/, so no deploy ever runs it.

-- STEP 0: check. Run this alone first and read the result.
-- (a) plan_changes and the tracker columns exist (expect 1 row each).
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'plan_changes'
   and column_name in ('migration_stage', 'effective_at');
-- (b) The names of the support_items check constraints. The kind/status
--     check was created unnamed, so Postgres named it itself. Find the one
--     whose definition mentions change_type and put its name in STEP 2.
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.support_items'::regclass and contype = 'c';
-- (c) No account has two open requests (expect 0 rows).
select tenant_id, count(*) from public.plan_changes
 where status in ('pending_payment', 'paid', 'requested', 'scheduled')
 group by tenant_id having count(*) > 1;

-- STEP 1: plan_changes.
begin;
alter table public.plan_changes add column if not exists payment_intent_id text;
alter table public.plan_changes add column if not exists invoice_id text;
alter table public.plan_changes add column if not exists stripe_schedule_id text;
alter table public.plan_changes add column if not exists support_item_id bigint references public.support_items (id) on delete set null;
alter table public.plan_changes add column if not exists go_live_at timestamptz;
alter table public.plan_changes add column if not exists refund_id text;
alter table public.plan_changes add column if not exists rejected_reason text;
alter table public.plan_changes add column if not exists reminder_sent_at timestamptz;
alter table public.plan_changes drop constraint if exists plan_changes_status_check;
alter table public.plan_changes add constraint plan_changes_status_check
  check (status in ('pending_payment', 'paid', 'requested', 'applied', 'scheduled', 'cancelled', 'failed', 'refunded'));
alter table public.plan_changes drop constraint if exists plan_changes_direction_check;
alter table public.plan_changes add constraint plan_changes_direction_check
  check (direction in ('upgrade', 'downgrade', 'up', 'down', 'equal')) not valid;
drop index if exists public.plan_changes_one_open;
create unique index plan_changes_one_open on public.plan_changes (tenant_id)
  where status in ('pending_payment', 'paid', 'requested', 'scheduled');
create unique index if not exists plan_changes_payment_intent on public.plan_changes (payment_intent_id) where payment_intent_id is not null;
create unique index if not exists plan_changes_refund on public.plan_changes (refund_id) where refund_id is not null;
commit;

-- STEP 2: support_items gets a plan_change ticket type.
-- Replace REPLACE_WITH_NAME_FROM_STEP_0b with the name you found. If the
-- name is wrong the drop fails and nothing changes (it is one transaction).
begin;
alter table public.support_items drop constraint "REPLACE_WITH_NAME_FROM_STEP_0b";
alter table public.support_items add constraint support_items_kind_status_check check (
  (kind = 'ticket' and change_type is null and status in ('open', 'in_progress', 'resolved'))
  or (kind = 'change' and change_type in ('new_page', 'content_tweak', 'add_staff', 'other', 'plan_change')
      and status in ('submitted', 'in_progress', 'done', 'declined'))
);
commit;

-- STEP 3: verify (expect the new constraints listed).
select conname from pg_constraint
 where conname in ('plan_changes_status_check', 'plan_changes_direction_check', 'support_items_kind_status_check');
