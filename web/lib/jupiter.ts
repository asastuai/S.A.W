/**
 * Jupiter swap helper.
 *
 * In v1 (devnet) Jupiter has no real liquidity, so this module either:
 *   - Returns a mocked quote that simulates a successful swap, or
 *   - Hits Jupiter's API if NEXT_PUBLIC_JUPITER_ENABLED=true (mainnet).
 *
 * The SAW platform fee is collected via Jupiter's native `platformFeeBps`
 * mechanism, which routes the fee to a `feeAccount` we own (see treasury.ts).
 */

import { createJupiterApiClient } from "@jup-ag/api";
import { SWAP_FEE_BPS } from "./fees";
import { getTreasuryAddressString } from "./treasury";

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: bigint;
  outAmount: bigint;
  platformFeeLamports: bigint;
  routePlan: { dexLabel: string; percent: number }[];
  mocked: boolean;
}

const isMainnetSwap = process.env.NEXT_PUBLIC_JUPITER_ENABLED === "true";

let _client: ReturnType<typeof createJupiterApiClient> | null = null;
function jupiterClient() {
  if (!_client) _client = createJupiterApiClient();
  return _client;
}

export async function getSwapQuote(input: {
  inputMint: string;
  outputMint: string;
  amountLamports: bigint;
  slippageBps?: number;
}): Promise<SwapQuote> {
  if (!isMainnetSwap) {
    return mockedQuote(input);
  }

  const jup = jupiterClient();
  const quote = await jup.quoteGet({
    inputMint: input.inputMint,
    outputMint: input.outputMint,
    amount: Number(input.amountLamports),
    slippageBps: input.slippageBps ?? 50,
    platformFeeBps: Number(SWAP_FEE_BPS),
    onlyDirectRoutes: false,
  });

  return {
    inputMint: quote.inputMint,
    outputMint: quote.outputMint,
    inAmount: BigInt(quote.inAmount),
    outAmount: BigInt(quote.outAmount),
    platformFeeLamports: BigInt(quote.platformFee?.amount ?? "0"),
    routePlan: (quote.routePlan ?? []).map((step: any) => ({
      dexLabel: step.swapInfo.label,
      percent: step.percent,
    })),
    mocked: false,
  };
}

function mockedQuote(input: {
  inputMint: string;
  outputMint: string;
  amountLamports: bigint;
}): SwapQuote {
  // Deterministic pretend: 1:1 minus the SAW fee.
  const fee = (input.amountLamports * SWAP_FEE_BPS) / 10_000n;
  const out = input.amountLamports - fee;
  return {
    inputMint: input.inputMint,
    outputMint: input.outputMint,
    inAmount: input.amountLamports,
    outAmount: out,
    platformFeeLamports: fee,
    routePlan: [{ dexLabel: "MOCK_JUPITER", percent: 100 }],
    mocked: true,
  };
}

/**
 * Returns the feeAccount address that Jupiter should route platform fees to.
 * On real Jupiter swaps, set on the swap tx (`feeAccount: getTreasuryAddressString()`).
 */
export function platformFeeAccount(): string {
  return getTreasuryAddressString();
}
