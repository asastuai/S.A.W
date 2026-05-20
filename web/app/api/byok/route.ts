import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { deleteByokKey, listByokKeysForHandler, storeByokKey } from "@/lib/db/byok";
import type { Provider } from "@/lib/db/types";

export const runtime = "nodejs";

const ALLOWED_PROVIDERS: Provider[] = ["groq"];
// Future: ["groq", "openai", "anthropic", "gemini", "grok"]

function validateProvider(p: string): p is Provider {
  return ALLOWED_PROVIDERS.includes(p as Provider);
}

function shapeLooksReasonable(provider: Provider, key: string): boolean {
  if (provider === "groq") return key.startsWith("gsk_") && key.length > 20;
  return key.length > 10;
}

/**
 * POST /api/byok
 * body: { provider: "groq" | ..., plaintext: "gsk_...", label?: string }
 * Encrypts and stores the BYOK key for the authenticated handler.
 */
export async function POST(req: NextRequest) {
  try {
    const claims = requireAuth(req);
    const handler = await getHandlerByPrivy(claims.privy_user_id);
    if (!handler) {
      return NextResponse.json(
        { error: "handler not found — visit /api/handler/me first" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { provider, plaintext, label } = body ?? {};

    if (!validateProvider(provider)) {
      return NextResponse.json(
        { error: `provider must be one of ${ALLOWED_PROVIDERS.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof plaintext !== "string" || !shapeLooksReasonable(provider, plaintext)) {
      return NextResponse.json(
        { error: "plaintext key looks invalid for this provider" },
        { status: 400 }
      );
    }

    const row = await storeByokKey({
      handlerId: handler.id,
      provider,
      plaintextKey: plaintext,
      label,
    });

    // never echo plaintext back
    return NextResponse.json({
      id: row.id,
      provider: row.provider,
      label: row.key_label,
      created_at: row.created_at,
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}

/**
 * GET /api/byok
 * Returns metadata for all the handler's BYOK keys. Never plaintext.
 */
export async function GET(req: NextRequest) {
  try {
    const claims = requireAuth(req);
    const handler = await getHandlerByPrivy(claims.privy_user_id);
    if (!handler) return NextResponse.json({ keys: [] });

    const keys = await listByokKeysForHandler(handler.id);
    return NextResponse.json({
      keys: keys.map((k) => ({
        id: k.id,
        provider: k.provider,
        label: k.key_label,
        created_at: k.created_at,
        last_used_at: k.last_used_at,
      })),
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}

/**
 * DELETE /api/byok?id=<uuid>
 */
export async function DELETE(req: NextRequest) {
  try {
    const claims = requireAuth(req);
    const handler = await getHandlerByPrivy(claims.privy_user_id);
    if (!handler) return NextResponse.json({ ok: true });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

    // ownership check: ensure the key belongs to this handler.
    const keys = await listByokKeysForHandler(handler.id);
    if (!keys.some((k) => k.id === id)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    await deleteByokKey(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
