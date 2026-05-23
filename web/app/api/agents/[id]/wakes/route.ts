import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { listAgentsForHandler } from "@/lib/db/agents";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/agents/:id/wakes?limit=10
 * Returns the most recent wake events for an agent (audit trail).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const claims = await requireAuth(req);
    const handler = await getHandlerByPrivy(claims.privy_user_id);
    if (!handler) return NextResponse.json({ wakes: [] });

    const owned = await listAgentsForHandler(handler.id);
    if (!owned.some((a) => a.id === params.id)) {
      return NextResponse.json({ wakes: [] });
    }

    const limit = Math.min(
      50,
      Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? 10))
    );

    const { data, error } = await supabaseAdmin()
      .from("agent_wakes")
      .select("id, woke_at, finished_at, outcome, llm_calls, items_executed, opportunities_proposed, error_message")
      .eq("agent_id", params.id)
      .order("woke_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ wakes: data ?? [] });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
