-- Plan change flow (PR 1 of 6). FILE ONLY. Not run anywhere by a deploy.
-- HOW TO USE: paste this whole file into the Supabase SQL editor and press Run.
-- It is one block, so it either all works or nothing changes. Safe to re-run.
-- If something is not ready it stops with a plain message and changes nothing.
-- At the end you should see 3 rows: plan_changes_direction_check,
-- plan_changes_status_check and support_items_kind_status_check.

do $$
declare
  n_cols int;
  n_dupes int;
  n_checks int;
  old_check text;
begin
  -- Check 1: the migration tracker SQL (08) has been run.
  select count(*) into n_cols from information_schema.columns
   where table_schema = 'public' and table_name = 'plan_changes'
     and column_name in ('migration_stage', 'effective_at');
  if n_cols <> 2 then
    raise exception 'Stopped, nothing changed: Run the migration tracker SQL (08) first.';
  end if;

  -- Check 2: no account has more than one open plan change.
  select count(*) into n_dupes from (
    select tenant_id from public.plan_changes
     where status in ('pending_payment', 'paid', 'requested', 'scheduled')
     group by tenant_id having count(*) > 1
  ) d;
  if n_dupes > 0 then
    raise exception 'Stopped, nothing changed: % account(s) have more than one open plan change. Close the extras, then run this again.', n_dupes;
  end if;

  -- STEP 1: plan_changes.
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
  execute 'create unique index plan_changes_one_open on public.plan_changes (tenant_id)
    where status in (''pending_payment'', ''paid'', ''requested'', ''scheduled'')';
  execute 'create unique index if not exists plan_changes_payment_intent on public.plan_changes (payment_intent_id) where payment_intent_id is not null';
  execute 'create unique index if not exists plan_changes_refund on public.plan_changes (refund_id) where refund_id is not null';

  -- STEP 2: support_items gets a plan_change ticket type. The old kind/status
  -- check was created unnamed, so find it by the column it mentions.
  select count(*), min(conname) into n_checks, old_check from pg_constraint
   where conrelid = 'public.support_items'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%change_type%';
  if n_checks <> 1 then
    raise exception 'Stopped, nothing changed: expected 1 support_items check mentioning change_type, found %. Send this message to the developer.', n_checks;
  end if;
  execute format('alter table public.support_items drop constraint %I', old_check);
  alter table public.support_items add constraint support_items_kind_status_check check (
    (kind = 'ticket' and change_type is null and status in ('open', 'in_progress', 'resolved'))
    or (kind = 'change' and change_type in ('new_page', 'content_tweak', 'add_staff', 'other', 'plan_change')
        and status in ('submitted', 'in_progress', 'done', 'declined'))
  );
end $$;

-- STEP 3: verify (expect 3 rows).
select conname from pg_constraint
 where conname in ('plan_changes_status_check', 'plan_changes_direction_check', 'support_items_kind_status_check')
 order by conname;
