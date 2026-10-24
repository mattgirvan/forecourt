# Provision a rooftop

Do this after they have paid the pilot. Half a day once you have done it twice. **Never clone another customer's desk. Never share a database.**

The sales showcase they saw (forecourt.me homepage) is fictional. This template is what goes live.

## 0. From the order

You need, from `/account` or the briefing call:

- Group name, legal entity, phone, email
- Rooftop and sites
- Primary franchise (hex and word, for example `#2F6B4F` and `Northwind`)
- Extra franchises if it is a group
- Features on or off
- Ingest: Excel unless they have manufacturer credentials
- Staff: name, email, **role**, site, franchise
- Domain they want (`desk.theirname.co.uk`)

## 1. New repo from this template

```
gh repo create mattgirvan/desk-<slug> --private --template mattgirvan/forecourt-desk
gh repo clone mattgirvan/desk-<slug>
cd desk-<slug>
```

`<slug>` is the tenant slug, for example `harbour-park` or `ridgemont-motors`.

## 2. Brand pack: `tenant.json` only

Copy the order JSON into `tenant.json`. Set:

- `plan`: `trial`, `site`, `franchise` or `group`, from the order. Franchise is one brand with many sites. Missing or unknown counts as `site`.
- `name`, `legal`, `groupMark` (for example `HP`), `phone`, `email`, `domain`, `sites`
- `franchise.word`, `franchise.accent`, `franchise.glow`
- `franchises` only if `plan` is `group` and they wear more than one badge. A Trial, Site or Franchise pack has one brand: `npm run build` stops with "A Site account has one brand. Upgrade to Group to add more." (Trial and Site) or "A Franchise account has one brand. Upgrade to Group to add more." (Franchise), and the desk Admin screen shows the same line in grey.
- `features.*` from what they toggled
- `ingest`: `excel` | `html` | `api` | `manufacturer`
- `staff` with roles (see below)
- `seedDemo`: **false**

Drop their logo at `public/brand/logo.svg`. If it is not ready, the group mark letters show until it is.

Do not paste manufacturer logos unless they have given you the file they are allowed to use.

## 3. Roles: do not invent new ones

**Trial** (Matt and Atlas): **sales**, **management**, **host**, **progressor**. Not admin or accounts.

| Package | Roles in the box |
|---|---|
| Trial | sales, management, host, progressor |
| Site (subscribed) | plus admin, accounts |
| Group | plus principal. Every role scoped to `site` and optional `franchise` |

A showroom host is `host`. A vehicle progressor is `progressor`. Accounts get GP read, not the customer thread. Job title is `name`. Role is one of seven.

```json
"staff": [
  { "name": "Alex Reed", "email": "alex@group.co.uk", "role": "management", "site": "Harbour Park", "franchise": "northwind" }
]
```

Do not create a `northwind-host` role. That is `host`, on that site, with franchise `northwind`.

## 4. Data plane: new Supabase

1. Create a **new** Supabase project. Name it `forecourt-<slug>`.
2. Database, Extensions: enable **pg_net** (and pgcrypto if it is not already on). Migration 0007 posts desk events with pg_net. Without it events stay queued with `last_error` "pg_net not installed" and nothing fails, but nothing reaches Forecourt either.
3. SQL editor: paste the migrations in `supabase/migrations/` in order, one at a time. All are safe to re-run.
   1. `0001_core.sql`
   2. `0002_roles.sql`
   3. `0003_sales_readiness_rls.sql`
   4. `0004_staff_me_and_read_own.sql`
   5. `0005_sites.sql` (sites, staff_sites, staff_users.all_sites, site policies)
   6. `0006_sites_admin.sql` (site status and archive, my_site_list, my_site_access, admin staff site tools)
   7. `0007_forecourt_events.sql` (forecourt_link, forecourt_events queue, signed posts to Forecourt)
4. Authentication: enable magic link. Add the site URL (`https://desk...`).
5. Insert staff:

```sql
insert into staff_users (email, role, display_name, site, franchise) values
  ('gm@theirgroup.co.uk', 'management', 'Alex Reed', 'Harbour Park', 'northwind')
on conflict (email) do nothing;
```

6. Copy URL and publishable key into `.env` (and Vercel env):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

One client, one database, RLS on.

### Sites backfill: not for a fresh desk

A new desk starts as single site: scoping stays off until the `sites` table has rows. `supabase/backfill/0005_sites.backfill.sql` and the Forecourt script `04-desk-backfill.sh` (`scripts/golive/desk-sites-backfill.sh`) exist to switch scoping on for an **existing** desk that already has staff and data, with a backup first. A fresh desk does not need them. For a multi site customer, add their sites in Admin, Sites once the desk is live, or run the backfill only after a backup and Matt's yes for that desk.

## 5. Link the desk to Forecourt

Do this once per desk, after 0007 is in. Never paste the secret into chat, tickets or logs; copy it straight from step 1 into step 2.

**Step 1. CENTRAL (the Forecourt app database).** Make the pair. Replace `:tenant_id` and `:key_id` (key id suggestion: `desk_<slug>`). The secret is generated in the database.

```sql
insert into public.desk_links (key_id, tenant_id, secret)
values (':key_id', :tenant_id, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key_id) do nothing
returning key_id;
-- Read it back only when pasting into step 2:
-- select secret from public.desk_links where key_id = ':key_id';
```

**Step 2. DESK (this tenant's own Supabase).** Same key id and secret. Nothing is sent until this row exists.

```sql
insert into public.forecourt_link (endpoint, key_id, secret)
values ('https://forecourt.me/api/desk/events', ':key_id', ':secret')
on conflict (id) do update set endpoint = excluded.endpoint, key_id = excluded.key_id, secret = excluded.secret;
```

**Step 3. DESK check (read only).** Adds nothing, just looks at the queue.

```sql
select kind, site_code, email, sent_at, last_error from public.forecourt_events order by created_at desc limit 10;
```

Revoke a desk (CENTRAL): `update public.desk_links set revoked_at = now() where key_id = ':key_id';`

Worth one test event on the first real desk (add and archive a test site) to confirm pg_net delivery.

## 6. Ingest

**Excel or CSV (default).** Staff upload on the Stock tab. Upsert by VIN (`src/data/ingest.js`). That is week one for every rooftop.

**HTML drop.** Same upsert, different parser. Add only if they dump manufacturer HTML.

**Manufacturer feed.** Only with *their* credentials on *their* project. Implement `src/data/ingest.manufacturer.js`.

## 7. Ship

```
npm i
npx vercel link
npx vercel env pull
npx vercel --prod
```

Then in Vercel: custom domain `desk.theirname.co.uk`. In Supabase: add that URL to the Auth redirect allow list.

Send the GM: magic link login. Success metric stays: every live deal has a locator stage and a GP figure before month end.

## 8. What you still do by hand (on purpose)

| Request | How |
|---|---|
| Extra site | Admin, Sites in the desk (or `tenant.json` `sites`) |
| Second franchise | Group only: set `plan` to `group`, then `franchises[]` plus franchise pack. Not a new role |
| Turn off customer view | `features.customer: false` |
| Different locator labels | `src/config/locator.js`, franchise pack, not a fork |
| Expenses, overtime, buy in | Bespoke extras. Port behind a feature flag if they ask. Not default. |
| "Make it look like our website" | Brand pack only. The OS should still feel like Forecourt. |

If you are editing `App.jsx` to change the dealer name, you have left the product.

## After go live

Monthly billing starts here, not at checkout. Isolation is the default: another rooftop in the same group still gets its own database unless they are explicitly on Group and share a contract.
