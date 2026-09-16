# Forecourt

The dealer operating system you already run — packaged for others.

**Live:** [forecourt.me](https://forecourt.me) · **Inbox:** [hello@forecourt.me](mailto:hello@forecourt.me)

**Two codebases. Do not mix them.**

| Repo | Job |
|---|---|
| **this one** (`forecourt`) | Product site, fictional demo desk, paid pilot |
| [`forecourt-desk`](https://github.com/mattgirvan/forecourt-desk) | The actual portal you clone when someone orders |
| `skoda-aberdeen-portal` | Live Aberdeen rooftop. Prototype. Never fork `App.jsx` for a client |

The demo a principal opens in another tab is **not** what goes live. After they pay, you clone `forecourt-desk`, drop `tenant.json`, stand up a new Supabase, point Vercel at their domain. Steps: [`desk-template/PROVISION.md`](./desk-template/PROVISION.md).

## What a principal sees (this repo)

- Product story
- Configure group + franchise, then **open a full-page demo** (fictional stock)
- How an order ships
- Account: brand pack, features, Stripe pilot

## What you ship (the other repo)

See `desk-template/` in this tree (canonical copy) and the GitHub template `mattgirvan/forecourt-desk`.

1. Brand pack → `tenant.json`
2. Clone template (not Aberdeen)
3. New database
4. Excel ingest, upsert-by-VIN
5. Custom domain + staff login

## Pricing

| Plan | Now | Later |
|---|---|---|
| 60-day pilot | £1,500 one-off, credited to setup | — |
| Site | not on a card | £4,500 setup + £399/mo from go-live |
| Group | not on a card | £8,500 + £249/site/mo |

## Stack

Marketing: TanStack Start, Postgres, Better Auth, Stripe.  
Desk template: Vite + React + Supabase + Vercel (same shape as Aberdeen).
