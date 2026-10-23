-- Manager access to a dealer's Forecourt account.
-- Paste into the SQL editor AFTER live-support.sql (and after re-running
-- signin-verified-guard.sql for it). Safe to run more than once.
--
-- The owner (tenants.user_id) invites managers by email. A manager signs in
-- with an email code as that address; accept_tenant_invites() then links the
-- invite to their login. An active manager can:
--   read the tenant row (plan, web address, go live), its build events,
--   its tickets and change requests and their non internal messages,
--   open tickets and change requests and reply to them.
-- A manager can NOT: change the tenant row (no update policy, and the
-- entitlement guard still blocks customers from entitlement fields), open
-- Stripe billing (the server only lets the owner), or see or change who has
-- access (tenant_members is owner and team only).
--
-- Access is added with separate "member ..." policies. Postgres ORs policies,
-- so the owner policies (and their copies in signin-verified-guard.sql) are
-- left exactly as they are and re-running the guard never undoes this file.

begin;

create table if not exists tenant_members (
  id          bigserial primary key,
  tenant_id   integer not null references tenants (id) on delete cascade,
  email       text not null,
  role        text not null default 'manager',
  status      text not null default 'invited',
  user_id     uuid references auth.users (id) on delete set null,
  invited_by  text not null default '',
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  check (role in ('manager')),
  check (status in ('invited', 'active')),
  check (email = lower(btrim(email)) and position('@' in email) > 1),
  check (status <> 'active' or user_id is not null)
);
create unique index if not exists tenant_members_tenant_email on tenant_members (tenant_id, email);
create index if not exists tenant_members_user_idx on tenant_members (user_id) where status = 'active';

-- Security definer helpers so policies on tenants and tenant_members never
-- recurse into each other.
create or replace function public.member_of(tid integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from tenant_members m
    where m.tenant_id = tid and m.status = 'active' and m.user_id = auth.uid()
  );
$$;

create or replace function public.owns_tenant(tid integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from tenants t where t.id = tid and t.user_id = auth.uid());
$$;

-- Called after sign in. Links every pending invite for the signed in,
-- verified email address. Returns how many it linked.
create or replace function public.accept_tenant_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me text;
  n integer;
begin
  if auth.uid() is null or not public.auth_email_verified() then
    return 0;
  end if;
  select lower(u.email) into me from auth.users u where u.id = auth.uid();
  if me is null or me = '' then
    return 0;
  end if;
  update tenant_members
     set status = 'active', user_id = auth.uid(), accepted_at = now()
   where email = me and status = 'invited';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Tenants this login manages (not owns).
create or replace function public.my_member_tenant_ids()
returns setof integer
language sql
stable
security definer
set search_path = public
as $$
  select m.tenant_id from tenant_members m
  where m.status = 'active' and m.user_id = auth.uid() and public.auth_email_verified();
$$;

revoke all on function public.member_of(integer) from public;
revoke all on function public.owns_tenant(integer) from public;
revoke all on function public.accept_tenant_invites() from public;
revoke all on function public.my_member_tenant_ids() from public;
grant execute on function public.member_of(integer) to authenticated;
grant execute on function public.owns_tenant(integer) to authenticated;
grant execute on function public.accept_tenant_invites() to authenticated;
grant execute on function public.my_member_tenant_ids() to authenticated;

alter table tenant_members enable row level security;

-- Owner: see, invite and remove managers on their own site. Invites start as
-- 'invited' with no login; only accept_tenant_invites() makes them active.
drop policy if exists "owner tenant members" on tenant_members;
create policy "owner tenant members" on tenant_members
  for select using ((select public.auth_email_verified()) and public.owns_tenant(tenant_id));
drop policy if exists "owner invite tenant members" on tenant_members;
create policy "owner invite tenant members" on tenant_members
  for insert with check (
    status = 'invited' and user_id is null and role = 'manager'
    and (select public.auth_email_verified()) and public.owns_tenant(tenant_id)
  );
drop policy if exists "owner remove tenant members" on tenant_members;
create policy "owner remove tenant members" on tenant_members
  for delete using ((select public.auth_email_verified()) and public.owns_tenant(tenant_id));
drop policy if exists "team tenant members" on tenant_members;
create policy "team tenant members" on tenant_members
  for all using ((select public.is_team())) with check ((select public.is_team()));

-- Manager reads (never writes) the tenant row and its build events.
drop policy if exists "member tenants" on tenants;
create policy "member tenants" on tenants
  for select using ((select public.auth_email_verified()) and public.member_of(id));
drop policy if exists "member events" on build_events;
create policy "member events" on build_events
  for select using ((select public.auth_email_verified()) and public.member_of(tenant_id));

-- Tickets and change requests: same rules as the owner.
drop policy if exists "member support items" on support_items;
create policy "member support items" on support_items
  for select using ((select public.auth_email_verified()) and public.member_of(tenant_id));
drop policy if exists "member open support items" on support_items;
create policy "member open support items" on support_items
  for insert with check (
    status in ('open', 'submitted')
    and needs_reply
    and (select public.auth_email_verified())
    and public.member_of(tenant_id)
  );
drop policy if exists "member support messages" on support_messages;
create policy "member support messages" on support_messages
  for select using (
    not internal
    and (select public.auth_email_verified())
    and public.member_of(tenant_id)
  );
drop policy if exists "member send support messages" on support_messages;
create policy "member send support messages" on support_messages
  for insert with check (
    not from_team
    and not internal
    and (select public.auth_email_verified())
    and public.member_of(tenant_id)
    and exists (select 1 from support_items i where i.id = support_messages.item_id and i.tenant_id = support_messages.tenant_id)
  );

commit;

-- UNDO (removes all manager access, owners unaffected):
--   drop policy "member tenants" on tenants; drop policy "member events" on build_events;
--   drop policy "member support items" on support_items; drop policy "member open support items" on support_items;
--   drop policy "member support messages" on support_messages; drop policy "member send support messages" on support_messages;
--   drop table tenant_members;
--   drop function public.member_of(integer), public.owns_tenant(integer), public.accept_tenant_invites(), public.my_member_tenant_ids();
