# SAW Fee Model

## Principles

1. **On-chain only.** Every fee is a Solana transfer. No off-chain billing, no CC, no KYC, no subscription.
2. **Visible per transaction.** Each preview shows the fee. Each collection appears in the user's audit log.
3. **Aligned.** Fees scale with what the user got, not with what they signed up for.
4. **Cheaper than the dominant comparable**, with a reason — not undercut.

## The three fees

### 1. Swap routing — 55 bps (0.55%)

| Property | Value |
|---|---|
| When | Agent-executed Jupiter swap |
| Where collected | Jupiter's native `platformFeeBps` mechanism |
| Receiver | SAW treasury (config: `NEXT_PUBLIC_SAW_TREASURY`) |
| Comparison | Phantom Swap 0.85%, Jupiter UI 0.05% optional |
| Handler-signed swap | **Fee waived** (handler signed = user effort = no convenience to pay for) |

Implementation: when building the swap quote (`web/lib/jupiter.ts`), the SAW client passes:
```ts
platformFeeBps: 55,
feeAccount: getTreasuryAddressString(),
```
Jupiter routes the fee directly to the treasury at swap execution.

### 2. Performance — 5% on net weekly PnL

| Property | Value |
|---|---|
| When | Sundays 23:59 UTC |
| Where collected | `worker/src/jobs/weekly-performance-fee.ts` |
| Base period | Mon 00:00 UTC → Sun 23:59 UTC |
| Trigger | Wallet ended week up vs base snapshot |
| Floor | If flat or down, fee = 0 |
| Cap | None |
| Settlement | On-chain SOL transfer from agent wallet → treasury |

Snapshots stored in DB (TODO: add `agent_capital_snapshots` table for week opens). Implementation pseudocode in `worker/src/jobs/weekly-performance-fee.ts`.

### 3. AUM — 1% APY on active days

| Property | Value |
|---|---|
| When | Daily 23:55 UTC |
| Where collected | `worker/src/jobs/daily-aum-fee.ts` |
| Base | Agent-wallet balance at collection time |
| Trigger | Agent was enabled AND woke at least once that day |
| Floor | Paused / disabled / no wakes → fee = 0 |
| Formula | `balance * 1% / 365` per day |
| Settlement | On-chain SOL transfer from agent wallet → treasury |

## Math reference (matches `web/lib/fees.ts` and `worker/src/lib/fees.ts`)

```ts
const SWAP_FEE_BPS = 55n;
const PERFORMANCE_FEE_BPS = 500n;
const AUM_FEE_BPS_PER_YEAR = 100n;
const BPS_DENOM = 10_000n;

previewSwapFeeLamports(amount)            = amount * 55n / 10_000n
calcPerformanceFeeLamports(base, current) = max(0, (current - base) * 500n / 10_000n)
calcDailyAumFeeLamports(balance)          = balance * 100n / 10_000n / 365n
```

Tests at `worker/src/lib/fees.test.ts`, run with:
```
node --test --experimental-strip-types worker/src/lib/fees.test.ts
```

## Revenue scenarios

**Typical degen user** — $2k custodied, 20 swaps/mo @ $200 avg, +5% PnL/mo, agent active daily:

| Fee | $ / month |
|---|---|
| Swap | $22.00 |
| Performance | $5.00 |
| AUM | $1.67 |
| **Total** | **~$28.67** |

**Scale projections:**

| Active users | Monthly revenue |
|---|---|
| 50 | $1,435 |
| 200 | $5,734 |
| 500 | $14,335 |
| 1,000 | $28,670 |

## Why fee circumvention is not a meaningful threat

Users could in principle:
1. Use the agent for analysis only, sign every swap manually → avoids swap fee.
2. Pause the agent right before AUM tick → avoids AUM fee.
3. Move funds to a fresh wallet outside SAW before Sunday → avoids performance fee.

But:
1. Manual signing every time defeats the value prop (the whole point is delegation).
2. Pausing/unpausing daily means losing all autonomous opportunities → user loses more than they save.
3. Moving funds in/out adds gas, slippage, and operational pain — exceeds the fee.

The fee structure is designed so the rational user pays. We win when the user wins.

## Treasury reconciliation

Every fee collection writes to `fee_ledger` BEFORE the on-chain transfer. If the transfer fails:
- Ledger row stays but with `related_tx = null`
- Reconciliation job (P4) flags zero-tx rows for manual review

This guarantees: **we never report revenue that did not arrive on-chain.**
