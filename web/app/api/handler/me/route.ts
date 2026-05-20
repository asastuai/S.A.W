import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy, upsertHandler, touchHandlerSeen } from "@/lib/db/handlers";

export const runtime = "nodejs";

/**
 * GET /api/handler/me
 * Returns the authenticated handler row. Upserts on first call
 * (Privy login → handler row creation).
 */
export async function GET(req: NextRequest) {
  try {
    const claims = requireAuth(req);
    const existing = await getHandlerByPrivy(claims.privy_user_id);
    if (existing) {
      await touchHandlerSeen(existing.id);
      return NextResponse.json({ handler: existing });
    }
    if (!claims.wallet) {
      return NextResponse.json(
        { error: "wallet not present in claims; cannot create handler" },
        { status: 400 }
      );
    }
    const created = await upsertHandler({
      privyUserId: claims.privy_user_id,
      primaryWallet: claims.wallet,
      email: claims.email ?? null,
    });
    return NextResponse.json({ handler: created });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
