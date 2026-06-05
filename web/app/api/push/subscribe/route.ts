import { NextRequest, NextResponse } from "next/server";

import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * POST /api/push/subscribe
 * Body: { subscription: PushSubscriptionJSON }
 * Stores (or refreshes) this browser's web-push subscription for the handler.
 */
export async function POST(req: NextRequest) {
  try {
    const claims = await requireAuth(req);
    const handler = await getHandlerByPrivy(claims.privy_user_id);
    if (!handler) {
      return NextResponse.json({ error: "no handler" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const sub = body?.subscription ?? body;
    const endpoint: string | undefined = sub?.endpoint;
    const p256dh: string | undefined = sub?.keys?.p256dh;
    const auth: string | undefined = sub?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: "invalid subscription" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();
    const { error } = await db.from("push_subscriptions").upsert(
      {
        handler_id: handler.id,
        endpoint,
        p256dh,
        auth,
        user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      },
      { onConflict: "endpoint" }
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
