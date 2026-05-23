import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy, upsertHandler, touchHandlerSeen } from "@/lib/db/handlers";

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
