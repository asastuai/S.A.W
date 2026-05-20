/**
 * weekly-performance-fee — runs every Sunday 23:59 UTC.
 *
 * For each active agent:
 *   1. Read current wallet balance
 *   2. Compare to the snapshot taken last Monday 00:00 UTC
 *   3. If net positive, collect 5% of the gain on-chain
 *   4. Record fee in fee_ledger
 *   5. Reset snapshot for the next week
 *
 * If the wallet is flat or down, no fee is collected.
 */

import { logger, schedules } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.ts";
import { calcPerformanceFeeLamports } from "../lib/fees.ts";

export const weeklyPerformanceFeeJob = schedules.task({
  id: "weekly-performance-fee",
  cron: "59 23 * * 0", // Sun 23:59 UTC
  maxDuration: 600,
  run: async () => {
    const db = supabaseAdmin();
    const now = new Date();

    const { data: agents } = await db
      .from("agents")
      .select("id, handler_id, agent_pubkey, wallet_pda")
      .eq("active", true);

    let collected = 0;
    let processed = 0;

    for (const agent of agents ?? []) {
      try {
        // TODO Phase 1.3: read on-chain wallet balance for agent.wallet_pda
        // For now we placeholder zero so this can be deployed safely.
        const currentBalance = 0n;
        const baseSnapshot = 0n; // TODO: load from snapshots table

        const feeLamports = calcPerformanceFeeLamports(baseSnapshot, currentBalance);
        if (feeLamports > 0n) {
          // TODO Phase 1.3: dispatch on-chain transfer from agent wallet to SAW treasury.
          await db.from("fee_ledger").insert({
            handler_id: agent.handler_id,
            agent_id: agent.id,
            fee_kind: "performance",
            amount_lamports: Number(feeLamports),
            asset: "SOL",
            period_start: weekStart(now).toISOString(),
            period_end: now.toISOString(),
          });
          collected += Number(feeLamports);
        }
        processed++;
      } catch (e: any) {
        logger.error("performance fee failed", { agentId: agent.id, e: e.message });
      }
    }

    logger.log("weekly performance fees done", { processed, collectedLamports: collected });
    return { processed, collectedLamports: collected };
  },
});

function weekStart(d: Date): Date {
  const dt = new Date(d);
  const dow = dt.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - daysSinceMonday);
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
}
