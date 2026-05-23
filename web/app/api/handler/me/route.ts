import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import {
  getHandlerByPrivy,
  getHandlerByWallet,
  upsertHandler,
  touchHandlerSeen,
} from "@/lib/db/handlers";

export const runtime = "nodejs";

/**
 * GET /api/handler/me
 * Returns the authenticated handler row if it exists. Does NOT create.
 * 404 if not found — caller should POST to create.
 */
export async function GET(req: NextRequest) {
  try {
    const claims = await requireAuth(req);
    const existing = await getHandlerByPrivy(claims.privy_user_id);
    if (!existing) {
      return NextResponse.json({ handler: null }, { status: 404 });
    }
    await touchHandlerSeen(existing.id);
    return NextResponse.json({ handler: existing });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}

/**
 * POST /api/handler/me
 * body: { primaryWallet: string, email?: string }
 * Idempotent upsert keyed by privy_user_id from JWT.
 * Frontend supplies wallet/email because Privy JWT does not include them
 * in claims (they live on the user object accessed via the SDK).
 */
export async function POST(req: NextRequest) {
  try {
    const claims = await requireAuth(req);
    const body = (await req.json().catch(() => ({}))) as {
      primaryWallet?: string;
      email?: string;
    };
    if (!body.primaryWallet || typeof body.primaryWallet !== "string") {
      return NextResponse.json({ error: "primaryWallet required" }, { status: 400 });
    }

    // SECURITY: prevent two attacks.
    // (a) Wallet hijacking — atacante autenticado como su propio Privy
    //     user claims victim's wallet as their primary_wallet, then
    //     uses the topup endpoint to reclaim victim's on-chain topup
    //     tx (which is signed by victim's wallet, validated against
    //     handler.primary_wallet).
    // (b) Wallet reassignment — once a handler is created with a wallet,
    //     re-binding to a different wallet via subsequent POST would
    //     break the bind between historical tx + agent + handler.
    //
    // Mitigation: any wallet may be claimed exactly once. The first
    // Privy user to bind it wins. Subsequent attempts (from other Privy
    // users, or even the same one with a different wallet) reject.
    const existingByWallet = await getHandlerByWallet(body.primaryWallet);
    if (existingByWallet && existingByWallet.privy_user_id !== claims.privy_user_id) {
      return NextResponse.json(
        { error: "wallet already linked to another handler" },
        { status: 403 }
      );
    }
    const existingByPrivy = await getHandlerByPrivy(claims.privy_user_id);
    if (
      existingByPrivy &&
      existingByPrivy.primary_wallet !== body.primaryWallet
    ) {
      return NextResponse.json(
        {
          error:
            "primary_wallet already set for this account — wallet recovery is not yet supported",
        },
        { status: 403 }
      );
    }

    const handler = await upsertHandler({
      privyUserId: claims.privy_user_id,
      primaryWallet: body.primaryWallet,
      email: body.email ?? null,
    });
    return NextResponse.json({ handler });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
