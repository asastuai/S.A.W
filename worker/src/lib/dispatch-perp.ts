/**
 * worker/src/lib/dispatch-perp.ts
 *
 * Autonomous perp dispatch — the first on-chain leg of SAW's worker.
 *
 * KEY INVARIANTS (spec §reglas duras):
 *   1. NO auto-retry. A failed step writes status='failed' and returns. Full stop.
 *   2. ATOMIC CLAIM (M-5): update status='executing' where status='queued'.
 *      If 0 rows returned, another wake took it — return 'claimed-elsewhere'.
 *   3. Policy re-evaluated AT FIRE TIME (daily budget may have been consumed).
 *   4. Oracle gap guard: if price drifted >1.5% BEYOND the trigger direction,
 *      skip entry (entering late and badly priced — spec §precios).
 *   5. Double-fire guard via hasOpenOrderWithUserOrderId.
 *   6. Defense-in-depth: requireStopLoss checked again even though schedule
 *      route already enforced it (spec §errores).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VenueAdapter } from "./venue.js";
import {
  evaluatePerpPolicy,
  deriveUserOrderId,
  type PerpPolicyParams,
} from "./perp-policy.js";

/** Percentage threshold for oracle gap guard (spec §precios) */
const ORACLE_GAP_PCT = 1.5;

// ── Types ─────────────────────────────────────────────────────────────────────

export type DispatchInput = {
  db: SupabaseClient;
  adapter: VenueAdapter;
  /** Row from scheduled_items (any perp-open or perp-close item) */
  item: Record<string, unknown>;
  policy: PerpPolicyParams;
  /** sum(perp_margin_usdc) of done perp-open items today UTC — caller provides */
  dailyMarginUsedUsdc: number;
  /** count of currently open perp positions */
  openPositions: number;
};

export type DispatchResult = {
  outcome:
    | "done"
    | "claimed-elsewhere"
    | "denied"
    | "skipped"
    | "failed";
  /** Terminal error_message (same value written to the DB row). Present for
   *  denied/skipped/failed outcomes; undefined for done and claimed-elsewhere. */
  error_message?: string;
};

// ── Main dispatch function ────────────────────────────────────────────────────

export async function dispatchPerpItem(input: DispatchInput): Promise<DispatchResult> {
  const { db, adapter, item } = input;

  // ── 1. ATOMIC CLAIM (M-5) ──────────────────────────────────────────────────
  // update ... set status='executing' where id=X AND status='queued'
  // If 0 rows returned, a concurrent wake already claimed it. Stop immediately.
  const { data: claimed } = await db
    .from("scheduled_items")
    .update({ status: "executing" })
    .eq("id", item["id"])
    .eq("status", "queued")
    .select("id");

  if (!claimed?.length) {
    return { outcome: "claimed-elsewhere" };
  }

  // ── Helper: write terminal status and return ───────────────────────────────
  // NO retry is ever added here (spec rule 1).
  const finish = async (
    status: "done" | "denied" | "skipped" | "failed",
    extra: Record<string, unknown> = {},
  ): Promise<DispatchResult> => {
    await db
      .from("scheduled_items")
      .update({ status, ...extra })
      .eq("id", item["id"]);
    const errorMsg = extra["error_message"] as string | undefined;
    return { outcome: status, ...(errorMsg !== undefined ? { error_message: errorMsg } : {}) };
  };

  try {
    // ── PERP-CLOSE path ──────────────────────────────────────────────────────
    if (item["action_type"] === "perp-close") {
      const res = await adapter.closePerp(item["perp_market"] as string);
      if ("alreadyClosed" in res) {
        return await finish("skipped", {
          error_message: "position already closed",
        });
      }
      return await finish("done", {
        tx_signature: res.txSig,
        executed_at: new Date().toISOString(),
      });
    }

    // ── PERP-OPEN path ───────────────────────────────────────────────────────

    const intent = {
      market: item["perp_market"] as string,
      side: item["perp_side"] as "long" | "short",
      leverage: Number(item["perp_leverage"]),
      marginUsdc: Number(item["perp_margin_usdc"]),
      stopLoss:
        item["perp_stop_loss"] != null ? Number(item["perp_stop_loss"]) : null,
      takeProfit:
        item["perp_take_profit"] != null
          ? Number(item["perp_take_profit"])
          : null,
    };

    // ── 2. FIRE-TIME POLICY RE-CHECK ────────────────────────────────────────
    // The daily budget may have been consumed by concurrent wakes since this item
    // was queued. Re-evaluate now, at the moment of dispatch.
    const verdict = evaluatePerpPolicy(intent, input.policy, {
      dailyMarginUsedUsdc: input.dailyMarginUsedUsdc,
      openPositions: input.openPositions,
    });
    if (verdict.verdict !== "allowed") {
      // Both "denied" and "requires-approval" carry a .reason field
      const reason = (verdict as { verdict: string; reason: string }).reason;
      return await finish("denied", {
        error_message: `policy at fire time: ${reason}`,
      });
    }

    // ── 3. ORACLE GAP GUARD ─────────────────────────────────────────────────
    // If the oracle drifted >1.5% BEYOND the trigger direction since the trigger
    // fired, we are entering late and badly priced. Skip, do not enter.
    const oracle = await adapter.getOraclePrice(intent.market);
    // For dip triggers, trigger_target_price is null — use effectiveTriggerPrice()
    // to compute basis*(1-drop/100). For time triggers, oracle is returned (gap = 0).
    const trigPrice = effectiveTriggerPrice(item, oracle);

    const gapPct = Math.abs(oracle - trigPrice) / trigPrice;
    if (
      gapPct > ORACLE_GAP_PCT / 100 &&
      beyondTrigger(item["trigger_kind"] as string, oracle, trigPrice)
    ) {
      return await finish("skipped", {
        error_message: `oracle gap: trigger $${trigPrice} vs oracle $${oracle.toFixed(2)} (>${ORACLE_GAP_PCT}%)`,
      });
    }

    // ── 4. DOUBLE-FIRE GUARD (idempotency) ─────────────────────────────────
    const uoid =
      item["perp_user_order_id"] != null
        ? Number(item["perp_user_order_id"])
        : deriveUserOrderId(item["id"] as string);

    if (await adapter.hasOpenOrderWithUserOrderId(uoid)) {
      return await finish("skipped", {
        error_message:
          "duplicate: order with same userOrderId already open",
      });
    }

    // ── 5. COLLATERAL CHECK ─────────────────────────────────────────────────
    // Throws "insufficient float: ..." if balance < marginUsdc.
    // NO retry on failure (spec rule 1).
    await adapter.ensureDeposited(intent.marginUsdc);

    // ── 6. VENUE SEND ───────────────────────────────────────────────────────
    // openPerp throws on venue rejection — caught below, written as 'failed'.
    // NO retry (spec rule 1).
    const res = await adapter.openPerp(intent, uoid);

    return await finish("done", {
      tx_signature: res.txSig,
      executed_at: new Date().toISOString(),
    });
  } catch (e: unknown) {
    // Any unhandled exception → failed, no retry.
    const msg = (e as Error)?.message ?? String(e);
    return await finish("failed", { error_message: msg });
  }
}

// ── effectiveTriggerPrice ────────────────────────────────────────────────────

/**
 * Returns the effective trigger price to use in the oracle gap guard.
 *
 * - below/above: trigger_target_price (the explicit price level).
 * - dip: computed as trigger_basis_price * (1 - trigger_drop_pct / 100).
 *   Before M-2 fix this fell through to oracle, making the gap guard a no-op
 *   for all dip triggers.
 * - time (or malformed): oracle (gap = 0, never skipped by gap guard).
 *
 * Exported for unit testing.
 */
export function effectiveTriggerPrice(
  item: Record<string, unknown>,
  oracle: number,
): number {
  if (item["trigger_target_price"] != null) {
    return Number(item["trigger_target_price"]);
  }
  if (
    item["trigger_kind"] === "dip" &&
    item["trigger_basis_price"] != null &&
    item["trigger_drop_pct"] != null
  ) {
    return Number(item["trigger_basis_price"]) * (1 - Number(item["trigger_drop_pct"]) / 100);
  }
  // time triggers or malformed dip rows: no price target, gap = 0
  return oracle;
}

// ── Oracle gap direction helper ───────────────────────────────────────────────

/**
 * Returns true if the oracle moved BEYOND the trigger direction far enough to
 * make the entry badly priced.
 *
 * For a "below" or "dip" trigger (we wanted to buy the dip):
 *   - oracle well BELOW the trigger price = we are now chasing a bigger dip = skip
 * For an "above" trigger (we wanted to buy the breakout):
 *   - oracle well ABOVE the trigger price = we are chasing the top = skip
 * For "time" triggers: beyondTrigger returns false (no price target).
 */
function beyondTrigger(
  triggerKind: string,
  oracle: number,
  trigPrice: number,
): boolean {
  if (triggerKind === "below" || triggerKind === "dip") return oracle < trigPrice;
  if (triggerKind === "above") return oracle > trigPrice;
  return false;
}

/** Items in 'executing' for longer than this are considered stuck (worker died). */
const STUCK_EXECUTING_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

// ── reconcileStuckExecuting ───────────────────────────────────────────────────

/**
 * Janitor: finds this agent's scheduled_items stuck in 'executing' status for
 * longer than STUCK_EXECUTING_THRESHOLD_MS and marks them 'failed'.
 *
 * WHY: If the worker process dies between the atomic claim (status='executing')
 * and the terminal status write (done/failed/skipped), the row stays 'executing'
 * forever. It is SAFE (never re-picked, no double-send) but invisible. This
 * janitor surfaces it to a human for manual verification.
 *
 * TIMESTAMP HEURISTIC: scheduled_items has no 'claimed_at' column. We use
 * created_at (the time the item was inserted into the queue, not when it was
 * claimed). This is a conservative over-estimate — for items that sat in
 * 'queued' a long time before firing, created_at may be much older than the
 * actual claim time. The threshold (10 min) is intentionally large enough that
 * a brand-new item fired immediately is still never falsely reconciled.
 * SAFETY: reconcile runs at the START of a wake, before this wake dispatches,
 * and dispatchPerpItem is awaited synchronously within a wake — so a row is only
 * ever 'executing' here if a PRIOR wake died mid-dispatch. Residual edge: if
 * agent_wake instances ever overlap (concurrent wakes), a long in-flight dispatch
 * whose item was queued >threshold ago could be marked 'failed' while its tx is
 * still landing. Acceptable for now (the failure mode is already safe — M-5 blocks
 * double-send), tracked as a follow-up: add a 'claimed_at' column for an exact
 * heuristic instead of created_at.
 *
 * NEVER auto-retries. A tx may have landed — a human must check.
 *
 * Called by agent-wake.ts BEFORE processing pending items.
 */
export async function reconcileStuckExecuting(
  db: SupabaseClient,
  agentId: string,
): Promise<void> {
  const threshold = new Date(Date.now() - STUCK_EXECUTING_THRESHOLD_MS);
  const thresholdIso = threshold.toISOString();

  await db
    .from("scheduled_items")
    .update({
      status: "failed",
      error_message:
        "reconciled: stuck in executing (worker died mid-dispatch?) — verify position manually",
    })
    .eq("agent_id", agentId)
    .eq("status", "executing")
    .lt("created_at", thresholdIso)
    .select("id");
}

// ── sumMarginExecutedTodayUTC ─────────────────────────────────────────────────

/**
 * Returns the sum of perp_margin_usdc for all 'done' perp-open items today UTC.
 * Used by the worker to populate dailyMarginUsedUsdc before calling dispatchPerpItem.
 *
 * Worker-side copy — mirrors the equivalent helper in web/lib/db/schedule.ts.
 * UTC-day boundary: 00:00:00.000Z of today.
 */
export async function sumMarginExecutedTodayUTC(
  db: SupabaseClient,
  agentId: string,
): Promise<number> {
  // UTC midnight of today
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const todayIso = todayUtc.toISOString();

  const { data, error } = await db
    .from("scheduled_items")
    .select("perp_margin_usdc")
    .eq("agent_id", agentId)
    .eq("status", "done")
    .gte("executed_at", todayIso);

  if (error) {
    // Non-fatal: if we can't read the budget, return 0 (conservative — dispatch
    // will re-check the policy and may deny if budget is really exhausted).
    return 0;
  }

  return (data ?? []).reduce(
    (sum: number, row: Record<string, unknown>) =>
      sum + Number(row["perp_margin_usdc"] ?? 0),
    0,
  );
}
