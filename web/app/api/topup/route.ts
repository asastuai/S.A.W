import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import {
  CALLS_PER_TOPUP,
  LAMPORTS_PER_TOPUP,
  addCreditsFromTopup,
  getCredits,
  lamportsToCalls,
} from "@/lib/db/credits";
import { getTreasuryAddressString, isTreasuryConfigured } from "@/lib/treasury";

export const runtime = "nodejs";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  process.env.SOLANA_RPC_URL ||
  "https://api.devnet.solana.com";

/**
 * POST /api/topup
 * body: { txSignature: string }
 *
 * Verifies an on-chain SOL transfer from the authenticated handler's
 * wallet to the SAW treasury. If valid, credits the handler with
 * `lamportsToCalls(amount)` LLM calls.
 *
 * Idempotent on tx signature.
 */
export async function POST(req: NextRequest) {
  try {
    const claims = await requireAuth(req);
    const handler = await getHandlerByPrivy(claims.privy_user_id);
    if (!handler) {
      return NextResponse.json({ error: "handler not found" }, { status: 404 });
    }
    if (!isTreasuryConfigured()) {
      return NextResponse.json(
        { error: "treasury not configured on server" },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const txSignature: string | undefined = body?.txSignature;
    if (!txSignature || typeof txSignature !== "string") {
      return NextResponse.json(
        { error: "missing txSignature" },
        { status: 400 }
      );
    }

    const connection = new Connection(RPC_URL, "confirmed");
    const tx = await connection.getTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    if (!tx) {
      return NextResponse.json(
        { error: "transaction not found or not yet confirmed" },
        { status: 404 }
      );
    }
    if (tx.meta?.err) {
      return NextResponse.json(
        { error: `transaction failed on-chain: ${JSON.stringify(tx.meta.err)}` },
        { status: 400 }
      );
    }

    const treasury = getTreasuryAddressString();
    const treasuryPk = new PublicKey(treasury);
    const accountKeys = tx.transaction.message
      .getAccountKeys({
        accountKeysFromLookups: tx.meta?.loadedAddresses,
      })
      .keySegments()
      .flat();

    const treasuryIndex = accountKeys.findIndex((k) => k.equals(treasuryPk));
    if (treasuryIndex === -1) {
      return NextResponse.json(
        { error: "treasury not credited in this tx" },
        { status: 400 }
      );
    }

    // Compute SOL delta on the treasury account
    const pre = tx.meta?.preBalances?.[treasuryIndex] ?? 0;
    const post = tx.meta?.postBalances?.[treasuryIndex] ?? 0;
    const delta = post - pre;
    if (delta < LAMPORTS_PER_TOPUP) {
      return NextResponse.json(
        {
          error: `topup amount too small: got ${delta} lamports, need ${LAMPORTS_PER_TOPUP} (0.01 SOL minimum)`,
        },
        { status: 400 }
      );
    }

    // SECURITY: verify the tx was signed by the authenticated handler's
    // primary wallet. Without this check, anyone watching the mempool
    // could front-run another user's topup tx by claiming it with their
    // own Privy session before the original sender hits /api/topup.
    // The tx signer is the first account in accountKeys with the signer
    // flag (typically index 0 for a system-program transfer).
    const signerKeys: string[] = [];
    const header = tx.transaction.message.header;
    const numSigners = header.numRequiredSignatures ?? 0;
    for (let i = 0; i < numSigners; i++) {
      signerKeys.push(accountKeys[i]?.toBase58?.() ?? "");
    }
    if (!signerKeys.includes(handler.primary_wallet)) {
      return NextResponse.json(
        {
          error:
            "tx was not signed by your wallet — cannot claim someone else's topup",
        },
        { status: 403 }
      );
    }

    const callsCredited = lamportsToCalls(delta);
    const newBalance = await addCreditsFromTopup({
      handlerId: handler.id,
      txSignature,
      lamports: delta,
      callsCredited,
    });

    return NextResponse.json({
      ok: true,
      txSignature,
      lamports: delta,
      callsCredited,
      balance_calls: newBalance,
      rate: { lamports: LAMPORTS_PER_TOPUP, calls: CALLS_PER_TOPUP },
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: e.message ?? String(e) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/topup → current balance for the authenticated handler.
 */
export async function GET(req: NextRequest) {
  try {
    // L-3: accept either Privy JWT (browser) OR internal-auth (bot)
    // for parity with /api/agent/chat. With internal-auth the bot can
    // surface a real balance instead of "Not authenticated" stub.
    let handlerId: string | null = null;
    const internalSecret = req.headers.get("x-internal-secret")?.trim();
    const expectedInternalSecret = (process.env.INTERNAL_API_SECRET ?? "").trim();
    if (
      expectedInternalSecret &&
      internalSecret &&
      internalSecret === expectedInternalSecret
    ) {
      const internalHandler = req.headers.get("x-handler-id")?.trim() || null;
      if (internalHandler) {
        const { supabaseAdmin } = await import("@/lib/supabase");
        const { data: row } = await supabaseAdmin()
          .from("handlers")
          .select("id")
          .eq("id", internalHandler)
          .maybeSingle();
        if (!row) {
          return NextResponse.json({ error: "unknown handler" }, { status: 404 });
        }
        handlerId = internalHandler;
      }
    } else {
      const claims = await requireAuth(req);
      const handler = await getHandlerByPrivy(claims.privy_user_id);
      if (handler) handlerId = handler.id;
    }
    if (!handlerId) return NextResponse.json({ balance_calls: 0 });

    const credits = await getCredits(handlerId);
    return NextResponse.json({
      balance_calls: credits?.balance_calls ?? 0,
      total_paid_lamports: credits?.total_paid_lamports ?? 0,
      last_topup_at: credits?.last_topup_at ?? null,
      rate: { lamports: LAMPORTS_PER_TOPUP, calls: CALLS_PER_TOPUP },
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: e.message ?? String(e) },
      { status: 500 }
    );
  }
}
