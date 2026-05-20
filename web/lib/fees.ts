/**
 * Web-side fee helpers. Mirror of worker/src/lib/fees.ts (kept identical so
 * preview UI and worker collection agree to the lamport).
 *
 * When this file is updated, update worker/src/lib/fees.ts too — they are
 * the same constants. Future improvement: extract to a shared package.
 */

export const SWAP_FEE_BPS = 55n;          // 0.55%
export const PERFORMANCE_FEE_BPS = 500n;  // 5.00%
export const AUM_FEE_BPS_PER_YEAR = 100n; // 1.00% APY
export const BPS_DENOM = 10_000n;

export function swapFeeBps(): number {
  return Number(SWAP_FEE_BPS);
}

export function previewSwapFeeLamports(swapInputLamports: bigint): bigint {
  return (swapInputLamports * SWAP_FEE_BPS) / BPS_DENOM;
}

export function calcPerformanceFeeLamports(
  baseLamports: bigint,
  currentLamports: bigint
): bigint {
  if (currentLamports <= baseLamports) return 0n;
  const gain = currentLamports - baseLamports;
  return (gain * PERFORMANCE_FEE_BPS) / BPS_DENOM;
}

export function calcDailyAumFeeLamports(balanceLamports: bigint): bigint {
  return (balanceLamports * AUM_FEE_BPS_PER_YEAR) / BPS_DENOM / 365n;
}

export function lamportsToSol(l: bigint): number {
  return Number(l) / 1_000_000_000;
}

export function formatSol(l: bigint, decimals = 4): string {
  return lamportsToSol(l).toFixed(decimals) + " SOL";
}
