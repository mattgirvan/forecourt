-- Rollback for plan-change-flow.sql. Only if no row uses the new values.
begin;
alter table public.support_items drop constraint if exists support_items_kind_status_check;
alter table public.support_items add constraint support_items_kind_status_check check (
  (kind = 'ticket' and change_type is null and status in ('open', 'in_progress', 'resolved'))
  or (kind = 'change' and change_type in ('new_page', 'content_tweak', 'add_staff', 'other')
      and status in ('submitted', 'in_progress', 'done', 'declined'))
);
alter table public.plan_changes drop constraint if exists plan_changes_direction_check;
alter table public.plan_changes drop constraint if exists plan_changes_status_check;
alter table public.plan_changes add constraint plan_changes_status_check
  check (status in ('pending_payment', 'applied', 'scheduled', 'cancelled', 'failed'));
drop index if exists public.plan_changes_one_open;
create unique index plan_changes_one_open on public.plan_changes (tenant_id) where status = 'pending_payment';
drop index if exists public.plan_changes_payment_intent;
drop index if exists public.plan_changes_refund;
commit;
-- New columns are left in place (harmless, and dropping them loses data).
