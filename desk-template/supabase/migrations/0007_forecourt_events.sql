-- 0007 Desk events to Forecourt, and restore within 30 days (group build, PR 7).
--
-- Adds:
--   forecourt_link     one row per desk: the Forecourt endpoint, this desk's
--                      key id and its signing secret. No grants, no policies:
--                      only the owner (and security definer functions) read it.
--   forecourt_events   outbox. One row per event, id is the dedupe key that
--                      Forecourt uses in email_log, so a resend never emails twice.
--   triggers           sites: added, archived (removed), restored.
--                      staff_sites and staff_users.all_sites: access changed,
--                      one event per person per transaction.
--   forecourt_send()   signs the event (HMAC SHA256 over "timestamp.body") and
--                      posts it with pg_net at commit. With no link row or no
--                      pg_net the event stays queued (sent_at null) to resend.
--   admin_restore_site(code)  desk admins bring an archived site back within
--                      30 days of archiving. After 30 days it refuses.
--
-- Safe to re-run. Nothing is sent until a forecourt_link row is inserted.

create extension if not exists pgcrypto;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

alter table public.sites add column if not exists archived_from text;

create table if not exists public.forecourt_link (
  id int primary key default 1 check (id = 1),
  endpoint text not null,
  key_id text not null,
  secret text not null check (length(secret) >= 32),
  created_at timestamptz not null default now()
);
alter table public.forecourt_link enable row level security;
revoke all on public.forecourt_link from public, anon, authenticated;

create table if not exists public.forecourt_events (
  id text primary key,
  kind text not null check (kind in ('site_added', 'site_removed', 'site_restored', 'staff_access_changed')),
  site_code text,
  site_name text,
  site_status text,
  email text,
  actor text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  request_id bigint,
  last_error text
);
alter table public.forecourt_events add column if not exists site_status text;
alter table public.forecourt_events enable row level security;
revoke all on public.forecourt_events from public, anon, authenticated;

-- The body Forecourt receives. Staff events carry the sites as they are at
-- commit, so a delete then insert in one save reads as one change.
create or replace function public.forecourt_event_body(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'event_id', e.id,
    'kind', e.kind,
    'site', case when e.site_code is null then null else jsonb_strip_nulls(jsonb_build_object('code', e.site_code, 'name', e.site_name, 'status', e.site_status)) end,
    'staff', case when e.email is null then null else jsonb_build_object(
      'email', e.email,
      'all_sites', (select u.all_sites from staff_users u where u.email = e.email),
      'sites', coalesce((select array_agg(ss.site_code order by ss.site_code) from staff_sites ss where ss.email = e.email), '{}')
    ) end,
    'actor', e.actor,
    'at', e.created_at
  ))
  from forecourt_events e where e.id = p_id;
$$;

create or replace function public.forecourt_send(p_id text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  l forecourt_link;
  body jsonb;
  ts text := floor(extract(epoch from clock_timestamp()))::bigint::text;
  sig text;
  req bigint;
begin
  select * into l from forecourt_link where id = 1;
  if l is null then return false; end if;
  if to_regproc('net.http_post') is null then
    update forecourt_events set last_error = 'pg_net not installed' where id = p_id;
    return false;
  end if;
  body := public.forecourt_event_body(p_id);
  if body is null then return false; end if;
  sig := encode(hmac(ts || '.' || body::text, l.secret, 'sha256'), 'hex');
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
    into req
    using l.endpoint, body, jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Forecourt-Desk', l.key_id,
      'X-Forecourt-Timestamp', ts,
      'X-Forecourt-Signature', 'v1=' || sig
    );
  update forecourt_events set sent_at = now(), request_id = req, last_error = null where id = p_id;
  return true;
exception when others then
  update forecourt_events set last_error = sqlerrm where id = p_id;
  return false;
end;
$$;

-- Send at commit, so staff events see the final sites.
create or replace function public.forecourt_events_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.forecourt_send(new.id);
  return null;
end;
$$;
drop trigger if exists forecourt_events_send on public.forecourt_events;
create constraint trigger forecourt_events_send
  after insert on public.forecourt_events
  deferrable initially deferred
  for each row execute function public.forecourt_events_after_insert();

create or replace function public.forecourt_actor()
returns text
language sql
stable
as $$ select nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '') $$;

create or replace function public.forecourt_site_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare k text;
begin
  if tg_op = 'INSERT' then
    k := 'site_added';
  elsif new.status = 'archived' and old.status <> 'archived' then
    k := 'site_removed';
  elsif old.status = 'archived' and new.status <> 'archived' then
    k := 'site_restored';
  else
    return null;
  end if;
  insert into forecourt_events (id, kind, site_code, site_name, site_status, actor)
  values (k || ':' || new.code || ':' || txid_current()::text, k, new.code, new.name, new.status, public.forecourt_actor())
  on conflict (id) do nothing;
  return null;
end;
$$;
drop trigger if exists sites_forecourt_event on public.sites;
create trigger sites_forecourt_event
  after insert or update of status on public.sites
  for each row execute function public.forecourt_site_event();

-- Remember the state before archiving, so restore puts it back.
create or replace function public.sites_archive_stamp()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    new.archived_from := old.status;
    new.archived_at := coalesce(new.archived_at, now());
  elsif old.status = 'archived' and new.status <> 'archived' then
    new.archived_at := null;
    new.archived_from := null;
  end if;
  return new;
end;
$$;
drop trigger if exists sites_archive_stamp on public.sites;
create trigger sites_archive_stamp
  before update of status on public.sites
  for each row execute function public.sites_archive_stamp();

create or replace function public.forecourt_access_changed(p_emails text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare e text;
begin
  foreach e in array coalesce(p_emails, '{}') loop
    if e is not null then
      insert into forecourt_events (id, kind, email, actor)
      values ('staff_access_changed:' || e || ':' || txid_current()::text, 'staff_access_changed', e, public.forecourt_actor())
      on conflict (id) do nothing;
    end if;
  end loop;
end;
$$;

create or replace function public.forecourt_access_new()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.forecourt_access_changed(array(select distinct email from forecourt_rows));
  return null;
end; $$;

create or replace function public.forecourt_all_sites_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.forecourt_access_changed(array(
    select distinct n.email from forecourt_new_rows n join forecourt_old_rows o on o.email = n.email
    where n.all_sites is distinct from o.all_sites));
  return null;
end; $$;

-- Transition tables need one trigger per operation.
drop trigger if exists staff_sites_forecourt_ins on public.staff_sites;
create trigger staff_sites_forecourt_ins after insert on public.staff_sites
  referencing new table as forecourt_rows
  for each statement execute function public.forecourt_access_new();
drop trigger if exists staff_sites_forecourt_del on public.staff_sites;
create trigger staff_sites_forecourt_del after delete on public.staff_sites
  referencing old table as forecourt_rows
  for each statement execute function public.forecourt_access_new();
drop trigger if exists staff_users_forecourt_all on public.staff_users;
create trigger staff_users_forecourt_all after update on public.staff_users
  referencing new table as forecourt_new_rows old table as forecourt_old_rows
  for each statement execute function public.forecourt_all_sites_changed();

-- Restore within 30 days. Desk admins only, and only sites they can see.
create or replace function public.admin_restore_site(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare s sites;
begin
  if not public.is_desk_admin() or not public.can_see_site(p_code) then raise exception 'not allowed'; end if;
  select * into s from sites where code = p_code;
  if s is null or s.status <> 'archived' then raise exception 'site is not archived: %', p_code; end if;
  if s.archived_at is null or s.archived_at < now() - interval '30 days' then
    raise exception 'restore window closed: % was archived more than 30 days ago', p_code;
  end if;
  update sites set status = coalesce(s.archived_from, 'live') where code = p_code;
  return coalesce(s.archived_from, 'live');
end;
$$;

-- Archived sites the admin can still restore, with the last day to do it.
create or replace function public.admin_restorable_sites()
returns table (code text, name text, archived_at timestamptz, restore_until timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.code, s.name, s.archived_at, s.archived_at + interval '30 days'
  from sites s
  where public.is_desk_admin() and public.can_see_site(s.code) and s.status = 'archived'
    and s.archived_at >= now() - interval '30 days'
  order by s.archived_at desc;
$$;

do $$
declare f text;
begin
  foreach f in array array['admin_restore_site(text)', 'admin_restorable_sites()'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('revoke all on function public.%s from anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['forecourt_send(text)', 'forecourt_event_body(text)', 'forecourt_access_changed(text[])'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('revoke all on function public.%s from anon', f);
    execute format('revoke all on function public.%s from authenticated', f);
  end loop;
end $$;
