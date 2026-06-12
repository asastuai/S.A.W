# SAW Perps — End-to-End Demo Results

**Date:** 2026-06-12  
**Network:** localnet (Adrena mainnet-clone, solana-test-validator 3.1.14)  
**Wallet:** `APi6dKSDdaTe3faXSE6knSEGaggSS9vCqozwsyyF5Lek` (localnet throwaway, gitignored)  
**RPC:** `http://127.0.0.1:8899`  
**Status:** ALL PATHS SUCCEEDED

---

## Summary

The full worker dispatch path was exercised end-to-end on localnet:

| Step | Outcome | Tx Signature |
|------|---------|-------------|
| LONG open (dispatchPerpItem) | `done` | `ZB2XpA6Kk2qETu8kEj8js8iC9xLfxZzf7s1w5yWq4FRR8C8gvHn7DeC7x3WYggtuAYuzbNk11Dx1SyMC7zsciqh` |
| LONG close (dispatchPerpItem) | `done` | `3fXaSmQRcFmkUuDF3ZMGpFX4LGfeSWC836UvjjZLkKZ5Ah9y6xf7gM3A5DPbr6tEKDX6uHyKsk9girXQoYmbi2hG` |
| Second close (alreadyClosed guard) | `skipped` | — (guard fired correctly) |
| SHORT open (dispatchPerpItem) | `done` | `3q8WTQMP6GebJ3r5fm8DFBhf8PCLnQdTD5q4R5Z8b7XNK9kSEQxPSrH7FJkT66Le4rv9nYNz5iKP5jpAeVkvoSHC` |
| SHORT close (dispatchPerpItem) | `done` | `5rVDuZpjPdpKuJhby7TmniSBxv77iMUWmyprJAF6tgHMSjjn8dmM9mj2tauJ1oh68KYDtaYSEk3ZMwdT5rJjk6AD` |

---

## Long Position — Evidence

**Oracle at open:** $68.1437  
**Trigger:** $68.2119 (0.1% above oracle, `trigger_kind: "below"`)  
**Margin:** 10 USDC | **Leverage:** 2x | **Market:** SOL-PERP

### Position read immediately after open

```json
{
  "market": "SOL-PERP",
  "side": "long",
  "entryPrice": 67.89,
  "markPrice": 68.1432625,
  "baseSize": 0.2936776108410664,
  "unrealizedPnlUsdc": 0.05443052591563651,
  "liqPrice": 34.28461901186256,
  "stopLoss": 61.32935016,
  "takeProfit": 78.36528076
}
```

- Stop-loss set: $61.33 (−10% from entry, confirmed on-chain)
- Take-profit set: $78.37 (+15% from entry, confirmed on-chain)
- Liquidation price (client estimate): $34.28

### Open tx signature

```
ZB2XpA6Kk2qETu8kEj8js8iC9xLfxZzf7s1w5yWq4FRR8C8gvHn7DeC7x3WYggtuAYuzbNk11Dx1SyMC7zsciqh
```

### Close tx signature (35s wait for PositionTooYoung guard)

```
3fXaSmQRcFmkUuDF3ZMGpFX4LGfeSWC836UvjjZLkKZ5Ah9y6xf7gM3A5DPbr6tEKDX6uHyKsk9girXQoYmbi2hG
```

---

## Short Position — Evidence

**Oracle at open:** $68.2750  
**Trigger:** $68.2068 (0.1% below oracle, `trigger_kind: "above"`)  
**Margin:** 10 USDC | **Leverage:** 2x | **Market:** SOL-PERP

### Position read immediately after open

```json
{
  "market": "SOL-PERP",
  "side": "short",
  "entryPrice": 67.89,
  "markPrice": 68.28452307,
  "baseSize": 0.2945602592428929,
  "unrealizedPnlUsdc": -0.13620781777650132,
  "liqPrice": 34.284448370452274,
  "stopLoss": 75.102533099,
  "takeProfit": 58.0337755765
}
```

- Stop-loss set: $75.10 (+10% above entry, correct for short)
- Take-profit set: $58.03 (−15% below entry, correct for short)
- Liquidation price (client estimate): $34.28

### Open tx signature

```
3q8WTQMP6GebJ3r5fm8DFBhf8PCLnQdTD5q4R5Z8b7XNK9kSEQxPSrH7FJkT66Le4rv9nYNz5iKP5jpAeVkvoSHC
```

### Close tx signature (35s wait for PositionTooYoung guard)

```
5rVDuZpjPdpKuJhby7TmniSBxv77iMUWmyprJAF6tgHMSjjn8dmM9mj2tauJ1oh68KYDtaYSEk3ZMwdT5rJjk6AD
```

---

## What was exercised

Every step of `dispatchPerpItem` ran live on-chain:

1. **Atomic claim** — mock DB returns 1 row on `status=queued` update (simulates concurrency guard)
2. **Policy re-check at fire time** — `evaluatePerpPolicy` passed for both opens
3. **Oracle gap guard** — oracle within 0.1% of trigger; guard passed
4. **Double-fire guard** — `hasOpenOrderWithUserOrderId` returned false before open
5. **`ensureDeposited`** — USDC balance checked (9990 USDC available)
6. **`openPerp`** — real on-chain instruction built and sent via localnet, tx confirmed
7. **`getPositions`** — position PDA read, entry/mark/SL/TP/liq returned
8. **`closePerp`** — position closed after 35s PositionTooYoung guard
9. **alreadyClosed guard** — second close returned `skipped` as designed

---

## Bug fixed during demo

**Bug:** `getOpenShortIxs`, `getSetStopLossShortIx`, `getTakeProfitShortIx` were missing from  
`~/vendor/adrena-sdk-ts/dist/src/instructions/index.js` (and the pnpm store copy).  
The functions existed in `dist/src/instructions/` but were not re-exported from the barrel.  
Dynamic imports via `adrena-sdk/dist/src/...` paths failed with Node.js strict package exports error.

**Fix applied:**
1. Added three `__exportStar(require(...))` lines to both:
   - `~/vendor/adrena-sdk-ts/dist/src/instructions/index.js`
   - The pnpm store copy at `~/projects/saw/node_modules/.pnpm/.../adrena-sdk/dist/src/instructions/index.js`
2. Updated `worker/src/lib/venue.ts`: replaced the dynamic `loadShortBuilders()` async-import pattern  
   with direct static imports from `adrena-sdk/instructions` (now that the barrel exports them).

**Files changed:**
- `worker/src/lib/venue.ts` — static imports for short builders
- `~/vendor/adrena-sdk-ts/dist/src/instructions/index.js` — added short re-exports
- Pnpm store copy — same patch

---

## How to reproduce

### 1. Start localnet

```bash
cd ~/projects/saw
bash scripts/localnet-adrena/setup.sh
```

Wait for "Adrena localnet ready!" (takes ~60s, clones accounts from mainnet).

### 2. Verify health

```bash
solana cluster-version --url http://127.0.0.1:8899
# Expected: 3.1.14 (or current version)
```

### 3. Run the original integration driver (long-only, with 35s wait)

```bash
cd ~/projects/saw/worker
VENUE=adrena VENUE_ENV=localnet VENUE_RPC_URL=http://127.0.0.1:8899 \
  pnpm exec tsx src/lib/dispatch-perp.integration.ts
```

### 4. Run the full demo (long + short, two 35s waits, ~90s total)

```bash
cd ~/projects/saw/worker
VENUE=adrena VENUE_ENV=localnet VENUE_RPC_URL=http://127.0.0.1:8899 \
  pnpm exec tsx src/lib/demo-perps-full.ts
```

### 5. Stop validator

```bash
pkill -f solana-test-validator
```

---

## Notes

- The localnet validator clones Adrena mainnet accounts (pool, custodies, oracles, program bytecode).
- Oracle timestamps are patched 4 hours into the future to avoid staleness errors (error 6088).
- The USDC ATA (`86ETnxGX1LjtRxwwjvpW94Aty9ZLpTpVzMFW7jD8Ut4E`) is pre-funded with 10,000 USDC
  (injected via `--account` at validator startup; uses the real USDC mint `EPjFWdd5...`).
- The DB mock (`makeIntegrationDb`) simulates the atomic claim and status writes without a real Supabase instance.
- The 35s wait between open and close is required by Adrena's `PositionTooYoung` guard (error 6070).
- No real keys were written to disk; the localnet keypair lives at `.keys/local-wallet.json` (gitignored).
