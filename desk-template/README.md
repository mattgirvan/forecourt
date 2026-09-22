# Forecourt desk

> Mirror inside `forecourt`. **Ship from** [`mattgirvan/forecourt-desk`](https://github.com/mattgirvan/forecourt-desk) — keep this folder in step with desk `main`.


This is the **product** you ship when a rooftop orders.

It is **not** the Forecourt marketing site, and it is **not** a fork of `skoda-aberdeen-portal`. Aberdeen stays the live prototype. This template is the white-label that every new client is built from.

```
forecourt                 marketing + fictional demo + checkout
forecourt-desk            ← this repo — clone per order
skoda-aberdeen-portal     live Aberdeen rooftop. Do not copy App.jsx.
```

## What you edit for a client

| File | Why |
|---|---|
| `tenant.json` | Name, franchise colour, sites, feature flags, staff emails, ingest |
| `public/brand/logo.svg` | Their mark. If missing, the group letters are used |
| `.env` | **Their** Supabase project. Never Aberdeen’s |

You do **not** edit `src/App.jsx` to change the name on the desk.

## Run locally

```
npm install
npm run dev
```

Works without Supabase (in-memory). Set `seedDemo: true` in `tenant.json` if you want sample rows while wiring. Leave it `false` when you go live.

## Ship an order

See [PROVISION.md](./PROVISION.md). Short version: GitHub template → fill `tenant.json` → new Supabase → Vercel + domain.

## Stack

Vite, React, Supabase, Vercel. Same shape as the live portal so the jump from Aberdeen is small. Manufacturer ingest is an adapter (`src/data/ingest.js`), not a second app.
