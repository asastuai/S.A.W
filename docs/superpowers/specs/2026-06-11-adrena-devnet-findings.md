# Adrena Devnet Probe — Findings

**Date**: 2026-06-11
**Status**: BLOCKED — Adrena devnet has zero pool state; SDK npm package lacks compiled JS
**Probe script**: `scripts/adrena-probe.ts`
**Task**: 1c of `docs/superpowers/plans/2026-06-11-saw-perps-phase1.md`
**Replaces**: `2026-06-11-drift-devnet-findings.md` as the active venue spec

---

## Executive Summary

**The SL/TP question** (the critical question from the spec) is answered definitively: **SL/TP IS protocol-native and IS set atomically with the position open in a single Jito bundle.** This satisfies the spec rule "exits live on the venue, survive our worker being down". Keeper execution is configured (`"slTp": true` in the pool automation manifest).

**The devnet situation** is a hard blocker: Adrena's program binary is deployed on devnet but the pool/custody infrastructure (PDAs, custodies, oracle accounts) has NOT been initialized. 7 accounts exist on devnet vs ~6,887 on mainnet. No pool account at the canonical PDA `4bQRutgDJs6vuh6ZcWaPVXiQaBzbHketjbCDjL4oRN34`. Trading against devnet is NOT possible.

**The SDK situation** adds a secondary blocker: `adrena-sdk-ts@1.0.0-beta.14` was published without compiled JavaScript (`dist/src/` contains only `.d.ts` declaration files, no `.js`). The package can provide type annotations but cannot be imported at runtime. Building from GitHub source or a fixed publish is required.

**Architecture impact**: The spec's VenueAdapter design is sound — the API shape, atomicity guarantee, and keeper-executed SL/TP all hold as intended. The path forward is mainnet (or a local fork) rather than devnet.

---

## 1. SDK Package

**Maintained package**: `adrena-sdk-ts` on npm, owned by `AdrenaFoundation` on GitHub.

- `AlexRubik/adrena-sdk-ts` is a personal fork (unrelated to the foundation).
- **GitHub**: `https://github.com/AdrenaFoundation/adrena-sdk-ts`
- **npm name**: `adrena-sdk-ts`
- **Latest stable tag**: `latest` = `1.0.0-beta.2`
- **Latest beta tag**: `beta` = `1.0.0-beta.14` ← install with `pnpm add adrena-sdk-ts@beta`
- **Version locked in worker**: `1.0.0-beta.14` (added to `worker/package.json`)

### Runtime brokenness in beta.14

The published package is missing compiled JavaScript:
- `dist/src/` contains only `.d.ts` and `.d.ts.map` files — no `.js`
- `package.json` exports map to `dist/src/index.js` (does not exist)
- CJS shims in root (`helpers.js`, `core.js`, etc.) do `require('./dist/src/helpers')` → fail
- Attempting `import 'adrena-sdk-ts'` at runtime: `ERR_MODULE_NOT_FOUND: dist/src/index.js`

**Workaround for production use**: Build from GitHub source:
```bash
git clone https://github.com/AdrenaFoundation/adrena-sdk-ts
cd adrena-sdk-ts && pnpm install && pnpm build
# Link locally or copy dist/ into the worker
```

**Impact on Task 4 (VenueAdapter)**: The type declarations are correct and document the real API. The VenueAdapter can be written against the types. Actual execution requires either:
- Building the SDK from GitHub source (npm link or workspace)
- Waiting for AdrenaFoundation to publish a fixed beta.15+
- Directly consuming the `@adrena/abi` IDL + raw `@solana/kit` calls (no SDK wrapper)

**Dependency note**: `adrena-sdk-ts` uses `@solana/kit` v2 (Web3.js 2). SAW worker uses `@solana/web3.js` v1. These are **incompatible at the module level** but can coexist as sub-deps as long as the VenueAdapter module boundary keeps them isolated (no v1 types crossing into v2 code or vice versa). The adapter is already designed as a single isolated module (`worker/src/lib/venue.ts`).

---

## 2. Adrena Program IDs + Devnet State

### Program IDs

| Network | Program ID |
|---------|-----------|
| **Mainnet** | `13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet` |
| **Devnet** | `13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet` (same address, binary deployed, ZERO pool state) |

Source: `ADRENA_PROGRAM_ID` in `src/helpers/constants.ts` of the SDK. Verified on-chain: `executable: true` on both networks.

### Devnet state (verified 2026-06-11)

```
getProgramAccounts('13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet', devnet)
→ 7 accounts (vs ~6887 on mainnet)
```

The 7 accounts are stub/admin accounts from a partial deploy. The pool PDA `4bQRutgDJs6vuh6ZcWaPVXiQaBzbHketjbCDjL4oRN34` does NOT exist on devnet. Without the pool, custodies, and oracle accounts initialized, **no trading instruction can succeed**.

### Test collateral faucet

- **Documented faucet URL**: `https://alpha.adrena.xyz/faucet_devnet` (tokens: USDC, SOL, ADX)
- **Status**: irrelevant — even with test tokens, there is no pool to trade against on devnet
- **Alternative** (if pool state is deployed in the future): airdrop SOL via `https://faucet.solana.com`, then use the faucet URL above for devnet USDC

---

## 3. Opening a Leveraged Position

### The market: JITOSOL, not bare SOL

`PrincipalToken = 'JITOSOL' | 'WBTC' | 'BONK'`

There is no bare `'SOL'` principal token. SOL exposure is via **JITOSOL** (Jito liquid-staked SOL), which tracks SOL price via Pyth SOL/USD oracle. For SAW's "SOL-PERP" market, the VenueAdapter must translate:

```
"SOL-PERP" → principalToken = 'JITOSOL', collateralToken = 'USDC'
```

### Parameter shape (from `OpenMarketLongParams` type declaration)

```typescript
{
  wallet: TransactionSigner,          // @solana/kit v2 signer
  rpc: Rpc<SolanaRpcApi>,            // @solana/kit v2 RPC — NOT web3.js Connection
  principalToken: 'JITOSOL',        // the token being traded (SOL exposure)
  collateralToken: 'USDC',          // collateral mint
  collateralAmount: number,          // in human units (10 = 10 USDC)
  leverage: number,                  // raw multiplier (e.g. 3 = 3x)
  stopLossPrice?: number,            // optional, USD price trigger
  takeProfitPrice?: number,          // optional, USD price trigger
}
```

### Precision handling (from `getOpenLongIxs.ts` source)

- Collateral amount scaled: `BigInt(Math.floor(collateralAmount * 10 ** tokenDecimals))`
  - USDC: 6 decimals → 10 USDC = BigInt(10_000_000)
- Leverage scaled: `Math.floor(leverage * BPS)` where `BPS = 10000`
  - 3x leverage = 30_000 BPS
- Price precision: `PRICE_DECIMALS = 10` (stored as price × 10^10)
- Size/USD precision: `USD_DECIMALS = 6` (stored as amount × 10^6)
- Slippage applied client-side: `price * 1.003` (0.3% slippage guard on entry)

### Short positions

`openMarketShort()` has the same param shape. For shorts:
- `collateralToken` must be `'USDC'` (longs may use `'JITOSOL'` as collateral)
- Same atomicity guarantee for SL/TP

---

## 4. SL/TP Mechanics — The Critical Question

**ANSWER: YES, SL/TP is protocol-native and atomic with position open.**

### Verification method

Source-code inspection of `src/core/openMarketLong.ts` (GitHub, `AdrenaFoundation/adrena-sdk-ts`, main branch, 2026-06-11):

```typescript
// In openMarketLong():
const ixns: IInstruction[] = [];

// 1. Optional: create/edit user profile
const openLongIxns = await getOpenLongIxs(...);
ixns.push(...openLongIxns.ixns);  // position open ix

// 2. SL — same positionAddress derived client-side
if (params.stopLossPrice !== undefined) {
  const setStopLossLongIx = await getSetStopLossLongIx({
    position: openLongIxns.positionAddress,  // same position!
    stopLossLimitPrice: params.stopLossPrice,
    closePositionPrice: null
  });
  ixns.push(setStopLossLongIx);
}

// 3. TP — same positionAddress
if (params.takeProfitPrice !== undefined) {
  const takeProfitLongIx = await getTakeProfitLongIx({
    position: openLongIxns.positionAddress,
    takeProfitLimitPrice: params.takeProfitPrice,
  });
  ixns.push(takeProfitLongIx);
}

// ALL in one Jito bundle:
const txSig = await sendTransactionWithJito(ixns, wallet, rpc, false, true, [ADRENA_LOOKUP_TABLE_ADDRESS]);
```

**Entry + SL + TP = ONE Jito bundle = one atomic transaction set.** The position address is derived client-side before sending, so SL/TP instructions reference the correct (not-yet-created) position — Anchor PDAs allow this because the address is deterministic.

### Keeper execution

From `configs/pools_manifest.json` in `AdrenaFoundation/adrena-abi`:
```json
"automation": {
  "liquidations": true,
  "slTp": true,
  "limitOrders": true,
  ...
}
```

`slTp: true` confirms that keeper infrastructure executes SL/TP orders autonomously. The spec's requirement — "exits live on the venue, survive our worker being down" — is satisfied.

### Cancellation

`cancelSLTP(wallet, rpc, principalToken, side, cancelStopLoss, cancelTakeProfit)` — cancels either or both. Returns `{txSignature, positionAddress}`.

### Impact on spec

The spec rule "SL/TP are native venue orders executed by keepers; placed atomically with entry" **holds exactly as designed**. No rollback logic or gap handling needed for SL/TP setup — it either all succeeds or all fails in one bundle. `requireStopLoss=true` is enforceable.

---

## 5. Reading Position State

### getPositionStatus() return type

```typescript
{
  positionData: Position,  // raw on-chain account (all bigint fields)
  entryPrice: number,      // normalized to USD (= position.price / 10^PRICE_DECIMALS)
  pythPrice: number,       // current oracle price = "mark price"
  sizeUsd: number,         // position size in USD
  pnl: number,             // after exit fee and interest
  preFeePnl: number,       // PnL before fees
  exitFee: number,
  totalInterest: string,
  assetAmount: number,
  openTime: Date, updateTime: Date
}
```

### SL/TP levels from raw Position account

```typescript
// From the Position codama-generated type:
position.stopLossIsSet      // 0 or 1
position.stopLossLimitPrice // bigint → divide by 10^PRICE_DECIMALS for USD price
position.stopLossClosePositionPrice  // optional close price (for SL with limit close)
position.takeProfitIsSet
position.takeProfitLimitPrice

// Example read:
const stopLossUsd = Number(position.stopLossLimitPrice) / 10 ** PRICE_DECIMALS;
```

### Liquidation price

**NOT stored in the Position struct.** The `Position` type has `liquidationFeeUsd` (the fee charged at liquidation) but not a trigger price. Liquidation price must be calculated client-side:

```typescript
// Approximate liq price for a long:
// liqPrice = entryPrice * (1 - (collateralUsd - maintenanceFee) / sizeUsd)
// For SAW UI display, use this estimate with the "~" prefix (per spec §UI.1)
const collateralUsd = Number(position.collateralUsd) / 1e6;
const liqFeeUsd = Number(position.liquidationFeeUsd) / 1e6;
const sizeUsd = getPositionStatus.sizeUsd;
const liqPrice = entryPrice * (1 - (collateralUsd - liqFeeUsd) / sizeUsd);
```

The Adrena Data API (`https://datapi.adrena.xyz`) exposes a `/position` endpoint that returns historical position records with `entry_price`, `pnl`, and `closed_by_sl_tp` fields, but no real-time liq price either.

---

## 6. Close Position + Cleanup

### closeLong / closeShort

```typescript
await closeLong({ wallet, rpc, principalToken: 'JITOSOL' });
// or
await closeShort({ wallet, rpc, principalToken: 'JITOSOL' });
```

`ClosePositionLongParams` (from `getClosePositionIxs.d.ts`):
- `wallet`, `rpc`, `principalToken`
- No `market` or `positionAddress` parameter needed — the SDK derives the position PDA from `(pool, owner, custody)`.

**Implication for VenueAdapter**: `closePerp(market: string)` maps to `closeLong` or `closeShort` based on the stored side. The adapter must track side per market or read it from the position account first.

### Cleanup of orphan SL/TP

After a manual close, any SL/TP orders attached to the closed position become orphaned. `cancelSLTP()` handles this explicitly:

```typescript
await cancelSLTP(wallet, rpc, 'JITOSOL', 'long', true, true);
```

For VenueAdapter `closePerp()`:
1. Optionally call `cancelSLTP(…, true, true)` before closing (safe if no SL/TP set)
2. Call `closeLong()` or `closeShort()`

If the position was already closed (by an SL/TP keeper), `closeLong()` will fail with a program error (position account doesn't exist). The adapter should catch this and return `{ alreadyClosed: true }`.

---

## 7. Client Order ID / Idempotency

**No client order ID equivalent in Adrena.**

Adrena does not expose a user-settable `clientOrderId` like Drift's `userOrderId: u8`. The position address is derived deterministically from `(pool, owner, custodyAddress)`, which means there can only be ONE position per (owner, market, side) at a time. This is both a simplification and a constraint:

- **Dedup guard**: instead of checking `hasOpenOrderWithUserOrderId(id)`, the adapter checks `getPositionStatus(…)` — if a position already exists for this market/side, `hasOpenPosition(market, side)` returns true → skip as already-open.
- **Idempotency**: if the worker fires twice for the same `perp-open` item, the second call will try to open a position that already exists. The program will reject it (position account already initialized). The adapter should catch `AccountAlreadyInUse` or `PositionAlreadyExists` errors and return `{ outcome: 'skipped' }`.

The `Position.id` field (`bigint`, monotone counter) can be read after open to verify the position created matches expectations.

---

## 8. Oracle Price

Adrena uses Pyth via `@solana/kit`:

```typescript
// In getOpenLongIxs.ts — price loaded from Pyth oracle for the principal token:
// SOL price via JITOSOL principal → uses "SOL" CoinGecko/Pyth symbol internally
```

For oracle price reads independent of a transaction, the SDK's Pyth integration fetches the current price feed. For the VenueAdapter `getOraclePrice(market)`:
- Map `'SOL-PERP'` → Pyth SOL/USD feed
- Use `getPositionStatus().pythPrice` if a position is open (returns current oracle price)
- For oracle reads without an open position: use `@pythnetwork/hermes-client` or read the Pyth Switchboard oracle account directly

---

## 9. Concerns and Architectural Flags

| Issue | Severity | Impact on SAW spec |
|-------|----------|-------------------|
| Adrena devnet has no pool state | BLOCKER | Cannot test against devnet; must use mainnet or a local fork |
| `adrena-sdk-ts@beta.14` has no compiled JS | HIGH | SDK unusable at runtime without building from GitHub source |
| `@solana/kit` v2 vs `@solana/web3.js` v1 conflict | MEDIUM | Keep in isolated adapter boundary; no cross-contamination |
| No bare 'SOL' — only JITOSOL | LOW | VenueAdapter maps 'SOL-PERP' → principalToken='JITOSOL'; transparent to upper layers |
| No clientOrderId equivalent | LOW | Dedup by position existence check instead of order ID |
| liquidationPrice not in Position struct | LOW | Estimate client-side (spec already uses "~" for liq price estimate) |
| Single position per (owner, market, side) | LOW | Cannot hold two JITOSOL longs simultaneously under one keypair |

### SPEC RULE IMPACT ASSESSMENT

**"SL/TP are native venue orders (reduce-only triggers), placed atomically with the entry"**
→ CONFIRMED: single Jito bundle. The reduce-only framing differs (Adrena uses setStopLoss/setTakeProfit instructions on the position, not separate trigger orders), but the semantic is identical — keepers execute them if price crosses the level. SATISFIES THE SPEC.

**"Exits live on the venue, survive our worker being down"**
→ CONFIRMED: keeper automation is on (`slTp: true`). SATISFIES THE SPEC.

**"requireStopLoss=true by default"**
→ `stopLossPrice` is optional in the SDK type (the protocol allows positions without SL). Enforcement is at SAW's policy layer. SATISFIES THE SPEC (policy enforces, not the protocol).

**"Guard anti-gap: oracle deviated >1.5% from trigger → skip"**
→ Oracle price readable via `getPositionStatus().pythPrice` or Pyth feed. SATISFIES THE SPEC.

---

## 10. Localnet E2E Results (Task 1d — 2026-06-12)

**Status**: ALL GREEN — full open → read → cancelSLTP → close flow executed with real on-chain transactions.

### Environment

- Validator: `solana-test-validator` with mainnet accounts cloned at launch
- Program: real Adrena binary (`13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet`, 4.2 MB)
- Collateral: 10,000 USDC pre-funded via injected whale ATA (`test-wallet-usdc-ata.json`)
- Oracle: Oracle PDA timestamps patched +4h before validator start

### Transaction Signatures (localnet — not mainnet)

| Step | Description | Signature |
|------|-------------|-----------|
| open+SL+TP | 10 USDC / 5x JITOSOL long, SL=50, TP=120 | `23712CXLR1V7tr3DtzgpbbmU8UTpRrCngYmMJ4x6BeSGWoF9mcaY2mCKir2ACUD3FGYsLZfHoaK5ss5J2mQGEFQA` |
| cancelSLTP | Cancel both SL and TP | `yeA6mPwAGcaXp6i7wemyYE965pf2iAbSxaPtzwk1bPW1DxzyPdC12yeZG1L2EzTnh8socBYDMUunKnov12NpDRU` |
| closeLong | Close the JITOSOL long | `3UtDF97oB9fqoGYqQxmjwh1qKBwvUVrZkdWcqhS3v3FtPK3T7qnZpqfBmSsBrgLyyKLyGtCvmqzhL7cHBB2ZWy7f` |

### Position State (read via getPositionStatus)

```
entryPrice=66.925 USD  sizeUsd=49.844434 USD  stopLossIsSet=1  takeProfitIsSet=1
```

### Root Causes Fixed

**Oracle staleness (error 6088 MissingOraclePrice)**:
- Cause: Cloned Oracle PDA timestamps were set at clone time. Validator block clock starts at wall-clock and advances; by the time the probe runs, `block_time - oracle_ts > threshold` → stale.
- Fix: `setup.sh` patches all Oracle PDA price slot timestamps and `updatedAt` to `now + 4h` before injecting via `--account`. The check `block_time - (now+4h)` is always negative → always fresh. Valid for ~4 hours of runtime.

**Swap-path oracle check (getOpenLongIxs with USDC→JITOSOL swap)**:
- No separate fix needed — once the Oracle PDA timestamps are freshened, both the USDC and JITOSOL price slots are valid and the swap instruction succeeds.

**USDC collateral**:
- Real USDC mint has Centre multisig authority — cannot mint locally.
- Fix: inject a pre-crafted SPL Token ATA JSON with 10,000 USDC, owner = local wallet, at the correct ATA address. File: `scripts/localnet-adrena/test-wallet-usdc-ata.json`.

**Minimum position size (error 6071 InsufficientCollateral)**:
- 1 USDC at 2x (~$2 notional) is below Adrena's minimum (~$50 notional).
- Fix: 10 USDC at 5x = ~$50 notional.

**PositionTooYoung (error 6070)**:
- Adrena enforces a minimum delay between position open and close.
- Fix: `probe-localnet.ts` waits 30 seconds before calling closeLong.

**Transaction confirmation timing**:
- `rpc.sendTransaction()` returns on submission, not confirmation. Subsequent reads race with the in-flight tx.
- Fix: `sendLocalnet()` helper polls `getSignatureStatuses` until `confirmationStatus === "confirmed"` before returning.

**`getClosePositionLongIxs` return shape**:
- Returns `{ixs: IInstruction[], positionAddress}`, not a bare array.
- Fix: extract `closeResult.ixs` before passing to the send helper.

**`getPositionStatus` params**:
- Requires `{wallet, rpc, principalToken, positionAddress}`. The `side` field does not exist.
- Fix: pass `positionAddress: openResult.positionAddress` from the open step.

### Known Remaining Limitations

| Item | Notes |
|------|-------|
| SL/TP not executed | Keeper infrastructure only exists on mainnet; SL/TP accepted but never triggered on localnet |
| Oracle freshness window | ~4h; restart `setup.sh` after that |
| Single position per keypair | One JITOSOL long at a time |
| No Jito bundles on localnet | SDK high-level API bypassed; low-level builders used throughout |

---

## 11. Recommended Path Forward

**Option A (recommended): Build SDK from GitHub source**
```bash
# In pnpm workspace root
git clone https://github.com/AdrenaFoundation/adrena-sdk-ts vendor/adrena-sdk-ts
cd vendor/adrena-sdk-ts && pnpm install && pnpm build
```
Add to `pnpm-workspace.yaml` and replace `"adrena-sdk-ts": "1.0.0-beta.14"` with `"adrena-sdk-ts": "workspace:*"`.
Then test against **mainnet** with a tiny keypair (1-2 USDC, minimum leverage). All VenueAdapter integration tests run against mainnet with a small float.

**Option B: Wait for fixed npm publish**
Watch `https://www.npmjs.com/package/adrena-sdk-ts` for a beta.15+ release that includes `dist/src/*.js`.

**Option C: Direct IDL + `@solana/kit` calls**
Skip the SDK wrapper, use `@adrena/abi` for the IDL and build instructions directly. More code, but no SDK dependency risk.

**For devnet**: file an issue with AdrenaFoundation to request pool initialization on devnet. Currently, `alpha.adrena.xyz` appears to run on mainnet even when `?cluster=devnet` is in the URL.

---

## Appendix: Verified Constants

```typescript
// From adrena-sdk-ts dist/src/helpers/constants.d.ts
ADRENA_PROGRAM_ID = '13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet'  // mainnet + devnet binary
ADRENA_LOOKUP_TABLE_ADDRESS = '4PZaPEXPzMLuBSKgZUvpzLi3zGXJ1pSz6NTKrtoXUd4q'  // mainnet only
DEV_PDA = 'F5MG8jgytQT6pS5CgtRGRmNRCufkxR7CkGMQiPt6Z6xb'  // referrer PDA used in profile init
USDC_TOKEN_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'  // mainnet USDC
JITOSOL_TOKEN_MINT = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn'  // Jito staked SOL (mainnet)
PRICE_DECIMALS = 10
USD_DECIMALS = 6
BPS = 10000

// From adrena-abi/configs/pools_manifest.json (2026-04-21 mainnet read):
main-pool PDA = '4bQRutgDJs6vuh6ZcWaPVXiQaBzbHketjbCDjL4oRN34'
main-pool custodies (order): USDC, BONK, jitoSOL, WBTC
  USDC custody  = 'Dk523LZeDQbZtUwPEBjFXCd2Au1tD7mWZBJJmcgHktNk'
  jitoSOL custody = 'GZ9XfWwgTRhkma2Y91Q9r1XKotNXYjBnKKabj19rhT71'
  WBTC custody  = 'GFu3qS22mo6bAjg4Lr5R7L8pPgHq6GvbjJPKEHkbbs2c'
```
