# SAW Perps — SUR Adapter Live on DEVNET

**Date:** 2026-06-15
**Network:** Solana **devnet** (public RPC `https://api.devnet.solana.com`)
**Operator/trader:** `4gAdo7R69XgZJ2QazB1N2o21nfY2gjto9KijUDzjg6kv` (deployer, registered SUR engine + oracle operator; devnet throwaway)
**Status:** DONE — **28/28 PASS, 0 failures.** SAW's `SurAdapter` drives all tx sigs on devnet.

This is the devnet counterpart of `DEMO-RESULTS-sur.md` (localnet). Same adapter
(`worker/src/lib/sur-venue.ts`), same suite (`worker/src/lib/sur-venue.integration.ts`),
pointed at devnet via `VENUE_RPC_URL` + funded via `SUR_FUND_USDC`.

---

## Critical tx signatures (verifiable on solscan, cluster=devnet)

| Step | Outcome | Tx Signature |
|------|---------|-------------|
| LONG open (0.1 BTC @ $65,000, 2x) | PASS | `8jSNcUF3EMYb3G1A5DHQ6xu4AyKp5GBdsTjCTnfpiPENmjda4CLT51zwbg7KS3fgdFoawSV6fhXXdAAap6uSM3w` |
| LONG close (@ $66,000) | PASS | `o547GX8CTiA7ood5RYwfDvDx92Vy3FhmG6XV4kzed8B1NCYBptXiHJkBoGACZwGRFvn4LL6eudWgbx9iAd5YRUm` |
| SHORT open (0.1 BTC @ $66,000, 2x) | PASS | `42L1fp932PsEhVZh8DZDb54rREGGdJ7kXV48ToonYBRGYAMXZukTgZwyMyVQUdgNrvJyMDNCeqppbWGaoJBywEN4` |
| SHORT close (@ $65,000) | PASS | `BoYv4yPS4z2YSS4BoywsZbfUmJBRhjFmDYrMpa4dvUxejo4PBLf5uqrqb6ARg9koYzikpjouFjBRiDTX3CQRgEB` |

Long-open and short-open independently confirmed **Finalized, Status: Ok**
(`solana confirm -v <sig> --url devnet`).

solscan: `https://solscan.io/tx/<sig>?cluster=devnet`

---

## What ran (28 steps)

makeSurAdapter → ensureUserInitialized (creates AccountBalance PDA, idempotent) →
**fundFloat(5000 USDC)** (deposit into vault) → getFloatBalanceUsdc → ensureDeposited
pass/fail → pushMarkPrice($65k) → getOraclePrice → hasOpenOrderWithUserOrderId →
**openPerp LONG** → getPositions(1 long, uPnL, liqPrice, SL/TP=null) → closePerp LONG →
getPositions([]) → closePerp again (alreadyClosed) → **openPerp SHORT** →
getPositions(1 short) → closePerp SHORT → getPositions([]) → disconnect.

Position reads (client-side computed, on-chain `Position` PDA):
- LONG  0.1 BTC @ $65,000, 2x → margin $3,250, liqPrice $63,375
- SHORT 0.1 BTC @ $66,000, 2x → margin $3,300, liqPrice $67,650

---

## Gap from localnet → devnet (what changed)

1. **RPC parametrized** — `sur-venue.integration.ts` now reads `VENUE_RPC_URL` (default
   `http://127.0.0.1:8899`). Localnet behaviour unchanged.
2. **`fundFloat(amountUsdc)` added to `SurAdapter`** — deposits from the operator's USDC
   ATA into the vault (the localnet probe did this; devnet needs the harness to do it).
   Gated in the suite behind `SUR_FUND_USDC` so localnet stays probe-funded.

No SUR-side changes: devnet was already initialized (`scripts/devnet-state.json`, 35/35 ok,
markets BTC/SOL/ETH-USD, operator registered) — verified on-chain, not from docs.

---

## Honest caveats

- **Oracle is operator-pushed** (`pushMarkPrice` → `engine.update_mark_price`), not Pyth.
  Valid for devnet/paper-trade; real Pyth feed is a SUR follow-up (their open C-2 finding).
- **No on-chain SL/TP** in SUR's `perp_engine` — `stopLoss`/`takeProfit` always `null`.
- SUR is a self-audit (Claude Opus 4.8, 2 rounds), **not mainnet-ready** — devnet only.
- The trading flow itself (margin lock/release, PnL settle, open/close long+short) is
  fully real on-chain on devnet.

---

## Reproduce

```bash
cd ~/projects/saw/worker
VENUE=sur VENUE_ENV=devnet \
  VENUE_RPC_URL=https://api.devnet.solana.com \
  SUR_FUND_USDC=5000 \
  pnpm exec tsx src/lib/sur-venue.integration.ts
```

Prereq: `~/.config/solana/id.json` = the deployer/operator (`4gAdo…`), with devnet SOL
for fees and test USDC (mint `HPPfibzQ5GYgjBpBsRNXxD8MUKasBFwpR3UpjFqBbzny`) in its ATA.
