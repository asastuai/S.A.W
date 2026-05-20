/**
 * SAW fee calculations — pure functions, no I/O.
 *
 * Three fees:
 *   1. Swap fee     — 55 bps on agent-executed Jupiter swaps
 *   2. Performance  — 5% on net weekly PnL (only when positive)
 *   3. AUM          — 1% APY prorated daily, on active days only
 *
 * All lamports. 1 SOL = 1_000_000_000 lamports.
 */

export const SWAP_FEE_BPS = 55n;          // 0.55%
export const PERFORMANCE_FEE_BPS = 500n;  // 5.00%
export const AUM_FEE_BPS_PER_YEAR = 100n; // 1.00% APY
export const BPS_DENOM = 10_000n;

/**
 * Swap fee — Jupiter's `platformFeeBps` mechanism handles collection on-chain.
 * This is the value to pass when building the swap quote.
 */
export function swapFeeBps(): number {
  return Number(SWAP_FEE_BPS);
}

/**
 * Performance fee — collects 5% of the gain only when wallet ended week up.
 *
 * @param baseSnapshotLamports  wallet balance at Mon 00:00 UTC
 * @param currentLamports        wallet balance at Sun 23:59 UTC
 * @returns fee amount in lamports (0 if no gain)
 */
export function calcPerformanceFeeLamports(
  baseSnapshotLamports: bigint,
  currentLamports: bigint
): bigint {
  if (currentLamports <= baseSnapshotLamports) return 0n;
  const gain = currentLamports - baseSnapshotLamports;
  return (gain * PERFORMANCE_FEE_BPS) / BPS_DENOM;
}

/**
 * Daily AUM fee — 1% APY ÷ 365.
 *
 * @param balanceLamports wallet balance at time of collection
 * @returns fee amount in lamports for one active day
 */
export function calcDailyAumFeeLamports(balanceLamports: bigint): bigint {
  // (balance * 100 bps / 10000) / 365
  return (balanceLamports * AUM_FEE_BPS_PER_YEAR) / BPS_DENOM / 365n;
}

/**
 * Estimate swap fee in lamports given the swap input amount.
 * For preview UI only — the on-chain collection is done by Jupiter.
 *
 * @param swapInputLamports  size of the swap in the input token's base units
 */
export function previewSwapFeeLamports(swapInputLamports: bigint): bigint {
  return (swapInputLamports * SWAP_FEE_BPS) / BPS_DENOM;
}
