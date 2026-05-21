import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { listAgentsForHandler } from "@/lib/db/agents";
import { appendChatMessage } from "@/lib/db/chat";
import type { ChatRole } from "@/lib/db/types";

export const runtime = "nodejs";

const ALLOWED_ROLES: ChatRole[] = ["user", "agent", "system"];

/**
 * POST /api/agents/:id/chat
 * body: { role: "user" | "agent" | "system", content: string }
 * Appends a chat message to the agent's history.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const claims = requireAuth(req);
    const handler = await getHandlerByPrivy(claims.privy_user_id);
    if (!handler) {
      return NextResponse.json({ error: "handler not found" }, { status: 404 });
    }

    const owned = await listAgentsForHandler(handler.id);
    if (!owned.some((a) => a.id === params.id)) {
      return NextResponse.json({ error: "agent not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      role?: ChatRole;
      content?: string;
    };
    if (!body.role || !ALLOWED_ROLES.includes(body.role)) {
      return NextResponse.json(
        { error: `role must be one of ${ALLOWED_ROLES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof body.content !== "string" || !body.content.trim()) {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }

    const message = await appendChatMessage(params.id, body.role, body.content);
    return NextResponse.json({ message });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
