import { NextRequest, NextResponse } from "next/server";
import { webhookHandler } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Telegram webhook. Configure once with:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://saw-gilt.vercel.app/api/telegram/webhook&secret_token=<SECRET>"
 *
 * Telegram includes a header X-Telegram-Bot-Api-Secret-Token if a
 * secret_token was registered. We optionally verify it.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== expected) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const handler = webhookHandler();
  if (!handler) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN not configured" },
      { status: 503 }
    );
  }

  return handler(req as unknown as Request);
}
