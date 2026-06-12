/**
 * web/app/api/agents/[id]/positions/route.ts
 *
 * GET /api/agents/:id/positions
 *
 * Returns:
 *   {
 *     positions: PerpPosition[],  // open positions (source: "db" in Phase 1)
 *     pending:   ScheduledItemView[]  // queued/awaiting-approval perp items
 *   }
 *
 * positions source: "db" (last-known, derived from scheduled_items).
 * Phase 2 will switch to source: "chain" once worker→web sync is wired.
 *
 * pending items give the UI visibility into conditional entries that
 * haven't executed yet (trigger-based perp-open/perp-close).
 *
 * NOTE: migration 0014_perps.sql is PENDING manual application to live
 * Supabase. Code is correct; DB calls will fail until the migration is applied.
 */

import { NextRequest, NextResponse } from "next/server";

import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { listAgentsForHandler } from "@/lib/db/agents";
import { supabaseAdmin } from "@/lib/supabase";
import { getPositionsFromDb, type PerpPosition } from "@/lib/venue-read";
import type { Agent, TriggerKind, ActionType } from "@/lib/db/types";

export const runtime = "nodejs";

// ── Shared helpers (same pattern as schedule/route.ts) ────────────────────────

class HttpError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

async function getOwnedAgentOr404(req: NextRequest, agentId: string): Promise<Agent> {
  const claims = await requireAuth(req);
  const handler = await getHandlerByPrivy(claims.privy_user_id);
  if (!handler) throw new HttpError(404, "handler not found");
  const owned = await listAgentsForHandler(handler.id);
  const agent = owned.find((a) => a.id === agentId);
  if (!agent) throw new HttpError(404, "agent not found");
  return agent;
}

// ── ScheduledItemView — safe subset of ScheduledItem for the response ─────────

/**
 * View shape for pending perp items returned in the positions response.
 * Carries trigger label fields so the UI can display "if SOL drops 5%".
 */
export interface ScheduledItemView {
  id: string;
  action_type: ActionType;
  status: "queued" | "awaiting-approval";
  trigger_kind: TriggerKind;
  trigger_basis_price: number | null;
  trigger_drop_pct: number | null;
  trigger_target_price: number | null;
  trigger_deadline: string | null;
  perp_market: string | null;
  perp_side: "long" | "short" | null;
  perp_leverage: number | null;
  perp_margin_usdc: number | null;
  perp_stop_loss: number | null;
  perp_take_profit: number | null;
  scheduled_for: string;
  reason: string | null;
  created_at: string;
}

// ── GET /api/agents/:id/positions ─────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await getOwnedAgentOr404(req, params.id);

    const [positions, pendingRows] = await Promise.all([
      getPositionsFromDb(params.id),
      fetchPendingItems(params.id),
    ]);

    return NextResponse.json({ positions, pending: pendingRows });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}

// ── Fetch pending perp items ──────────────────────────────────────────────────

async function fetchPendingItems(agentId: string): Promise<ScheduledItemView[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("scheduled_items")
    .select(
      "id, action_type, status, trigger_kind, trigger_basis_price, trigger_drop_pct, " +
      "trigger_target_price, trigger_deadline, perp_market, perp_side, perp_leverage, " +
      "perp_margin_usdc, perp_stop_loss, perp_take_profit, scheduled_for, reason, created_at"
    )
    .eq("agent_id", agentId)
    .in("action_type", ["perp-open", "perp-close"])
    .in("status", ["queued", "awaiting-approval"])
    .order("scheduled_for", { ascending: true });

  if (error) throw new Error(`fetchPendingItems: ${error.message}`);
  return (data ?? []) as unknown as ScheduledItemView[];
}
