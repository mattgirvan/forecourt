-- Optional control-plane secrets fallback for Send to build.
-- Prefer Vercel env (GH_TEMPLATE_TOKEN on the `forecourt` project, Production).
-- Use this only when the Token chip still says missing after a Production deploy.
--
-- Forecourt control-plane Supabase SQL editor:
--   https://supabase.com/dashboard/project/hxodmtmrnpxzkfwhrsjg/sql
-- (Project URL https://hxodmtmrnpxzkfwhrsjg.supabase.co)
--
-- Safe to run more than once.
-- Fail-closed: RLS on, no policies → only the service role can read.
-- Never put the PAT in a VITE_ var or client-readable table.
-- Never paste the PAT into chat / Slack / email.

create table if not exists app_settings (
  key         text primary key,
  value       text not null default '',
  updated_at  timestamptz not null default now()
);

alter table app_settings enable row level security;

-- Intentionally no policies: anon / authenticated cannot select or write.
-- Service role bypasses RLS for the server-only fallback reader.

-- After this table exists, run ONE insert in the SQL editor (replace ghp_… yourself),
-- then delete that statement from the editor history if the dashboard keeps it:
--
-- insert into app_settings (key, value)
-- values ('GH_TEMPLATE_TOKEN', 'ghp_…')
-- on conflict (key) do update
--   set value = excluded.value, updated_at = now();
--
-- Also ensure SUPABASE_SERVICE_ROLE_KEY (or GROK_SUPABASE_SERVICE_ROLE_KEY)
-- is present on the same Vercel project that serves www.forecourt.me Production.
-- Without it the server cannot read this row.
