/**
 * daily-aum-fee — runs every day at 23:55 UTC.
 *
 * For each agent that woke at least once today:
 *   1. Read current wallet balance
 *   2. Compute 1% APY / 365 of the balance
 *   3. Collect on-chain → SAW treasury
 *   4. Record in fee_ledger
 *
 * If the agent did NOT wake today (paused / disabled / inactive hours
 * skipped every tick), no fee. Active-days-only model.
 */

import { logger, schedules } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.ts";
import { calcDailyAumFeeLamports } from "../lib/fees.ts";

export const dailyAumFeeJob = schedules.task({
  id: "daily-aum-fee",
  cron: "55 23 * * *", // every day 23:55 UTC
  maxDuration: 600,
  run: async () => {
    const db = supabaseAdmin();
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);

    // Agents that woke today and finished at least one wake
    const { data: agents } = await db.rpc("agents_active_today", {
      day_start: dayStart.toISOString(),
    });

    let collected = 0;
    let processed = 0;

    for (const agent of agents ?? []) {
      try {
        // TODO Phase 1.3: read on-chain balance of agent.wallet_pda
        const balanceLamports = 0n;
        const feeLamports = calcDailyAumFeeLamports(balanceLamports);

        if (feeLamports > 0n) {
          // TODO Phase 1.3: on-chain transfer agent → treasury
          await db.from("fee_ledger").insert({
            handler_id: agent.handler_id,
            agent_id: agent.id,
            fee_kind: "aum",
            amount_lamports: Number(feeLamports),
            asset: "SOL",
            period_start: dayStart.toISOString(),
            period_end: now.toISOString(),
          });
          collected += Number(feeLamports);
        }
        processed++;
      } catch (e: any) {
        logger.error("aum fee failed", { agentId: agent.id, e: e.message });
      }
    }

    logger.log("daily AUM fees done", { processed, collectedLamports: collected });
    return { processed, collectedLamports: collected };
  },
});
