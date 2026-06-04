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

    const BASE_COLS =
      "id, woke_at, finished_at, outcome, llm_calls, items_executed, opportunities_proposed, error_message";

    const query = (cols: string) =>
      supabaseAdmin()
        .from("agent_wakes")
        .select(cols)
        .eq("agent_id", params.id)
        .order("woke_at", { ascending: false })
        .limit(limit);

    // Prefer the richer row (with market context). If the migration that
    // adds `market_price` has not run yet, gracefully fall back so the feed
    // keeps working regardless of deploy/migration ordering.
    let { data, error } = await query(`${BASE_COLS}, market_price`);
    if (error && /market_price/i.test(error.message)) {
      ({ data, error } = await query(BASE_COLS));
    }

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
