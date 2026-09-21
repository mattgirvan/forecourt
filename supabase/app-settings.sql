-- Optional control-plane secrets fallback for Send to build.
-- Prefer Vercel env (GH_TEMPLATE_TOKEN). Use this only when the PAT never
-- reaches createServerFn / Nitro on Production.
--
-- Paste into the Forecourt control-plane Supabase SQL editor
-- (https://hxodmtmrnpxzkfwhrsjg.supabase.co). Safe to run more than once.
--
-- Fail-closed: RLS enabled with NO policies → only the service role can read.
-- Never put the PAT in a VITE_ var or client-readable table.

create table if not exists app_settings (
  key         text primary key,
  value       text not null default '',
  updated_at  timestamptz not null default now()
);

alter table app_settings enable row level security;

-- Intentionally no policies: anon / authenticated cannot select or write.
-- Service role bypasses RLS for the server-only fallback reader.

-- Example (run once, then delete from history if you paste the PAT here):
-- insert into app_settings (key, value)
-- values ('GH_TEMPLATE_TOKEN', 'ghp_…')
-- on conflict (key) do update
--   set value = excluded.value, updated_at = now();
