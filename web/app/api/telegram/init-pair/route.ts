import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { supabaseAdmin } from "@/lib/supabase";
import { detectProvider, isValidShape } from "@/lib/api-key";
import { storeByokKey } from "@/lib/db/byok";
import { attachByokKey, listAgentsForHandler } from "@/lib/db/agents";

export const runtime = "nodejs";

/**
 * POST /api/telegram/init-pair
 *
 * Handler-authed. Creates a one-time pair code bound to this handler
 * and returns a Telegram deep link the user can click to land in our
 * bot. The bot consumes the code on /start <code> and creates the
 * permanent telegram_links row.
 *
 * Optional body { apiKey } — when present, encrypts + stores the BYOK
 * key server-side and attaches it to all of the handler's agents so
 * the bot can call the LLM on their behalf (the browser-only key in
 * localStorage is invisible to the server otherwise).
 *
 * Response: { deepLink, code, expiresAt, keyAttached: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const claims = await requireAuth(req);
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

    let keyAttached = false;
    try {
      const body = await req.json().catch(() => ({}));
      const apiKey: string | undefined = body?.apiKey;
      if (apiKey && isValidShape(apiKey)) {
        const provider = detectProvider(apiKey);
        if (provider !== "unknown") {
          const stored = await storeByokKey({
            handlerId: handler.id,
            provider: provider as any,
            plaintextKey: apiKey,
            label: "telegram",
          });
          const agents = await listAgentsForHandler(handler.id);
          await Promise.all(agents.map((a) => attachByokKey(a.id, stored.id)));
          keyAttached = agents.length > 0;
        }
      }
    } catch (e) {
      console.warn("[telegram/init-pair] byok attach failed", e);
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

    return NextResponse.json({ deepLink, code, expiresAt, keyAttached });
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
