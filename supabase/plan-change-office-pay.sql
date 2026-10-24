-- Staff never pay (Office started plan changes, and Mark as paid). FILE ONLY.
-- Not run anywhere by a deploy.
-- HOW TO USE: paste this whole file into the Supabase SQL editor and press Run.
-- One block, safe to re-run. Adds three nullable columns to plan_changes and
-- nothing else: no new status, no new table, no data changed.
-- At the end you should see 3 rows: marked_paid_at, marked_paid_by, started_from.
--
-- The code works before this runs:
--   started_from   Office starts still email the link, and their first Checkout
--                  page still carries started_from in its Stripe metadata. Until
--                  this runs, a page reopened from Pay does not, so if that page
--                  expires unpaid the request is cancelled as today.
--   marked_paid_*  Mark as paid still works and writes who and when to the
--                  internal notes on the file; the columns just stay empty.

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'plan_changes') then
    raise exception 'Stopped, nothing changed: plan_changes is missing. Run the plan change SQL first.';
  end if;
  alter table public.plan_changes add column if not exists started_from text;
  alter table public.plan_changes add column if not exists marked_paid_by text;
  alter table public.plan_changes add column if not exists marked_paid_at timestamptz;
  comment on column public.plan_changes.started_from is 'office when the Forecourt team started it; the customer pays from an emailed link.';
  comment on column public.plan_changes.marked_paid_by is 'Email of the owner who marked the setup difference as paid (bank transfer). Null for card payments.';
  comment on column public.plan_changes.marked_paid_at is 'When an owner marked it as paid. Null for card payments.';
end $$;

select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'plan_changes'
   and column_name in ('started_from', 'marked_paid_by', 'marked_paid_at')
 order by column_name;
