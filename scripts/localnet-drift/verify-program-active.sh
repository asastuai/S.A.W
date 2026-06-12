#!/usr/bin/env bash
# Verifica si dRiftyHA recibe invocaciones DIRECTAS en mainnet (¿es el programa de trading activo?)
set -uo pipefail
URL="https://api.mainnet-beta.solana.com"
PROG="dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH"

sigs=$(solana transaction-history "$PROG" --url "$URL" --limit 25 2>/dev/null | head -25)
direct=0
checked=0
for sig in $sigs; do
  [[ ${#sig} -lt 60 ]] && continue
  checked=$((checked+1))
  logs=$(solana confirm "$sig" --url "$URL" -v 2>/dev/null)
  if grep -q "Program $PROG invoke" <<<"$logs"; then
    direct=$((direct+1))
    if [[ $direct -eq 1 ]]; then
      echo "=== PRIMERA INVOCACIÓN DIRECTA: $sig ==="
      grep -A2 "Program $PROG invoke" <<<"$logs" | head -8
    fi
  fi
  sleep 0.3
done
echo ""
echo "RESULTADO: $direct de $checked txs recientes invocan dRiftyHA directamente"
