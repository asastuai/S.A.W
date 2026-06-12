/**
 * agent_wake — the heart of SAW's runtime.
 *
 * Triggered by a per-agent cron schedule. Each tick:
 *   1. Loads agent state
 *   2. Checks active-hours window
 *   3. Fetches market snapshot (cached server-side)
 *   4. Calls the agent's LLM (using the user's BYOK key) for a scan
 *   5. Checks any pending price-triggers and executes those that fire
 *   6. Persists wake outcome + sleeps until next tick
 *
 * Each wake produces one row in agent_wakes for audit + transparency.
 */

import { logger, schedules } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.ts";
import { describeMarket, getMarketSnapshot } from "../lib/market.ts";
import { isVenueEnabled, makeAdrenaAdapter } from "../lib/venue.ts";
import { DEFAULT_PERP_POLICY } from "../lib/perp-policy.ts";
import { dispatchPerpItem, sumMarginExecutedTodayUTC } from "../lib/dispatch-perp.ts";
import { loadTradingKeypair } from "../lib/trading-key.ts";
import type { PerpPolicyParams } from "../lib/perp-policy.ts";

type AgentRow = {
  id: string;
  handler_id: string;
  persona: "greedie" | "conservador" | "estable";
  agent_pubkey: string;
  wallet_pda: string;
  policy_pda: string;
  queue_pda: string;
  active: boolean;
  cron_cadence_minutes: number;
  active_hours_start: number | null;
  active_hours_end: number | null;
  byok_key_id: string | null;
  // perp_policy: from migration 0014 — jsonb column; null means DEFAULT_PERP_POLICY
  perp_policy: PerpPolicyParams | null;
};

function withinActiveHours(agent: AgentRow, now: Date): boolean {
  if (agent.active_hours_start == null || agent.active_hours_end == null) return true;
  const hourUTC = now.getUTCHours();
  const start = agent.active_hours_start;
  const end = agent.active_hours_end;
  if (start <= end) return hourUTC >= start && hourUTC < end;
  return hourUTC >= start || hourUTC < end;
}

export const agentWakeJob = schedules.task({
  id: "agent-wake",
  // Dynamic schedules are attached per-agent via the SDK at agent creation,
  // not at deploy time. This declaration registers the task with Trigger.
  maxDuration: 120,
  run: async (payload, { ctx }) => {
    const agentId = payload.externalId;
    if (!agentId) {
      logger.error("agent_wake invoked without externalId");
      return { outcome: "failed", reason: "missing-external-id" };
    }

    const db = supabaseAdmin();
    const startedAt = new Date();

    const { data: agent, error: agentErr } = await db
      .from("agents")
      .select("*")
      .eq("id", agentId)
      .maybeSingle();

    if (agentErr || !agent) {
      logger.error("agent not found", { agentId, err: agentErr });
      return { outcome: "failed", reason: "agent-not-found" };
    }

    const a = agent as AgentRow;
    const wakeRow = await db
      .from("agent_wakes")
      .insert({ agent_id: a.id, woke_at: startedAt.toISOString() })
      .select("id")
      .single();
    const wakeId = wakeRow.data?.id;

    let outcome: string = "scanned-no-action";
    let llmCalls = 0;
    let executed = 0;
    let proposed = 0;
    let errorMessage: string | undefined;

    try {
      if (!a.active) {
        outcome = "skipped-inactive-hours";
      } else if (!withinActiveHours(a, startedAt)) {
        outcome = "skipped-inactive-hours";
      } else {
        // 1. Market snapshot
        const snap = await getMarketSnapshot("SOL");
        logger.log("market", { snapshot: describeMarket(snap) });

        // 2. Check pending price triggers
        const { data: pending } = await db
          .from("scheduled_items")
          .select("*")
          .eq("agent_id", a.id)
          .eq("status", "queued");

        for (const item of pending ?? []) {
          if (!shouldFire(item, snap.priceUsd, startedAt)) continue;

          // ── PERP DISPATCH (Phase 1 — Task 7) ───────────────────────────────
          // Implements the M-5 atomic-claim rule from the v1.5 audit:
          // The status transition to 'executing' happens INSIDE dispatchPerpItem,
          // atomically paired with the tx send via an optimistic guard
          // (.eq("status","queued")). If 0 rows are claimed, a concurrent wake
          // already took this item — we skip safely with no double-execute.
          if (
            item.action_type === "perp-open" ||
            item.action_type === "perp-close"
          ) {
            if (!isVenueEnabled()) {
              logger.log("venue disabled — skipping perp item", { itemId: item.id });
              continue;
            }

            const kp = await loadTradingKeypair(db, a.id);
            if (!kp) {
              logger.log("no trading key for agent — skipping perp item", {
                itemId: item.id,
                agentId: a.id,
              });
              continue;
            }

            const rpcUrl = process.env["VENUE_RPC_URL"] ?? "http://127.0.0.1:8899";
            const adapter = await makeAdrenaAdapter({ rpcUrl, authority: kp });
            try {
              const policy: PerpPolicyParams = a.perp_policy ?? DEFAULT_PERP_POLICY;
              const dailyUsed = await sumMarginExecutedTodayUTC(db, a.id);
              const positions = await adapter.getPositions();

              const r = await dispatchPerpItem({
                db,
                adapter,
                item,
                policy,
                dailyMarginUsedUsdc: dailyUsed,
                openPositions: positions.length,
              });

              logger.log("perp dispatch result", { itemId: item.id, outcome: r.outcome });

              if (r.outcome === "done") {
                executed++;
                outcome = "perp-dispatched";
              } else if (r.outcome === "claimed-elsewhere") {
                // Another wake took it — normal, not an error
                logger.log("item claimed by concurrent wake", { itemId: item.id });
              }
            } finally {
              // Always disconnect, even on throw (adapter is stateless but protocol)
              await adapter.disconnect();
            }
            continue; // pay/swap dispatch stays deferred (Phase 1.1)
          }

          // ── Non-perp items: trigger detected, dispatch still deferred ──────
          // pay/swap autonomous dispatch is Phase 1.1 — out of scope here.
          logger.log("trigger fired — non-perp dispatch deferred to Phase 1.1", {
            itemId: item.id,
            actionType: item.action_type,
          });
          executed++;
          outcome = "trigger-detected";
        }

        // 3. LLM scan (only if BYOK key configured)
        if (a.byok_key_id) {
          // TODO Phase 1.2: load BYOK key, decrypt, call provider, propose opportunity.
          // For Phase 0 we just mark that the slot exists.
          llmCalls = 0;
        }
      }

      const nextWake = new Date(startedAt.getTime() + a.cron_cadence_minutes * 60_000);
      await db
        .from("agents")
        .update({
          last_wake_at: startedAt.toISOString(),
          next_wake_at: nextWake.toISOString(),
        })
        .eq("id", a.id);
    } catch (e: any) {
      outcome = "failed";
      errorMessage = e?.message ?? String(e);
      logger.error("wake failed", { agentId, error: errorMessage });
    } finally {
      if (wakeId) {
        await db
          .from("agent_wakes")
          .update({
            finished_at: new Date().toISOString(),
            outcome,
            llm_calls: llmCalls,
            items_executed: executed,
            opportunities_proposed: proposed,
            error_message: errorMessage ?? null,
          })
          .eq("id", wakeId);
      }
    }

    return { outcome, llmCalls, executed, proposed };
  },
});

function shouldFire(item: any, currentPrice: number, now: Date): boolean {
  if (item.trigger_deadline && new Date(item.trigger_deadline) < now) return false;
  switch (item.trigger_kind) {
    case "time":
      return new Date(item.scheduled_for) <= now;
    case "dip": {
      const target = item.trigger_basis_price * (1 - item.trigger_drop_pct / 100);
      return currentPrice <= target;
    }
    case "below":
      return currentPrice <= item.trigger_target_price;
    case "above":
      return currentPrice >= item.trigger_target_price;
    default:
      return false;
  }
}
