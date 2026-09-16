# Forecourt control plane

Project: `https://hxodmtmrnpxzkfwhrsjg.supabase.co`

This is the **office** — sign-in, tenants, orders. Not Aberdeen. Not a customer desk.

## Once

1. SQL editor → paste `control-plane.sql` → run
2. SQL editor → paste `billing.sql` → run (site / franchise / group + Stripe columns)
3. Authentication → URL configuration
   - Site URL: `https://www.forecourt.me`
   - Redirects: `https://www.forecourt.me/**` and `https://forecourt.me/**`
4. Authentication → Providers → Email on (magic link)
5. Settings → API → anon key is already in the app (public by design; RLS holds the line)
7. SQL editor → paste `portal.sql` → run (dealer notes, support messages, team office)
8. Redeploy Forecourt on Vercel (the next git push does this)

Stripe webhook (optional, return-URL confirm still works): `https://www.forecourt.me/api/stripe/webhook`
Needs `STRIPE_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` on Vercel. Do not put the service-role key in `VITE_` vars.

Do not paste Aberdeen keys here.
