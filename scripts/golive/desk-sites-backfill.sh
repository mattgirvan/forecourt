#!/usr/bin/env bash
# 04: switch site scoping on for ONE existing desk, with a backup first.
# Files only. Do not run without Matt's yes for that desk.
#
#   DESK_DB_URL=postgres://... scripts/golive/desk-sites-backfill.sh --desk <slug> --yes
#
# Steps, stopping at the first error:
#   1. pg_dump a data backup of the tables the backfill reads or writes.
#   2. Apply desk migrations 0005_sites.sql and 0006_sites_admin.sql (safe to re-run).
#   3. Run backfill/0005_sites.backfill.sql in one transaction.
# Never touches the Forecourt app database or Stripe.
set -euo pipefail
desk="" yes=""
while [ $# -gt 0 ]; do
  case "$1" in
    --desk) desk="${2:-}"; shift 2 ;;
    --yes) yes=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
[ -n "$desk" ] || { echo "Pass --desk <slug>." >&2; exit 2; }
[ -n "${DESK_DB_URL:-}" ] || { echo "Set DESK_DB_URL for that desk." >&2; exit 2; }
if [ -z "$yes" ]; then
  echo "Dry run for $desk. Nothing was changed. Add --yes once Matt has said yes for this desk."
  exit 0
fi
here="$(cd "$(dirname "$0")/../.." && pwd)"
mig="$here/desk-template/supabase/migrations"
bf="$here/desk-template/supabase/backfill"
out="backups/$desk-$(date +%Y%m%d-%H%M%S).sql"
mkdir -p backups
echo "1/3 Backup to $out"
pg_dump --data-only -t public.staff_users -t public.orders -t public.stock -t public.briefs -t public.messages "$DESK_DB_URL" > "$out"
[ -s "$out" ] || { echo "Backup is empty, stopping." >&2; exit 1; }
echo "2/3 Migrations 0005 and 0006"
psql "$DESK_DB_URL" -v ON_ERROR_STOP=1 -f "$mig/0005_sites.sql" -f "$mig/0006_sites_admin.sql"
echo "3/3 Backfill"
psql "$DESK_DB_URL" -v ON_ERROR_STOP=1 -1 -f "$bf/0005_sites.backfill.sql"
echo "Done for $desk. Backup kept at $out."
