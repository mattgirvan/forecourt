# Forecourt

The dealer operating system you already run — packaged for others.

**Live:** [forecourt.me](https://forecourt.me) · **Inbox:** [hello@forecourt.me](mailto:hello@forecourt.me)

**Two codebases. Do not mix them.**

| Repo | Job |
|---|---|
| **this one** (`forecourt`) | Product site, fictional demo desk, billing |
| [`forecourt-desk`](https://github.com/mattgirvan/forecourt-desk) | The actual portal you clone when someone orders |
| `skoda-aberdeen-portal` | Live Aberdeen site. Prototype. Never fork `App.jsx` for a client |

The demo a principal opens in another tab is **not** what goes live. After they pay, you clone `forecourt-desk`, drop `tenant.json`, stand up a new Supabase, point Vercel at their domain. Steps: [`desk-template/PROVISION.md`](./desk-template/PROVISION.md).

## What a principal sees (this repo)

- Product story
- Configure group + franchise, then **open a full-page demo** (fictional stock)
- How an order ships
- Account: package, brand pack, Stripe (trial or subscription)

## What you ship (the other repo)

[`forecourt-desk`](https://github.com/mattgirvan/forecourt-desk) remains the **ship source** — clone that template per order. `desk-template/` in this tree is a mirror for the control plane and must **not lag** desk `main` (including migrations, staff session / LoginGate, PROVISION, tenant schema, trial seats). Sync from desk; do not invent features here.

1. Brand pack → `tenant.json`
2. Clone template (not Aberdeen)
3. New database
4. Excel ingest, upsert-by-VIN
5. Custom domain + staff login

## Pricing

Three platforms. **Rooftop is not a word we use** — it is site, franchise, or group.

| Package | Trial | Setup | Monthly | Contract |
|---|---|---|---|---|
| **Site** | £1,500 for 60 days, credited if they stay | £4,500 | £399 | Month to month after trial |
| **Franchise** | None | £6,500 | £499 | 12 months |
| **Group** | None | £8,500 | £249 / site | 12 months |

The 60-day trial is **site only**. Franchise and group are a build. We do not stand those up on a maybe.

Site trial = sales, management, host, progressor. Subscribed site / franchise = + admin, accounts. Group adds principal.

Stripe: one-off payment for the site trial; subscription checkout (setup + recurring) for everything else. Convert a trial by paying remaining setup (£3,000) + £399/month.

Webhook: `POST /api/stripe/webhook`. Needs `STRIPE_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` on Vercel. Return-URL confirm still works without the webhook.

Billing columns: paste [`supabase/billing.sql`](./supabase/billing.sql) into the Forecourt Supabase SQL editor.

## Secrets (Vercel / server)

| Secret | Required for | Notes |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook | Fail-closed without it |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhook + admin | Control-plane Supabase only |
| `GH_TEMPLATE_TOKEN` | **Send to build** (Phase 1) | Fine-grained or classic PAT that can **create private repos from template** `mattgirvan/forecourt-desk`, read the template, and **Contents: write** on `desk-*` repos under `mattgirvan`. Aliases: `GITHUB_TEMPLATE_TOKEN`, `FORECOURT_GH_TEMPLATE_TOKEN`, `GROK_GH_TEMPLATE_TOKEN`, `NITRO_GH_TEMPLATE_TOKEN` (Nitro/Vercel docs path). Must be available to **Production** serverless (not Build-only). Read via `node:process` + dynamic key fallback; Nitro `runtimeConfig` + `environments.nitro.keepProcessEnv`. **Fail-closed** if missing. |
| `app_settings.GH_TEMPLATE_TOKEN` (optional) | Fallback only | If Vercel env never reaches `createServerFn`, paste [`supabase/app-settings.sql`](./supabase/app-settings.sql) and insert the PAT under key `GH_TEMPLATE_TOKEN`. Service-role read only (RLS, no policies). Prefer fixing Vercel env first. |

### Send to build runtime (important)

Scaffold + the staff Token chip run on TanStack **route server handlers** (`/api/build/send`, `/api/build/token-status`) — the same bundling path as `/api/stripe/webhook` — **not** `createServerFn`. Hypothesis: createServerFn on Vercel Nitro can see an empty `process.env` while route handlers see real Production secrets.

### Staff diagnostic (Office → Build)

Near the Token chip, staff see two lines of matching `process.env` **key names** (never values):

- `route:` — from `/api/build/token-status` (same path as Send to build)
- `serverFn:` — from `getBuild` createServerFn (comparison only)

What to look for after deploy:

- **Token configured (green) + `route:` lists `GH_TEMPLATE_TOKEN` or `GROK_GH_TEMPLATE_TOKEN`** → fixed; Send to build should work.
- **Token missing + `route:` has `VERCEL_*` but not GH keys** → secret still not on this project/env; check Vercel project that serves Production.
- **`route:` has GH keys but `serverFn:` does not** → confirms createServerFn empty-bag hypothesis; chip/scaffold correctly use the route path.
- **Both `(none matching)`** → env not reaching serverless at all (wrong project / Preview vs Production-only).
- If route handler also misses the token: paste [`supabase/app-settings.sql`](./supabase/app-settings.sql) and insert `GH_TEMPLATE_TOKEN` (service-role only).

Phase 1 does **not** create Supabase or Vercel projects. Those stay manual.

## Stack

Marketing: TanStack Start, Supabase, Stripe.  
Desk template: Vite + React + Supabase + Vercel (same shape as Aberdeen).
