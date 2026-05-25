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

/**
 * Whether the Jupiter execute-path is live. Quotes are always real (Jupiter
 * API is public + free); only the swap tx build is gated, because executing
 * a swap requires mainnet liquidity and a mainnet-deployed agent program.
 */
export function isJupiterExecutionEnabled(): boolean {
  return process.env.NEXT_PUBLIC_JUPITER_ENABLED === "true";
}

/**
 * Commonly referenced mint addresses. Symbols come from the LLM as
 * uppercase tickers (the Operative reasons in human terms). We map a small
 * canonical set so the chat tools can produce Jupiter-ready quotes without
 * forcing the model to memorise 44-character base58.
 */
export const COMMON_MINTS: Record<string, { mint: string; decimals: number }> = {
  SOL: { mint: "So11111111111111111111111111111111111111112", decimals: 9 },
  USDC: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  USDT: { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
  BONK: { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5 },
  JUP: { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6 },
  WIF: { mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", decimals: 6 },
  PYTH: { mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", decimals: 6 },
  JTO: { mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL", decimals: 9 },
};

export function resolveMint(symbolOrMint: string): { mint: string; decimals: number } | null {
  const trimmed = symbolOrMint.trim();
  const upper = trimmed.toUpperCase();
  if (COMMON_MINTS[upper]) return COMMON_MINTS[upper];
  // Already a base58 address. We can't infer decimals without an RPC call,
  // so default to 9 (lamports). Caller can pass an explicit decimals param
  // if it matters for display.
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
    return { mint: trimmed, decimals: 9 };
  }
  return null;
}

export interface BuildSwapInput {
  // Raw Jupiter quoteResponse as returned by /quote (passed through verbatim
  // from the client, since Jupiter requires the exact same object back).
  quoteResponse: unknown;
  // The wallet that signs + pays + receives the swap output. For SAW this
  // is the handler's Phantom wallet (the agent program can't CPI Jupiter
  // yet — that's v1.5 work).
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
  // Priority fee in micro-lamports per CU. Leave undefined for auto.
  prioritizationFeeLamports?: number;
}

export interface BuildSwapResult {
  swapTransaction: string; // base64-encoded VersionedTransaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

/**
 * Build a Jupiter swap transaction (server-side). Returns the serialized
 * VersionedTransaction (base64) for the caller to sign with Phantom and
 * submit. Throws if Jupiter execution is disabled (devnet).
 */
export async function buildSwapTransaction(
  input: BuildSwapInput
): Promise<BuildSwapResult> {
  if (!isJupiterExecutionEnabled()) {
    throw new Error(
      "Jupiter execute path is mainnet-only. Set NEXT_PUBLIC_JUPITER_ENABLED=true after mainnet deploy."
    );
  }
  const base = "https://lite-api.jup.ag/swap/v1/swap";
  const res = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: input.quoteResponse,
      userPublicKey: input.userPublicKey,
      wrapAndUnwrapSol: input.wrapAndUnwrapSol ?? true,
      feeAccount: getTreasuryAddressString(),
      prioritizationFeeLamports: input.prioritizationFeeLamports,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(`Jupiter /swap failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as BuildSwapResult & {
    swapTransaction: string;
    lastValidBlockHeight: number;
  };
  return {
    swapTransaction: json.swapTransaction,
    lastValidBlockHeight: json.lastValidBlockHeight,
    prioritizationFeeLamports: json.prioritizationFeeLamports ?? 0,
  };
}
