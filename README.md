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
| `GH_TEMPLATE_TOKEN` | **Send to build** (Phase 1) | Fine-grained or classic PAT that can **create private repos from template** `mattgirvan/forecourt-desk`, read the template, and **Contents: write** on `desk-*` repos under `mattgirvan`. Aliases accepted: `GITHUB_TEMPLATE_TOKEN`, `FORECOURT_GH_TEMPLATE_TOKEN`, `GROK_GH_TEMPLATE_TOKEN`. Read via static `node:process` env refs so Nitro/Vite cannot empty-snapshot the secret at build time. **Fail-closed** if missing — Office will not leave an orphan queued job. |

Phase 1 does **not** create Supabase or Vercel projects. Those stay manual.

## Stack

Marketing: TanStack Start, Supabase, Stripe.  
Desk template: Vite + React + Supabase + Vercel (same shape as Aberdeen).
