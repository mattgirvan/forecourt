-- 04 BACKFILL: tenant_sites rows for Group and Franchise accounts (group build PR 4).
-- Files only, not run. Run ONLY after Matt says yes, AFTER site-billing.sql and
-- tenant-sites.backup.sql. Touches tenant_sites only. Never touches Stripe.
--
-- Rules:
--   * Only plan group or franchise. Site plan accounts get nothing.
--   * Each entry in tenants.sites (a JSON list of names, or of objects with
--     code, name, status) becomes one row. Existing rows are never changed
--     (on conflict do nothing), so it is safe to re-run.
--   * An account that is live: its sites are live, unless the entry says
--     setting_up or archived. live_at is the account's created_at, so the
--     sites count as already paid for this period and nothing prorates.
--   * An account not live yet: every site is setting_up.
--   * Text that is not a JSON list is skipped for that account.
-- After this, Office Sites shows these rows and the Go live and Archive buttons.
begin;

with src as (
  select t.id, t.status as tenant_status, t.created_at, e.value as v, e.ordinality as n
  from public.tenants t
  cross join lateral jsonb_array_elements(
    case when t.sites ~ '^\s*\[' then t.sites::jsonb else '[]'::jsonb end
  ) with ordinality as e(value, ordinality)
  where t.plan in ('group', 'franchise')
),
parsed as (
  select id, tenant_status, created_at, n,
    case jsonb_typeof(v) when 'string' then trim(v #>> '{}') else coalesce(nullif(trim(v ->> 'code'), ''), nullif(trim(v ->> 'name'), '')) end as code,
    case jsonb_typeof(v) when 'string' then trim(v #>> '{}') else coalesce(nullif(trim(v ->> 'name'), ''), nullif(trim(v ->> 'code'), '')) end as name,
    case when jsonb_typeof(v) = 'object' then v ->> 'status' end as said
  from src
)
insert into public.tenant_sites (tenant_id, code, name, status, live_at, archived_at)
select distinct on (id, code)
  id, code, name,
  case
    when said in ('setting_up', 'archived') then said
    when tenant_status = 'live' then 'live'
    else 'setting_up'
  end,
  case when tenant_status = 'live' and coalesce(said, 'live') in ('live', 'archived') then created_at end,
  case when said = 'archived' then now() end
from parsed
where code is not null and code <> ''
order by id, code, n
on conflict do nothing;

commit;

-- Check after: one line per account.
select tenant_id, count(*) filter (where status = 'live') as live, count(*) as total
from public.tenant_sites group by tenant_id order by tenant_id;
