import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * POST /api/telegram/pair
 * body: { code }
 * Looks up the pair code, verifies it hasn't expired or been consumed,
 * upserts a telegram_links row binding chat_id → handler_id.
 *
 * The /connect/telegram page calls this after Privy auth.
 */
export async function POST(req: NextRequest) {
  try {
    const claims = await requireAuth(req);
    const handler = await getHandlerByPrivy(claims.privy_user_id);
    if (!handler) {
      return NextResponse.json({ error: "handler not found" }, { status: 404 });
    }

    const { code } = (await req.json().catch(() => ({}))) as { code?: string };
    if (!code) {
      return NextResponse.json({ error: "code required" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: pair } = await db
      .from("telegram_pair_codes")
      .select("chat_id, username, expires_at, consumed_at")
      .eq("code", code)
      .maybeSingle();

    if (!pair) {
      return NextResponse.json({ error: "invalid code" }, { status: 404 });
    }
    if (pair.consumed_at) {
      return NextResponse.json({ error: "code already used" }, { status: 410 });
    }
    if (new Date(pair.expires_at) < new Date()) {
      return NextResponse.json({ error: "code expired" }, { status: 410 });
    }

    // Upsert link (one chat_id per handler; reassign if chat already linked elsewhere)
    await db.from("telegram_links").upsert(
      {
        handler_id: handler.id,
        chat_id: pair.chat_id,
        username: pair.username,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "chat_id" }
    );

    await db
      .from("telegram_pair_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("code", code);

    return NextResponse.json({
      ok: true,
      chatId: pair.chat_id,
      username: pair.username,
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
