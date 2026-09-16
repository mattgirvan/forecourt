# Forecourt control plane

Project: `https://hxodmtmrnpxzkfwhrsjg.supabase.co`

This is the **office** — sign-in, tenants, orders. Not Aberdeen. Not a customer desk.

## Once

1. SQL editor → paste `control-plane.sql` → run
2. Authentication → URL configuration
   - Site URL: `https://www.forecourt.me`
   - Redirects: `https://www.forecourt.me/**` and `https://forecourt.me/**`
3. Authentication → Providers → Email on (magic link)
4. Settings → API → anon key is already in the app (public by design; RLS holds the line)
5. Redeploy Forecourt on Vercel (the next git push does this)

Do not put the service-role key in Vercel `VITE_` vars. Do not paste Aberdeen keys here.
