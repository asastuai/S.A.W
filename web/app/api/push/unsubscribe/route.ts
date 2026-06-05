import { NextRequest, NextResponse } from "next/server";

import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * POST /api/push/unsubscribe
 * Body: { endpoint: string }
 * Removes this browser's push subscription for the handler.
 */
export async function POST(req: NextRequest) {
  try {
    const claims = await requireAuth(req);
    const handler = await getHandlerByPrivy(claims.privy_user_id);
    if (!handler) return NextResponse.json({ ok: true });

    const body = await req.json().catch(() => null);
    const endpoint: string | undefined = body?.endpoint;
    if (!endpoint) {
      return NextResponse.json({ error: "no endpoint" }, { status: 400 });
    }

    const db = supabaseAdmin();
    await db
      .from("push_subscriptions")
      .delete()
      .eq("handler_id", handler.id)
      .eq("endpoint", endpoint);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
