# SAW Perps -- SUR Adapter Live Integration Results

**Date:** 2026-06-12
**Network:** localnet (solana-test-validator 3.1.14)
**Operator:** `4gAdo7R69XgZJ2QazB1N2o21nfY2gjto9KijUDzjg6kv` (deployer key, throwaway localnet only)
**RPC:** `http://127.0.0.1:8899`
**Status:** DONE_WITH_CONCERNS -- probe clean, integration suite blocked by CRITICAL ESM bug in sur-venue.ts

---

## Summary

The `sur-adapter-probe.ts` ran end-to-end on localnet with all four tx sigs confirmed.
The integration suite (`sur-venue.integration.ts`) was blocked by a CRITICAL import bug in
`sur-venue.ts` that prevents the file from loading in the ESM worker context.
The integration driver script itself requires no changes.

| Step | Source | Outcome | Tx Signature |
|------|--------|---------|-------------|
| LONG open (0.1 BTC @ $65,000) | probe | PASS | `pVnEyaR3aePB6wZGMPUSxJTKart8xzgk5zrK5yyJRKYM4pJT88LXBLL8TybWXH4NrXLfve73ZBW7zAffgouCBhY` |
| LONG close (@ $66,000, +$100) | probe | PASS | `5LTXeKq1Zz4iA8aBkTGJGgGJddM8jLHKBkjwaUyQSRT6n5w1A3cbStBKHfnX7fCsoGJtPubN4xmdxrSQuVqEFL2X` |
| SHORT open (0.1 BTC @ $66,000) | probe | PASS | `2qwPC85kWMzg5RkpGRnNWEZk79wpqU49R371gBREfe5CcLZVjE8Q3j97jv4LcVuT4PuTrbjFMcQNhrheWKAb385R` |
| SHORT close (@ $65,000, +$100) | probe | PASS | `3nY4BTbuWm3bEYcWU5kf4oeFbKZdDTpfBfUVPvSK7VKsZgAGHk4hKbT45QToQK6FGG192m1RpAkAkMUK9U5BBA6k` |
| Integration suite (sur-venue.integration.ts) | adapter | BLOCKED | ESM named import error in sur-venue.ts line 64 |

---

## CRITICAL BUG -- sur-venue.ts lines 63-64: ESM named import from CJS anchor

**File:** `worker/src/lib/sur-venue.ts`, lines 63-64
**Error at runtime (Node.js v22, tsx v4.22.4):**

```
SyntaxError: The requested module '@coral-xyz/anchor' does not provide an export named 'BN'
    at ModuleJob._instantiate (node:internal/modules/esm/module_job:226:21)
```

**Root cause:**

`worker/package.json` has `"type": "module"` -- all `.ts` files run as ESM.
`@coral-xyz/anchor@0.31.1` has `"exports": {}` (empty), so Node.js always loads
`main: ./dist/cjs/index.js` (CommonJS). In ESM, named imports from a CJS module only
work if Node.js can statically synthesize them -- which it cannot for anchor's CJS bundle.
The anchor ESM dist (`dist/esm/index.js`) does export `BN` correctly, but Node.js never
reaches it because `exports` is empty and the `module` field is a bundler-only hint.

**Problematic lines in sur-venue.ts:**

```typescript
// line 63 -- works (CJS default export = whole module.exports)
import * as anchor from "@coral-xyz/anchor";
// line 64 -- FAILS: BN, AnchorProvider, Program, Wallet not synthesized as named ESM exports
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
```

**Required fix (two lines only, in sur-venue.ts):**

```typescript
// Replace lines 63-64 with:
import anchor from "@coral-xyz/anchor";
const { AnchorProvider, BN, Program, Wallet } = anchor as any;
// anchor.setProvider(provider) on line 285 still works --
// setProvider is on the default export object
```

**Impact:** BLOCKS the integration suite AND the production dispatch loop.
`sur-venue.ts` cannot be imported by any ESM file in `worker/`.
No SAW trade can be routed through SUR until this is fixed.
**The parallel review agent must fix this in sur-venue.ts -- not the integration driver.**

**Why the probe works:** `npx ts-node` uses the root `tsconfig.json` which sets
`"module": "commonjs"` -- anchor CJS named imports work fine in that CJS context.

---

## Long Position Evidence

**Setup:** deposited 1,000 USDC to vault AccountBalance PDA, mark price set to $65,000

**Position read immediately after open (0.1 BTC, $65k, 2x leverage):**

```json
{
  "market": "BTC-USD",
  "side": "long",
  "baseSize": 0.1,
  "entryPrice": 65000.00,
  "markPrice": 65000.00,
  "margin": 325.00,
  "unrealizedPnlUsdc": 0.00,
  "liqPrice": 63375.00,
  "stopLoss": null,
  "takeProfit": null
}
```

Formula: liqPrice = 65000 - (325 - 0.025 * 6500) / 0.1 = $63,375

**Long open tx sig:**
`pVnEyaR3aePB6wZGMPUSxJTKart8xzgk5zrK5yyJRKYM4pJT88LXBLL8TybWXH4NrXLfve73ZBW7zAffgouCBhY`

**Long close tx sig** (mark moved to $66,000, profit +$100, return $425.00):
`5LTXeKq1Zz4iA8aBkTGJGgGJddM8jLHKBkjwaUyQSRT6n5w1A3cbStBKHfnX7fCsoGJtPubN4xmdxrSQuVqEFL2X`

- `position.size` after close: `0` confirmed
- Return to trader: `$425.00` ($325 margin + $100 profit) confirmed

---

## Short Position Evidence

**Position read immediately after open (0.1 BTC, $66k, 2x leverage):**

```json
{
  "market": "BTC-USD",
  "side": "short",
  "baseSize": 0.1,
  "entryPrice": 66000.00,
  "markPrice": 66000.00,
  "margin": 330.00,
  "unrealizedPnlUsdc": 0.00,
  "liqPrice": 67650.00,
  "stopLoss": null,
  "takeProfit": null
}
```

Formula: liqPrice = 66000 + (330 - 0.025 * 6600) / 0.1 = $67,650

**Short open tx sig:**
`2qwPC85kWMzg5RkpGRnNWEZk79wpqU49R371gBREfe5CcLZVjE8Q3j97jv4LcVuT4PuTrbjFMcQNhrheWKAb385R`

**Short close tx sig** (mark moved to $65,000, profit +$100, return $430.00):
`3nY4BTbuWm3bEYcWU5kf4oeFbKZdDTpfBfUVPvSK7VKsZgAGHk4hKbT45QToQK6FGG192m1RpAkAkMUK9U5BBA6k`

- `position.size` after close: `0` confirmed
- Return to trader: `$430.00` ($330 margin + $100 profit) confirmed

**Final vault balance:** $1,200 USDC ($1,000 initial + $200 total profit) confirmed.

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

# 5. Run integration suite (requires CRITICAL BUG fix in sur-venue.ts first)
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

---

## Integration Driver Fixes Applied

None. `sur-venue.integration.ts` is correct as written -- no changes made.
The bug is in `sur-venue.ts` (production code). Per task constraints, the integration
driver was not modified and the production file was not silently patched.
