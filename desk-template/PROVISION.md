# Provision a rooftop

Do this after they have paid the pilot. Half a day once you have done it twice. **Never clone Aberdeen. Never share a database.**

The sales demo they clicked (Forecourt `/demo`) is fictional. This template is what goes live.

## 0. From the order

You need, from `/account` or the briefing call:

- Group name, legal entity, phone, email
- Rooftop / sites
- Primary franchise (hex + word — e.g. Audi `#BB0A30`)
- Features on/off
- Ingest: Excel unless they have manufacturer credentials
- Staff emails
- Domain they want (`portal.theirname.co.uk`)

## 1. New repo from this template

```
gh repo create mattgirvan/desk-<slug> --private --template mattgirvan/forecourt-desk
gh repo clone mattgirvan/desk-<slug>
cd desk-<slug>
```

`<slug>` is the tenant slug: `harbour-park`, `ridgemont-harrogate`.

## 2. Brand pack — `tenant.json` only

Copy the order JSON into `tenant.json`. Set:

- `name`, `legal`, `groupMark` (e.g. `JC`), `phone`, `email`, `domain`, `sites`
- `franchise.word`, `franchise.accent`, `franchise.glow`
- `features.*` from what they toggled
- `ingest`: `excel` | `html` | `api` | `manufacturer`
- `staff`: every advisor email
- `seedDemo`: **false**

Drop their logo at `public/brand/logo.svg`. If it is not ready, the group mark letters show until it is.

Do not paste manufacturer logos unless they have given you the file they are allowed to use.

## 3. Data plane — new Supabase

1. Create a **new** Supabase project. Name it `forecourt-<slug>`.
2. SQL editor: paste `supabase/migrations/0001_core.sql`.
3. Authentication → enable magic link. Add the site URL (`https://portal…`).
4. Insert staff:

```sql
insert into staff_users (email) values
  ('gm@theirgroup.co.uk')
on conflict do nothing;
```

5. Copy URL + anon key into `.env` (and Vercel env):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

Aberdeen’s project is out of bounds. One client, one database, RLS on.

## 4. Ingest

**Excel / CSV (default).** Staff upload on the Stock tab. Upsert by VIN (`src/data/ingest.js`). That is week one for every rooftop.

**HTML drop** — same upsert, different parser. Add only if they dump manufacturer HTML.

**Manufacturer feed** — only with *their* credentials on *their* project. Implement `src/data/ingest.manufacturer.js`. Škoda UK ingest from Aberdeen is an adapter you can port; it is not the core.

## 5. Ship

```
npm i
npx vercel link
npx vercel env pull
npx vercel --prod
```

Then in Vercel: custom domain `portal.theirname.co.uk`. In Supabase: add that URL to Auth redirect allow-list.

Send the GM: magic-link login. Success metric stays: every live deal has a locator stage and a GP figure before month-end.

## 6. What you still do by hand (on purpose)

| Request | How |
|---|---|
| Extra site | Add to `tenant.json` `sites` |
| Turn off customer glass | `features.customer: false` |
| Different locator labels | `src/config/locator.js` — franchise pack, not a fork |
| Expenses / overtime / buy-in | Aberdeen-only extras. Port behind a feature flag if they ask. Not default. |
| “Make it look like our website” | Brand pack only. The OS should still feel like Forecourt glass. |

If you are editing `App.jsx` to change the dealer name, you have left the product.

## After go-live

Monthly billing starts here, not at checkout. Keep this repo. The next rooftop in the same group gets another tenant file on the **same** codebase if they share a group instance — or another clone if they need isolation. Isolation is the default.
