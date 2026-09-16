# Forecourt

The dealer operating system you already run — packaged for others.

Stock, deals, GP, locator, customer journey. Built from live use at a franchised rooftop, sold as a white-label instance. **One codebase. One tenant JSON. Never a fork.**

This repo is the product site, the working desk template, paid-pilot checkout, and the provision model. The Aberdeen portal stays in `skoda-aberdeen-portal`. Do not copy `App.jsx` per client.

## What a principal sees

- Product story and a **clickable desk** (fictional dealers)
- How an order ships (brand pack → JSON → ingest adapter → domain)
- Commercial: paid 60-day pilot on a card; Site / Group invoiced after go-live
- Account: sign in, drop a brand pack, toggle features, pay Stripe

## Pricing (challenged)

| Plan | Now | Later |
|---|---|---|
| 60-day pilot | £1,500 one-off, credited to setup | — |
| Site | not on a card | £4,500 setup + £399/mo from go-live |
| Group | not on a card | £8,500 + £249/site/mo |

£349/mo was too cheap to look like a system. Monthly is not taken until the second rooftop can be stood up from config.

## Tenant file

See `tenants/harbour-park.json`. Features on/off, ingest adapter, sites. The desk reads that shape. Manufacturer ingest is an adapter (upsert-by-VIN), not a second app.

## Provision (the actual product)

1. Brand pack (logo, hex, names, phone, domain)
2. Tenant JSON — no App.jsx edits
3. Data plane — own rows, never share Aberdeen
4. Ingest — Excel now, manufacturer only with their credentials
5. Ship — custom domain + staff login

## Stack

TanStack Start, Postgres, Better Auth (Google / X), Stripe Checkout for the pilot.

## Legal

Manufacturer marks do not ship. Feed credentials stay on the client’s account. Demo data is fictional.
