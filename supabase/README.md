# Forecourt control plane

Project: `https://hxodmtmrnpxzkfwhrsjg.supabase.co`

This is the **office** — sign-in, tenants, orders. Not Aberdeen. Not a customer desk.

## Once

1. SQL editor → paste `control-plane.sql` → run
2. Authentication → URL configuration
   - Site URL: `https://www.forecourt.me`
   - Redirects: `https://www.forecourt.me/**` and `https://forecourt.me/**`
3. Authentication → Providers → Email on (magic link)
4. Settings → API → copy the **anon / publishable** key
5. Vercel (Forecourt project) → Environment variables:
   - `VITE_SUPABASE_URL` = `https://hxodmtmrnpxzkfwhrsjg.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = that key
6. Redeploy

Do not put the service-role key in Vercel `VITE_` vars. Do not paste Aberdeen keys here.
