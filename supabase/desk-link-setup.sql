-- Per desk link setup (group build, PR 7). Run once per desk, by hand, after
-- desk-links.sql (app) and desk migration 0007 (desk). Not run by anyone yet.
--
-- 1. APP database. Make the pair. Replace :tenant_id and :key_id
--    (key id suggestion: desk_<tenant slug>). Keep the secret out of chat,
--    tickets and logs; copy it straight into step 2.
insert into public.desk_links (key_id, tenant_id, secret)
values (':key_id', :tenant_id, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key_id) do nothing
returning key_id;
--    Read it back only when pasting into step 2:
--    select secret from public.desk_links where key_id = ':key_id';

-- 2. DESK database (that tenant's own Supabase). Same key id and secret.
--    Nothing is sent until this row exists.
-- insert into public.forecourt_link (endpoint, key_id, secret)
-- values ('https://forecourt.me/api/desk/events', ':key_id', ':secret')
-- on conflict (id) do update set endpoint = excluded.endpoint, key_id = excluded.key_id, secret = excluded.secret;

-- 3. Check (desk): add nothing, just look at the queue.
-- select kind, site_code, email, sent_at, last_error from public.forecourt_events order by created_at desc limit 10;

-- Revoke a desk (app): update public.desk_links set revoked_at = now() where key_id = ':key_id';
