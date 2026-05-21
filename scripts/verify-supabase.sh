#!/usr/bin/env bash
# Probes every SAW table via Supabase REST to confirm migration applied.

set -u

URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [ -z "$URL" ] || [ -z "$KEY" ]; then
  source web/.env.local 2>/dev/null || true
  URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
  KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
fi

if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  exit 1
fi

TABLES=(handlers byok_keys agents scheduled_items opportunities chat_messages llm_usage agent_wakes fee_ledger)
PASS=0
FAIL=0

for t in "${TABLES[@]}"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "${URL}/rest/v1/${t}?select=id&limit=0" \
    -H "apikey: ${KEY}" \
    -H "Authorization: Bearer ${KEY}")
  if [ "$CODE" = "200" ]; then
    printf "  ✓ %-20s HTTP %s\n" "$t" "$CODE"
    PASS=$((PASS+1))
  else
    printf "  ✗ %-20s HTTP %s\n" "$t" "$CODE"
    FAIL=$((FAIL+1))
  fi
done

echo ""
echo "Result: $PASS pass, $FAIL fail (of ${#TABLES[@]})"
[ "$FAIL" -eq 0 ]
