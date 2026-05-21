#!/usr/bin/env bash
# Push selected env vars from web/.env.local to Vercel production.
# Uses `vercel env add --force --yes` so it overwrites existing values.

set -e

ENV_FILE="web/.env.local"
ENVIRONMENT="${1:-production}"

VARS=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  SAW_BYOK_ENC_KEY
  NEXT_PUBLIC_PRIVY_APP_ID
  PRIVY_APP_SECRET
  NEXT_PUBLIC_SENTRY_DSN
  NEXT_PUBLIC_POSTHOG_KEY
  NEXT_PUBLIC_POSTHOG_HOST
  CRON_SECRET
  NEXT_PUBLIC_SAW_TREASURY
)

for V in "${VARS[@]}"; do
  LINE=$(grep -E "^${V}=" "$ENV_FILE" | head -1 || true)
  if [ -z "$LINE" ]; then
    echo "[skip] $V — not in $ENV_FILE"
    continue
  fi
  VAL="${LINE#*=}"
  printf '[setting] %s → %s\n' "$V" "$ENVIRONMENT"
  printf '%s' "$VAL" | vercel env add "$V" "$ENVIRONMENT" --force --yes 2>&1 | tail -1
done

echo ""
echo "Done. Run 'vercel --prod' to redeploy with the new env vars."
