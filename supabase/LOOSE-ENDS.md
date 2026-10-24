# Loose ends after the Group build (checked 24 Oct 2026)

Nothing here has been run. No SQL, no env, no Stripe, no pushes to any desk.

## 1. Template catch-up for older desks

- How desks are made: Office creates a private repo `mattgirvan/desk-<slug>` from the `mattgirvan/forecourt-desk` GitHub template (src/lib/server/desk-scaffold.ts). A desk only gets what the template had on the day it was made. There is no automatic push to older desks.
- The template is already up to date: forecourt-desk #5 (merged 24 Oct) carries migrations 0005 to 0007 and the site screens. They are byte identical to `desk-template/` here.
- Desks affected today: 0. No `desk-*` repo exists and no desk project exists on Vercel. Aberdeen is a separate prototype and is never part of this.
- Dry run: `node scripts/desk-template-catchup.mjs` lists every desk repo and the migration files it is missing. Read only.
- When the first desk made before a template change exists: copy the changed files into that desk repo in a PR, then run its missing migrations and, for multi site desks only, `scripts/golive/desk-sites-backfill.sh --desk <slug>` (dry run without `--yes`).

## 2. Desk-only SQL

Desk database only (never the Forecourt app database):
- `desk-template/supabase/migrations/0005_sites.sql`, `0006_sites_admin.sql`, `0007_forecourt_events.sql`
- `desk-template/supabase/backfill/0005_sites.backfill.sql` (existing multi site desks only, never a new desk)
- `supabase/desk-link-setup.sql` steps 2 and 3 (step 1 is the app database)

They are already in the template, so a new desk gets the files. This PR fixes the Office checklist, which still said "0001 to 0004", so new desks are told to run 0001 to 0007, enable pg_net and do the desk link steps. App side `supabase/desk-links.sql` must be run once on CENTRAL before the first desk link.

## 4. Stripe webhook before PLAN_CHANGE_SYNC

Code: `src/routes/api/stripe/webhook.ts` and `handleStripeWebhook` in `src/lib/server/payments.ts`.
- Signature: checked with `stripe.webhooks.constructEvent` on the raw body. Bad signature answers 400. Missing secret answers 500, so Stripe retries rather than losing events.
- Repeats: safe. A paid plan change is claimed only while it is `pending_payment`, a booked change only while `scheduled`, emails dedupe in `email_log`. No code is missing.

Set up in Stripe (test mode first, then live):
- Endpoint URL: `https://www.forecourt.me/api/stripe/webhook`
- Events:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
  - `invoice.payment_succeeded`
  - `invoice.paid`
- Signing secret: copy the `whsec_...` value into `STRIPE_WEBHOOK_SECRET` on the Vercel project `forecourt` (team skoda-aberdeen), Production. `SUPABASE_SERVICE_ROLE_KEY` and `STRIPE_SECRET_KEY` must also be set there. Redeploy after.

Test plan (Stripe test mode, PLAN_CHANGE_SYNC still off at first):
1. Add the endpoint in test mode with the events above and put the test `whsec_` on a Preview deployment, not Production.
2. Stripe dashboard, endpoint, Send test event `checkout.session.completed`: expect 200 or 422 (no matching order), never 400 or 500.
3. Change one character of the secret on the Preview and send again: expect 400 bad signature. Put it back.
4. Turn PLAN_CHANGE_SYNC on for the Preview only. On a test account, request an upgrade, pay with card 4242 4242 4242 4242: plan changes once, one email. Use Resend from the Stripe event page: still one change, no second email.
5. Request an upgrade and let the Checkout expire (or use the Expire button in the dashboard): the request is cancelled.
6. Book a downgrade and advance a test clock past the period end: `customer.subscription.updated` lands it.
7. Card 4000 0000 0000 0341 on a monthly invoice: Office shows "Monthly payment failed", then pay it: "recovered".
8. Only then add the live endpoint and live secret on Production, and decide on PLAN_CHANGE_SYNC.
