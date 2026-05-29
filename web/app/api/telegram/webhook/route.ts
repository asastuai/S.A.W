import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { webhookHandler } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secretsMatch(got: string | null, expected: string): boolean {
  if (!got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Telegram webhook. Configure once with:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://saw-gilt.vercel.app/api/telegram/webhook&secret_token=<SECRET>"
 *
 * Telegram includes a header X-Telegram-Bot-Api-Secret-Token if a
 * secret_token was registered.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  // H-1 fix (v1.5 audit): fail CLOSED. Without a configured secret the
  // webhook is an open relay — anyone could forge Telegram updates as any
  // linked user (credit drain, prompt injection, phishing via the bot). So
  // refuse to serve, and verify the header with a constant-time compare.
  if (!expected) {
    return NextResponse.json(
      { error: "TELEGRAM_WEBHOOK_SECRET not configured" },
      { status: 503 }
    );
  }
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secretsMatch(got, expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
