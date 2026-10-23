-- Live view: support tickets and change requests, each with a message thread.
-- Paste into the SQL editor after control-plane.sql, team-owner-only.sql
-- (is_team()), portal.sql (messages) and build.sql. Safe to run more than once.
-- After it, re-run signin-verified-guard.sql (it mirrors the dealer policies).
--
-- One table for both kinds so the Office queue is one list:
--   kind 'ticket': status open | in_progress | resolved
--   kind 'change': status submitted | in_progress | done | declined
--                  change_type new_page | content_tweak | add_staff | other
-- needs_reply is true while the dealer wrote last and staff have not answered.
--
-- Customers can read their own site's items and non-internal messages, open
-- new items and add messages. They can never change status or needs_reply:
-- the trigger below does that (a dealer reply reopens a resolved ticket).

create table if not exists support_items (
  id           bigserial primary key,
  ref          integer generated always as identity (start with 1001),
  tenant_id    integer not null references tenants (id) on delete cascade,
  kind         text not null,
  change_type  text,
  title        text not null,
  details      text not null default '',
  link         text not null default '',
  status       text not null,
  needs_reply  boolean not null default true,
  created_by   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (kind in ('ticket', 'change')),
  check (
    (kind = 'ticket' and change_type is null and status in ('open', 'in_progress', 'resolved'))
    or (kind = 'change' and change_type in ('new_page', 'content_tweak', 'add_staff', 'other')
        and status in ('submitted', 'in_progress', 'done', 'declined'))
  ),
  check (char_length(title) between 1 and 200)
);
create index if not exists support_items_tenant_idx on support_items (tenant_id, updated_at desc);
create index if not exists support_items_queue_idx on support_items (status, updated_at);

create table if not exists support_messages (
  id           bigserial primary key,
  item_id      bigint not null references support_items (id) on delete cascade,
  tenant_id    integer not null references tenants (id) on delete cascade,
  from_team    boolean not null default false,
  internal     boolean not null default false,
  author_email text not null default '',
  body         text not null,
  created_at   timestamptz not null default now(),
  check (char_length(body) between 1 and 10000),
  check (not internal or from_team)
);
create index if not exists support_messages_item_idx on support_messages (item_id, created_at);

-- A new message moves its item: dealer wrote -> needs reply (and a resolved
-- ticket reopens); staff replied (not internal) -> no reply needed.
create or replace function support_message_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.internal then
    update support_items set updated_at = now() where id = new.item_id;
  elsif new.from_team then
    update support_items set needs_reply = false, updated_at = now() where id = new.item_id;
  else
    update support_items
       set needs_reply = true,
           updated_at = now(),
           status = case when kind = 'ticket' and status = 'resolved' then 'open' else status end
     where id = new.item_id;
  end if;
  return new;
end;
$$;
drop trigger if exists support_message_touch on support_messages;
create trigger support_message_touch after insert on support_messages
  for each row execute function support_message_touch();

alter table support_items enable row level security;
alter table support_messages enable row level security;

drop policy if exists "dealer support items" on support_items;
create policy "dealer support items" on support_items
  for select using (
    (select public.auth_email_verified())
    and exists (select 1 from tenants t where t.id = support_items.tenant_id and t.user_id = auth.uid())
  );
drop policy if exists "dealer open support items" on support_items;
create policy "dealer open support items" on support_items
  for insert with check (
    status in ('open', 'submitted')
    and needs_reply
    and (select public.auth_email_verified())
    and exists (select 1 from tenants t where t.id = support_items.tenant_id and t.user_id = auth.uid())
  );
drop policy if exists "team support items" on support_items;
create policy "team support items" on support_items
  for all using ((select public.is_team())) with check ((select public.is_team()));

drop policy if exists "dealer support messages" on support_messages;
create policy "dealer support messages" on support_messages
  for select using (
    not internal
    and (select public.auth_email_verified())
    and exists (select 1 from tenants t where t.id = support_messages.tenant_id and t.user_id = auth.uid())
  );
drop policy if exists "dealer send support messages" on support_messages;
create policy "dealer send support messages" on support_messages
  for insert with check (
    not from_team
    and not internal
    and (select public.auth_email_verified())
    and exists (select 1 from tenants t where t.id = support_messages.tenant_id and t.user_id = auth.uid())
    and exists (select 1 from support_items i where i.id = support_messages.item_id and i.tenant_id = support_messages.tenant_id)
  );
drop policy if exists "team support messages" on support_messages;
create policy "team support messages" on support_messages
  for all using ((select public.is_team())) with check ((select public.is_team()));

-- One-off: each site's old single Support thread (messages) becomes one
-- resolved ticket called "Earlier messages". Runs once per site: skipped when
-- that ticket already exists. The old messages table is left untouched.
do $migrate$
declare
  r record;
  new_id bigint;
begin
  for r in
    select m.tenant_id, min(m.created_at) as first_at, max(m.created_at) as last_at
      from messages m
     group by m.tenant_id
  loop
    if exists (select 1 from support_items where tenant_id = r.tenant_id and kind = 'ticket' and title = 'Earlier messages') then
      continue;
    end if;
    insert into support_items (tenant_id, kind, title, status, needs_reply, created_by, created_at, updated_at)
    values (r.tenant_id, 'ticket', 'Earlier messages', 'resolved', false, 'migration', r.first_at, r.last_at)
    returning id into new_id;
    alter table support_messages disable trigger support_message_touch;
    insert into support_messages (item_id, tenant_id, from_team, internal, author_email, body, created_at)
    select new_id, m.tenant_id, m.from_team, false, m.author_email, m.body, m.created_at
      from messages m where m.tenant_id = r.tenant_id order by m.created_at;
    alter table support_messages enable trigger support_message_touch;
  end loop;
end
$migrate$;
