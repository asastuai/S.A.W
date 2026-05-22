import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * POST /api/telegram/init-pair
 *
 * Handler-authed. Creates a one-time pair code bound to this handler
 * and returns a Telegram deep link the user can click to land in our
 * bot. The bot consumes the code on /start <code> and creates the
 * permanent telegram_links row.
 *
 * Response: { deepLink, code, expiresAt }
 */
export async function POST(req: NextRequest) {
  try {
    const claims = requireAuth(req);
    const handler = await getHandlerByPrivy(claims.privy_user_id);
    if (!handler) {
      return NextResponse.json({ error: "handler not found" }, { status: 404 });
    }

    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
    if (!botUsername) {
      return NextResponse.json(
        { error: "Telegram bot not configured on server" },
        { status: 503 }
      );
    }

    const code = randomCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const db = supabaseAdmin();
    const { error } = await db.from("telegram_pair_codes").insert({
      code,
      handler_id: handler.id,
      expires_at: expiresAt,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const cleanUser = botUsername.replace(/^@/, "");
    const deepLink = `https://t.me/${cleanUser}?start=${encodeURIComponent(code)}`;

    return NextResponse.json({ deepLink, code, expiresAt });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}

function randomCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}
