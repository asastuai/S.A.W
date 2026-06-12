# SAW Perps -- SUR Adapter Live Integration Results

**Date (probe run):** 2026-06-12 (prior run — blocked by ESM bug)
**Date (adapter run):** 2026-06-12 (this run — ESM bug fixed at commit 9e5489b, adapter-driven)
**Network:** localnet (solana-test-validator 3.1.14)
**Operator:** `4gAdo7R69XgZJ2QazB1N2o21nfY2gjto9KijUDzjg6kv` (deployer key, throwaway localnet only)
**RPC:** `http://127.0.0.1:8899`
**Status:** DONE — SurAdapter drives all tx sigs. 27/27 PASS, 0 failures.

---

## Summary

`sur-venue.integration.ts` ran end-to-end via `makeSurAdapter` (commit 9e5489b, ESM fix).
All four critical tx sigs (long open/close, short open/close) are **adapter-driven** —
emitted by `sur-venue.ts` calling `openPerp` / `closePerp` / `pushMarkPrice` through the
`SurAdapterWithPushPrice` interface, not by the probe directly.

The prior run (f3e01b3) was blocked by a CJS named-import ESM crash (`BN` undefined).
That bug is now fixed at commit 9e5489b. No driver fixes were needed —
`sur-venue.integration.ts` was correct as written.

| Step | Source | Outcome | Tx Signature |
|------|--------|---------|-------------|
| LONG open (0.1 BTC @ $65,000) | **SurAdapter** | PASS | `4Gt3vCytBniVLqZ8Wzar7F1TzxeT4CB8AFZjjthi5EeutMbQJzs4imoLXSnP3nBS1uxEvYm6zbp26wkYb39qcger` |
| LONG close (@ $66,000, +$100) | **SurAdapter** | PASS | `3uTfCfbGZ2qB8dbdQeYjpT2ksUSu5SdEBRQRNpA5zs4z5Gdxf4h9xq3gyivZZUhyaRYrD5vHTka2jiciNKhnkxHY` |
| SHORT open (0.1 BTC @ $66,000) | **SurAdapter** | PASS | `4VTgdyZXACXt7t2g8uYLEaJoUckQxatuXzzqiRF8yTybJL1qru7gjvQCjM9JCxeZXZstgaqWxKaHthLShYr4djkn` |
| SHORT close (@ $65,000, +$100) | **SurAdapter** | PASS | `5chXFbKzpotukudP2ksARzTMTRbzcerLQ7qGnE1dAjFiY83YX7zkzdj4rjf5fLe4WeiQKYC69uD28x1kjcvVcFcH` |

**Prior (probe-driven, commit f3e01b3) — kept for reference only — NOT adapter-driven:**

| Step | Source | Outcome | Tx Signature |
|------|--------|---------|-------------|
| LONG open (probe) | probe | PASS | `pVnEyaR3aePB6wZGMPUSxJTKart8xzgk5zrK5yyJRKYM4pJT88LXBLL8TybWXH4NrXLfve73ZBW7zAffgouCBhY` |
| LONG close (probe) | probe | PASS | `5LTXeKq1Zz4iA8aBkTGJGgGJddM8jLHKBkjwaUyQSRT6n5w1A3cbStBKHfnX7fCsoGJtPubN4xmdxrSQuVqEFL2X` |
| SHORT open (probe) | probe | PASS | `2qwPC85kWMzg5RkpGRnNWEZk79wpqU49R371gBREfe5CcLZVjE8Q3j97jv4LcVuT4PuTrbjFMcQNhrheWKAb385R` |
| SHORT close (probe) | probe | PASS | `3nY4BTbuWm3bEYcWU5kf4oeFbKZdDTpfBfUVPvSK7VKsZgAGHk4hKbT45QToQK6FGG192m1RpAkAkMUK9U5BBA6k` |

---

## SurAdapter Integration Suite -- Full Results (27/27 PASS)

Run via: `VENUE=sur VENUE_ENV=localnet VENUE_RPC_URL=http://127.0.0.1:8899 pnpm exec tsx src/lib/sur-venue.integration.ts`

```
=== SurAdapter Integration Suite -- SUR Localnet ===
Date: 2026-06-12T17:58:10.510Z

Operator (deployer): 4gAdo7R69XgZJ2QazB1N2o21nfY2gjto9KijUDzjg6kv
RPC: http://127.0.0.1:8899

[1] makeSurAdapter
  PASS makeSurAdapter

[2] ensureUserInitialized
  PASS ensureUserInitialized (first call)
  PASS ensureUserInitialized (idempotent)

[3] getFloatBalanceUsdc
  PASS getFloatBalanceUsdc  1200.00 USDC

[4] ensureDeposited
  PASS ensureDeposited(1000) -- pass
  PASS ensureDeposited(999999999) -- correctly throws  insufficient float: have 1200.00 USDC, need 999999999.00 USDC

[5] pushMarkPrice($65,000)
  PASS pushMarkPrice(65000)

[6] getOraclePrice
  PASS getOraclePrice -> $65,000  $65000.00

[7] hasOpenOrderWithUserOrderId (before open)
  PASS hasOpenOrderWithUserOrderId(42) = false

[8] openPerp LONG (3250 USDC x2 @ $65k)
  PASS openPerp LONG  txSig=4Gt3vCytBniVLqZ8Wzar7F1TzxeT4CB8AFZjjthi5EeutMbQJzs4imoLXSnP3nBS1uxEvYm6zbp26wkYb39qcger
    TX SIG (long open): 4Gt3vCytBniVLqZ8Wzar7F1TzxeT4CB8AFZjjthi5EeutMbQJzs4imoLXSnP3nBS1uxEvYm6zbp26wkYb39qcger

[9] getPositions (expect 1 long)
  PASS getPositions -> 1 long  entry=$65000.00 mark=$65000.00 uPnL=0.00 liq=$63375.00
  PASS   stopLoss = null (GAP-1 confirmed)
  PASS   takeProfit = null (GAP-1 confirmed)

[10] hasOpenOrderWithUserOrderId (after open -> true)
  PASS hasOpenOrderWithUserOrderId(42) = true

[11] pushMarkPrice($66,000) + closePerp LONG
  PASS pushMarkPrice(66000) before close
  PASS closePerp LONG  txSig=3uTfCfbGZ2qB8dbdQeYjpT2ksUSu5SdEBRQRNpA5zs4z5Gdxf4h9xq3gyivZZUhyaRYrD5vHTka2jiciNKhnkxHY
    TX SIG (long close): 3uTfCfbGZ2qB8dbdQeYjpT2ksUSu5SdEBRQRNpA5zs4z5Gdxf4h9xq3gyivZZUhyaRYrD5vHTka2jiciNKhnkxHY

[12] getPositions (expect [])
  PASS getPositions -> [] (long closed)

[13] closePerp again (expect alreadyClosed)
  PASS closePerp second call -> { alreadyClosed: true }

[14] pushMarkPrice($66,000) + openPerp SHORT (3300 USDC x2)
  PASS pushMarkPrice(66000) before short open
  PASS openPerp SHORT  txSig=4VTgdyZXACXt7t2g8uYLEaJoUckQxatuXzzqiRF8yTybJL1qru7gjvQCjM9JCxeZXZstgaqWxKaHthLShYr4djkn
    TX SIG (short open): 4VTgdyZXACXt7t2g8uYLEaJoUckQxatuXzzqiRF8yTybJL1qru7gjvQCjM9JCxeZXZstgaqWxKaHthLShYr4djkn

[15] getPositions (expect 1 short)
  PASS getPositions -> 1 short  entry=$66000.00 mark=$66000.00 uPnL=0.00 liq=$67650.00
  PASS   stopLoss = null (GAP-1 confirmed)
  PASS   takeProfit = null (GAP-1 confirmed)

[16] pushMarkPrice($65,000) + closePerp SHORT
  PASS pushMarkPrice(65000) before short close
  PASS closePerp SHORT  txSig=5chXFbKzpotukudP2ksARzTMTRbzcerLQ7qGnE1dAjFiY83YX7zkzdj4rjf5fLe4WeiQKYC69uD28x1kjcvVcFcH
    TX SIG (short close): 5chXFbKzpotukudP2ksARzTMTRbzcerLQ7qGnE1dAjFiY83YX7zkzdj4rjf5fLe4WeiQKYC69uD28x1kjcvVcFcH

[17] getPositions (expect [])
  PASS getPositions -> [] (short closed)

[18] disconnect
  PASS disconnect (no-op)

=== SUMMARY ===
Status: DONE  (27 passed, 0 failed)

TX SIGS:
  long  open : 4Gt3vCytBniVLqZ8Wzar7F1TzxeT4CB8AFZjjthi5EeutMbQJzs4imoLXSnP3nBS1uxEvYm6zbp26wkYb39qcger
  long  close: 3uTfCfbGZ2qB8dbdQeYjpT2ksUSu5SdEBRQRNpA5zs4z5Gdxf4h9xq3gyivZZUhyaRYrD5vHTka2jiciNKhnkxHY
  short open : 4VTgdyZXACXt7t2g8uYLEaJoUckQxatuXzzqiRF8yTybJL1qru7gjvQCjM9JCxeZXZstgaqWxKaHthLShYr4djkn
  short close: 5chXFbKzpotukudP2ksARzTMTRbzcerLQ7qGnE1dAjFiY83YX7zkzdj4rjf5fLe4WeiQKYC69uD28x1kjcvVcFcH
```

---

## getPositions() Reads -- Adapter-Driven

### After openPerp LONG (0.1 BTC @ $65,000, 2x leverage)

```json
{
  "market": "BTC-USD",
  "side": "long",
  "baseSize": 0.1,
  "entryPrice": 65000.00,
  "markPrice": 65000.00,
  "unrealizedPnlUsdc": 0.00,
  "liqPrice": 63375.00,
  "stopLoss": null,
  "takeProfit": null
}
```

Formula: liqPrice = 65000 - (325 - 0.025 * 6500) / 0.1 = $63,375.00 (confirmed)
uPnL at entry = 0.00 (confirmed -- mark == entry)

### After openPerp SHORT (0.1 BTC @ $66,000, 2x leverage)

```json
{
  "market": "BTC-USD",
  "side": "short",
  "baseSize": 0.1,
  "entryPrice": 66000.00,
  "markPrice": 66000.00,
  "unrealizedPnlUsdc": 0.00,
  "liqPrice": 67650.00,
  "stopLoss": null,
  "takeProfit": null
}
```

Formula: liqPrice = 66000 + (330 - 0.025 * 6600) / 0.1 = $67,650.00 (confirmed)
uPnL at entry = 0.00 (confirmed -- mark == entry)

---

## Integration Driver Fixes Applied

None. `sur-venue.integration.ts` is correct as written -- no changes made.
The prior blocker was in `sur-venue.ts` (production code, fixed at commit 9e5489b).

---

## Localnet Runbook (verified 2026-06-12)

All steps must run in ONE shell session. Background processes die across separate
`wsl.exe -d Ubuntu` invocations (WSL process boundary reaps them).

```bash
# 1. Kill stale validator
pkill -f solana-test-validator 2>/dev/null || true; sleep 2

# 2. Launch validator -- use --bpf-program keypair.json .so
#    DO NOT use Anchor.toml [programs.localnet] -- those IDs are stale
DEPLOY=~/projects/sur-protocol-solana/target/deploy
solana-test-validator \
  --bpf-program "$DEPLOY/perp_vault-keypair.json"         "$DEPLOY/perp_vault.so" \
  --bpf-program "$DEPLOY/perp_engine-keypair.json"        "$DEPLOY/perp_engine.so" \
  --bpf-program "$DEPLOY/oracle_router-keypair.json"      "$DEPLOY/oracle_router.so" \
  --bpf-program "$DEPLOY/a2a_darkpool-keypair.json"       "$DEPLOY/a2a_darkpool.so" \
  --bpf-program "$DEPLOY/auto_deleveraging-keypair.json"  "$DEPLOY/auto_deleveraging.so" \
  --bpf-program "$DEPLOY/collateral_manager-keypair.json" "$DEPLOY/collateral_manager.so" \
  --bpf-program "$DEPLOY/insurance_fund-keypair.json"     "$DEPLOY/insurance_fund.so" \
  --bpf-program "$DEPLOY/liquidator-keypair.json"         "$DEPLOY/liquidator.so" \
  --bpf-program "$DEPLOY/order_settlement-keypair.json"   "$DEPLOY/order_settlement.so" \
  --bpf-program "$DEPLOY/sur_timelock-keypair.json"       "$DEPLOY/sur_timelock.so" \
  --bpf-program "$DEPLOY/trading_vault-keypair.json"      "$DEPLOY/trading_vault.so" \
  --reset --quiet &
VALIDATOR_PID=$!

# 3. Wait for health
until curl -sf http://127.0.0.1:8899/health >/dev/null 2>&1; do sleep 1; done

# 4. Run probe (init vault + oracle + engine + operators + bootstrap pool + BTC-USD market + fund)
cd ~/projects/sur-protocol-solana
npx ts-node scripts/sur-adapter-probe.ts

# 5. Run integration suite
cd ~/projects/saw/worker
VENUE=sur VENUE_ENV=localnet VENUE_RPC_URL=http://127.0.0.1:8899 \
  pnpm exec tsx src/lib/sur-venue.integration.ts

# 6. Kill validator
kill $VALIDATOR_PID
```

---

## Program IDs

| Program | Address |
|---------|---------|
| `perp_engine` | `28pVZVVY2MyxmukdDTcz85zD88TsfDBhqovgU6ARW6SX` |
| `perp_vault` | `2iidk56xin9riWJDdfR9BpFU3sLH4oZbPwQrK64Y3xf1` |
| `oracle_router` | `8yLenSHEkdkbsCiQLmiQrZg7Kdb3ZBb1MKTFmJsA37zk` |

Devnet IDs = localnet IDs (programs compiled once with these `declare_id!` values).
