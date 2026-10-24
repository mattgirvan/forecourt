-- Per account role access (redesign slice 13, Roles page). File only, NOT run.
-- Paste once into the SQL editor. Safe to re-run. Needs portal.sql (tenants).
-- Adds one nullable column, so existing tenants rows are untouched: null means
-- "use the role definitions in src/lib/roles.ts". Until this runs, the app
-- shows those defaults read only and saving stays off.
--
-- role_access shape: { "<role id>": { "<ability id>": true | false }, ... }
-- Only the keys an owner has changed are stored; anything missing falls back
-- to the default in src/lib/roles.ts.
--
-- Only the account owner (tenants.user_id) can change it, through
-- set_role_access() below. No other table, policy or column changes.
alter table public.tenants add column if not exists role_access jsonb;

create or replace function public.set_role_access(p_tenant_id integer, p_access jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  a record;
begin
  if auth.uid() is null then
    raise exception 'Sign in again.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id and t.user_id = auth.uid()) then
    raise exception 'Only the account owner can change what a role can do.' using errcode = '42501';
  end if;
  if p_access is not null then
    if jsonb_typeof(p_access) <> 'object' then
      raise exception 'Role access must be an object.' using errcode = '22023';
    end if;
    for r in select key, value from jsonb_each(p_access) loop
      if r.key !~ '^[a-z_]{1,32}$' or jsonb_typeof(r.value) <> 'object' then
        raise exception 'Unknown role in role access.' using errcode = '22023';
      end if;
      for a in select key, value from jsonb_each(r.value) loop
        if a.key !~ '^[a-z_]{1,32}$' or jsonb_typeof(a.value) <> 'boolean' then
          raise exception 'Role access values must be on or off.' using errcode = '22023';
        end if;
      end loop;
    end loop;
  end if;
  update public.tenants set role_access = p_access where id = p_tenant_id;
  return p_access;
end $$;

revoke all on function public.set_role_access(integer, jsonb) from public, anon;
grant execute on function public.set_role_access(integer, jsonb) to authenticated;
