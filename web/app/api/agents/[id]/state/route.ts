import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { listAgentsForHandler } from "@/lib/db/agents";
import { listChatMessages } from "@/lib/db/chat";
import { listScheduleForAgent } from "@/lib/db/schedule";
import { listPendingOpportunities } from "@/lib/db/opportunities";

export const runtime = "nodejs";

/**
 * GET /api/agents/:id/state
 * Returns the full hydrated state for an agent (chat history, schedule,
 * pending opportunities). Used by the demo on session restore to replace
 * the localStorage briefing read with a DB-backed one.
 *
 * Ownership-checked: the caller must own the agent.
 */
export async function GET(
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
    const agent = owned.find((a) => a.id === params.id);
    if (!agent) {
      return NextResponse.json({ error: "agent not found" }, { status: 404 });
    }

    const [chat, schedule, opportunities] = await Promise.all([
      listChatMessages(agent.id, 200),
      listScheduleForAgent(agent.id),
      listPendingOpportunities(agent.id),
    ]);

    return NextResponse.json({
      agent,
      chat,
      schedule,
      opportunities,
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
