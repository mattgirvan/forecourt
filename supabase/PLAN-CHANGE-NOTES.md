# 05 Account type change (group build PR 5)

Not run. No SQL on live, no Stripe or env changes.

- Customer (Billing tab, live accounts only) and Office (account Billing pane) share one panel.
- Preview before confirming: setup difference, pro-rated amount, new monthly.
- Upgrade: a Checkout for the setup difference only. plan_changes row waits in pending_payment.
  The Stripe webhook (metadata kind plan_change) checks the amount, swaps the subscription lines
  (pro-rated) and only then sets tenants.plan. Retries are safe.
- Downgrade: no setup refund. `DOWNGRADE_TIMING` in src/lib/plan-change.ts is the one switch:
  "period_end" (default, provisional) changes the price with no proration so it lands on the next
  bill; "now" pro-rates a credit. The plan label switches at once in both cases.
- Gate: Stripe is only touched when PLAN_CHANGE_SYNC is exactly "on". Unset = dry run: preview
  works, nothing is charged, plan unchanged.
- SQL: supabase/plan-changes.sql (= 05-plan-changes.sql). Run after 03 and 04.
