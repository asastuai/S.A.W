/**
 * web/lib/venue-read.ts
 *
 * Read-only positions view for the web layer.
 *
 * DESIGN CHOICE — source: "db" (not "chain"):
 *   The web app cannot import worker/src/lib/venue.ts (different tsconfig,
 *   @solana/kit v6 vs web's v6, and the Adrena SDK is only vendored in
 *   ~/vendor/adrena-sdk-ts without a web build configured for it).
 *
 *   We derive open positions from scheduled_items instead:
 *     open = perp-open items with status "done" that have no matching
 *            perp-close item with status "done" for the same market+side.
 *
 *   This is accurate for Phase 1 because:
 *     - Every position was opened by SAW (no external positions).
 *     - Worker marks the item "done" after confirmation.
 *     - Worker marks a perp-close "done" on close.
 *     - SL/TP keepers may close outside worker — this becomes stale in that
 *       edge case. The UI must show `source: "db"` so users know it's last-known.
 *
 *   Phase 2 will add a worker→web positions sync (websocket or polling) and
 *   switch source to "chain" for live on-chain reads.
 *
 * PerpPosition type mirrors worker/src/lib/venue.ts PerpPosition exactly
 * so Task 9 UI components can use the same type from either source.
 */

import { supabaseAdmin } from "@/lib/supabase";
import type { ScheduledItem } from "@/lib/db/types";

// ── PerpPosition (mirrors worker/src/lib/venue.ts — keep in sync) ─────────────

export type PerpPosition = {
  market: string;
  side: "long" | "short";
  baseSize: number;           // 0 in db-derived view (not stored on-chain read)
  entryPrice: number;         // 0 in db-derived view (not stored)
  markPrice: number;          // 0 in db-derived view (no oracle read)
  unrealizedPnlUsdc: number;  // 0 in db-derived view
  liqPrice: number | null;    // null in db-derived view
  stopLoss: number | null;    // from perp_stop_loss column
  takeProfit: number | null;  // from perp_take_profit column
  // Extra metadata for db-derived view:
  source: "db" | "chain";
  marginUsdc: number | null;  // from perp_margin_usdc
  leverage: number | null;    // from perp_leverage
};

// ── Derive open positions from scheduled_items ────────────────────────────────

/**
 * Returns open perp positions derived from scheduled_items in the DB.
 * source: "db" — last-known state, not live on-chain data.
 *
 * Algorithm:
 *   1. Fetch all done perp-open items for the agent.
 *   2. Fetch all done perp-close items for the agent.
 *   3. For each open item, check if a matching close exists for the same market.
 *      If no close → position is open.
 *
 * Note: perp-close items do not store perp_side (the close covers any position
 * for that market), so matching is by market only.
 */
export async function getPositionsFromDb(agentId: string): Promise<PerpPosition[]> {
  const db = supabaseAdmin();

  const [opensResult, closesResult] = await Promise.all([
    db
      .from("scheduled_items")
      .select(
        "id, perp_market, perp_side, perp_leverage, perp_margin_usdc, perp_stop_loss, perp_take_profit, executed_at"
      )
      .eq("agent_id", agentId)
      .eq("action_type", "perp-open")
      .eq("status", "done"),
    db
      .from("scheduled_items")
      .select("perp_market, executed_at")
      .eq("agent_id", agentId)
      .eq("action_type", "perp-close")
      .eq("status", "done"),
  ]);

  if (opensResult.error) throw new Error(`getPositionsFromDb opens: ${opensResult.error.message}`);
  if (closesResult.error) throw new Error(`getPositionsFromDb closes: ${closesResult.error.message}`);

  const opens = (opensResult.data ?? []) as Array<{
    id: string;
    perp_market: string | null;
    perp_side: "long" | "short" | null;
    perp_leverage: number | null;
    perp_margin_usdc: number | null;
    perp_stop_loss: number | null;
    perp_take_profit: number | null;
    executed_at: string | null;
  }>;

  const closes = (closesResult.data ?? []) as Array<{
    perp_market: string | null;
    executed_at: string | null;
  }>;

  // Build a set of (market, close_executed_at) pairs — used to match opens.
  // For each open, a close for the same market executed AFTER the open counts.
  const positions: PerpPosition[] = [];
  for (const open of opens) {
    if (!open.perp_market || !open.perp_side) continue; // skip malformed rows

    const openTime = open.executed_at ? new Date(open.executed_at).getTime() : 0;

    // Is there a close for the same market that happened after this open?
    const closed = closes.some((c) => {
      if (c.perp_market !== open.perp_market) return false;
      const closeTime = c.executed_at ? new Date(c.executed_at).getTime() : 0;
      return closeTime >= openTime;
    });

    if (!closed) {
      positions.push({
        market: open.perp_market,
        side: open.perp_side,
        baseSize: 0,
        entryPrice: 0,
        markPrice: 0,
        unrealizedPnlUsdc: 0,
        liqPrice: null,
        stopLoss: open.perp_stop_loss,
        takeProfit: open.perp_take_profit,
        source: "db",
        marginUsdc: open.perp_margin_usdc,
        leverage: open.perp_leverage,
      });
    }
  }

  return positions;
}
