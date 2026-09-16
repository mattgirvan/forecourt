-- Forecourt billing: site / franchise / group.
-- Paste into the SQL editor on https://hxodmtmrnpxzkfwhrsjg.supabase.co
-- Safe to run more than once.

alter table tenants add column if not exists billing text not null default 'trial';
alter table tenants add column if not exists site_count integer not null default 1;
alter table tenants add column if not exists stripe_customer_id text;
alter table tenants add column if not exists stripe_subscription_id text;
alter table tenants add column if not exists term_months integer;
alter table tenants add column if not exists trial_ends_at timestamptz;

alter table orders add column if not exists kind text not null default 'trial';
alter table orders add column if not exists stripe_subscription_id text;
alter table orders add column if not exists site_count integer not null default 1;

update tenants
   set plan = 'site',
       billing = 'trial'
 where plan = 'pilot';

update orders
   set kind = 'trial'
 where plan = 'pilot' and kind is distinct from 'subscription';
