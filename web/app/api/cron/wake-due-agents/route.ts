import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSnapshot } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/wake-due-agents
 *
 * Polled by Vercel Cron (or any external cron like cron-job.org) on a
 * schedule. Each tick:
 *   1. Find agents with active=true AND next_wake_at <= now
 *   2. For each:
 *      a. Check active-hours window — skip if outside
 *      b. Fetch market snapshot (cached) for context
 *      c. Check pending scheduled_items for price triggers that fired
 *      d. Mark fired items as "executing" (browser dispatcher actually
 *         signs + sends — v1.0)
 *      e. Insert agent_wakes audit row
 *      f. Advance next_wake_at = now + cadence
 *
 * Auth: Bearer CRON_SECRET in the Authorization header. Vercel sets this
 * automatically when invoked from vercel.json crons; external triggers
 * must include it manually.
 *
 * Why no on-chain execution server-side yet:
 *   The agent's signing keypair lives in the handler's browser
 *   (localStorage / Privy embedded wallet client side). Letting the
 *   server sign requires Privy delegated wallets — P1.5 work.
 *   For v1.0 the cron updates the schedule + audit; the browser
 *   dispatches when open. The badge accurately reflects timing either way.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on server" },
      { status: 500 }
    );
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = supabaseAdmin();
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: due, error } = await db
    .from("agents")
    .select(
      "id, persona, cron_cadence_minutes, next_wake_at, active_hours_start, active_hours_end"
    )
    .eq("active", true)
    .or(`next_wake_at.lte.${nowIso},next_wake_at.is.null`)
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{
    agentId: string;
    outcome: string;
    triggersFired: number;
  }> = [];

  let solSnapshot: Awaited<ReturnType<typeof getSnapshot>> | null = null;

  for (const agent of due ?? []) {
    const cadenceMin = agent.cron_cadence_minutes ?? 60;
    const inHours = withinActiveHours(
      agent.active_hours_start,
      agent.active_hours_end,
      now
    );

    let outcome: string = "scanned-no-action";
    let firedCount = 0;

    if (!inHours) {
      outcome = "skipped-inactive-hours";
    } else {
      // Lazy-fetch market once per tick — shared across all agents
      if (!solSnapshot) {
        try {
          solSnapshot = await getSnapshot("SOL");
        } catch {
          solSnapshot = null;
        }
      }

      // v1.2: cron is OBSERVATION ONLY. It counts items whose triggers
      // are met but does not touch the row, because the actual dispatcher
      // lives in the browser (agent keypair signs there). The browser
      // already polls + fires when its tab is open. Marking executing
      // here would create stuck rows.
      // When Privy delegated wallets land (v1.5), the cron will be
      // promoted to dispatcher.
      const { data: pending } = await db
        .from("scheduled_items")
        .select("*")
        .eq("agent_id", agent.id)
        .eq("status", "queued");
      for (const item of pending ?? []) {
        if (shouldFire(item, solSnapshot?.priceUsd ?? null, now)) {
          firedCount++;
        }
      }
      if (firedCount > 0) outcome = "executed-trigger";
    }

    // Advance next_wake_at
    const nextWake = new Date(now.getTime() + cadenceMin * 60_000);
    await db
      .from("agents")
      .update({
        last_wake_at: nowIso,
        next_wake_at: nextWake.toISOString(),
      })
      .eq("id", agent.id);

    // Audit row — record the market the agent actually saw at this wake,
    // so the Wake history feed can show real context (and replay it later).
    await db.from("agent_wakes").insert({
      agent_id: agent.id,
      woke_at: nowIso,
      finished_at: new Date().toISOString(),
      outcome,
      llm_calls: 0,
      items_executed: firedCount,
      opportunities_proposed: 0,
      market_price: solSnapshot?.priceUsd ?? null,
    });

    results.push({ agentId: agent.id, outcome, triggersFired: firedCount });
  }

  return NextResponse.json({
    processedAt: nowIso,
    count: results.length,
    results,
  });
}

function withinActiveHours(
  start: number | null,
  end: number | null,
  now: Date
): boolean {
  if (start == null || end == null) return true;
  const h = now.getUTCHours();
  if (start <= end) return h >= start && h < end;
  return h >= start || h < end; // window crossing midnight
}

function shouldFire(
  item: any,
  currentPrice: number | null,
  now: Date
): boolean {
  if (item.trigger_deadline && new Date(item.trigger_deadline) < now) return false;
  switch (item.trigger_kind) {
    case "time":
      return new Date(item.scheduled_for) <= now;
    case "dip":
      if (!currentPrice || !item.trigger_basis_price || !item.trigger_drop_pct) return false;
      return currentPrice <= item.trigger_basis_price * (1 - item.trigger_drop_pct / 100);
    case "below":
      return !!currentPrice && !!item.trigger_target_price && currentPrice <= item.trigger_target_price;
    case "above":
      return !!currentPrice && !!item.trigger_target_price && currentPrice >= item.trigger_target_price;
    default:
      return false;
  }
}
