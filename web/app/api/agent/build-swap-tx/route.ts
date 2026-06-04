import { NextRequest, NextResponse } from "next/server";
import {
  buildSwapTransaction,
  isJupiterExecutionEnabled,
  resolveMint,
} from "@/lib/jupiter";

export const runtime = "nodejs";

/**
 * POST /api/agent/build-swap-tx
 *
 * Server-side: build a Jupiter swap transaction for the handler to sign
 * with Phantom. We do this server-side (instead of letting the client
 * call Jupiter directly) so the platform-fee feeAccount + the slippage
 * cap are enforced by us, not trusted from the browser.
 *
 * Body: {
 *   inputMint: string,        // base58 mint OR uppercase symbol (SOL, USDC, ...)
 *   outputMint: string,
 *   amountLamports: string,   // stringified bigint to survive JSON
 *   slippageBps?: number,
 *   userPublicKey: string,
 * }
 *
 * Returns: {
 *   swapTransaction: string,            // base64 VersionedTransaction
 *   lastValidBlockHeight: number,
 *   prioritizationFeeLamports: number,
 *   quoteSummary: { inAmount, outAmount, routeLabels }
 * }
 *
 * Auth: not required for v1 — the resulting tx only spends from
 * userPublicKey and the user must sign it with Phantom. Adding handler
 * JWT auth here would prevent the agent-side autonomous path that lands
 * in v1.5.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isJupiterExecutionEnabled()) {
      return NextResponse.json(
        {
          error:
            "Jupiter execute path disabled. SAW is on devnet; mainnet swaps ship once funding lands (no grant secured yet).",
        },
        { status: 501 }
      );
    }

    const body = (await req.json()) as {
      inputMint?: string;
      outputMint?: string;
      amountLamports?: string;
      slippageBps?: number;
      userPublicKey?: string;
    };

    if (!body.inputMint || !body.outputMint || !body.amountLamports || !body.userPublicKey) {
      return NextResponse.json(
        { error: "Missing required field (inputMint, outputMint, amountLamports, userPublicKey)" },
        { status: 400 }
      );
    }

    const inMint = resolveMint(body.inputMint);
    const outMint = resolveMint(body.outputMint);
    if (!inMint || !outMint) {
      return NextResponse.json(
        { error: `Unknown mint or symbol: ${!inMint ? body.inputMint : body.outputMint}` },
        { status: 400 }
      );
    }

    const amount = (() => {
      try {
        return BigInt(body.amountLamports!);
      } catch {
        return null;
      }
    })();
    if (amount === null || amount <= 0n) {
      return NextResponse.json({ error: "Invalid amountLamports" }, { status: 400 });
    }

    // Step 1: get a fresh quote from Jupiter (we don't trust a quote
    // passed in from the client — it might be stale or tampered).
    const slippageBps = Math.min(Math.max(Number(body.slippageBps ?? 50), 10), 500);
    const quoteUrl = new URL("https://lite-api.jup.ag/swap/v1/quote");
    quoteUrl.searchParams.set("inputMint", inMint.mint);
    quoteUrl.searchParams.set("outputMint", outMint.mint);
    quoteUrl.searchParams.set("amount", amount.toString());
    quoteUrl.searchParams.set("slippageBps", String(slippageBps));
    // Route the SAW platform fee through Jupiter's native mechanism.
    quoteUrl.searchParams.set("platformFeeBps", "55");

    const qRes = await fetch(quoteUrl.toString());
    if (!qRes.ok) {
      const errText = await qRes.text().catch(() => "<unreadable>");
      return NextResponse.json(
        { error: `Jupiter quote failed: ${errText.slice(0, 300)}` },
        { status: 502 }
      );
    }
    const quoteResponse = await qRes.json();

    // Step 2: build the swap tx.
    const built = await buildSwapTransaction({
      quoteResponse,
      userPublicKey: body.userPublicKey,
      wrapAndUnwrapSol: true,
    });

    const routeLabels = (quoteResponse.routePlan ?? [])
      .map((step: any) => step.swapInfo?.label ?? "?")
      .join(" → ");

    return NextResponse.json({
      swapTransaction: built.swapTransaction,
      lastValidBlockHeight: built.lastValidBlockHeight,
      prioritizationFeeLamports: built.prioritizationFeeLamports,
      quoteSummary: {
        inAmount: quoteResponse.inAmount,
        outAmount: quoteResponse.outAmount,
        routeLabels,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
