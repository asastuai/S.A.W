import { supabaseAdmin } from "@/lib/supabase";
import type { ScheduledItem, ScheduledStatus, TriggerKind, ActionType } from "./types";

export async function listScheduleForAgent(agentId: string): Promise<ScheduledItem[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("scheduled_items")
    .select("*")
    .eq("agent_id", agentId)
    .order("scheduled_for", { ascending: true });
  if (error) throw new Error(`listScheduleForAgent: ${error.message}`);
  return (data as ScheduledItem[]) ?? [];
}

/** Perp descriptor for createScheduledItem. All fields nullable to support
 *  perp-close (which only needs market). */
export type PerpInsertBlock = {
  market: string;
  side: "long" | "short" | null;
  leverage: number | null;
  marginUsdc: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  userOrderId: number | null;
};

export async function createScheduledItem(input: {
  /** Optional client-provided uuid so the browser item and the DB row share
   *  the same id. Lets remove/patch target the row by the id the client holds
   *  (the client mints it with crypto.randomUUID before the POST). */
  id?: string;
  agentId: string;
  actionType: ActionType;
  vendor?: string | null;
  amount: number;
  asset?: string | null;
  toAsset?: string | null;
  reason?: string | null;
  scheduledFor: Date;
  trigger: {
    kind: TriggerKind;
    basisPrice?: number;
    dropPct?: number;
    targetPrice?: number;
    deadline?: Date;
  };
  /** Present for perp-open and perp-close; absent for pay/swap. */
  perp?: PerpInsertBlock;
}): Promise<ScheduledItem> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("scheduled_items")
    .insert({
      ...(input.id ? { id: input.id } : {}),
      agent_id: input.agentId,
      action_type: input.actionType,
      vendor: input.vendor ?? null,
      amount: input.amount,
      asset: input.asset ?? null,
      to_asset: input.toAsset ?? null,
      reason: input.reason ?? null,
      scheduled_for: input.scheduledFor.toISOString(),
      trigger_kind: input.trigger.kind,
      trigger_basis_price: input.trigger.basisPrice ?? null,
      trigger_drop_pct: input.trigger.dropPct ?? null,
      trigger_target_price: input.trigger.targetPrice ?? null,
      trigger_deadline: input.trigger.deadline?.toISOString() ?? null,
      // perp descriptor — null for non-perp action types
      perp_market: input.perp?.market ?? null,
      perp_side: input.perp?.side ?? null,
      perp_leverage: input.perp?.leverage ?? null,
      perp_margin_usdc: input.perp?.marginUsdc ?? null,
      perp_stop_loss: input.perp?.stopLoss ?? null,
      perp_take_profit: input.perp?.takeProfit ?? null,
      perp_user_order_id: input.perp?.userOrderId ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`createScheduledItem: ${error?.message}`);
  return data as ScheduledItem;
}

/**
 * Sum of perp_margin_usdc for done perp-open items executed today (UTC).
 * Used by the route to evaluate the dailyMarginBudget policy gate.
 */
export async function sumMarginExecutedTodayUTC(agentId: string): Promise<number> {
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("scheduled_items")
    .select("perp_margin_usdc")
    .eq("agent_id", agentId)
    .eq("action_type", "perp-open")
    .eq("status", "done")
    .gte("executed_at", todayUTC.toISOString());

  if (error) throw new Error(`sumMarginExecutedTodayUTC: ${error.message}`);
  const rows = (data as Array<{ perp_margin_usdc: number | null }> | null) ?? [];
  return rows.reduce((acc, r) => acc + (r.perp_margin_usdc ?? 0), 0);
}

/**
 * Approximate count of open perp positions for an agent.
 * Formula: max(0, count(perp-open done) - count(perp-close done)).
 * This is a simple approximation documented as such — it does not account for
 * partial closes or cross-market position tracking.
 */
export async function countOpenPerpPositions(agentId: string): Promise<number> {
  const { count: opens, error: e1 } = await supabaseAdmin()
    .from("scheduled_items")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("action_type", "perp-open")
    .eq("status", "done");
  if (e1) throw new Error(`countOpenPerpPositions: ${e1.message}`);

  const { count: closes, error: e2 } = await supabaseAdmin()
    .from("scheduled_items")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("action_type", "perp-close")
    .eq("status", "done");
  if (e2) throw new Error(`countOpenPerpPositions: ${e2.message}`);

  return Math.max(0, (opens ?? 0) - (closes ?? 0));
}

export async function updateScheduledItemStatus(
  id: string,
  status: ScheduledStatus,
  patch?: { txSignature?: string; errorMessage?: string }
): Promise<void> {
  const db = supabaseAdmin();
  const update: any = { status };
  if (status === "done" || status === "failed") update.executed_at = new Date().toISOString();
  if (patch?.txSignature) update.tx_signature = patch.txSignature;
  if (patch?.errorMessage) update.error_message = patch.errorMessage;
  const { error } = await db.from("scheduled_items").update(update).eq("id", id);
  if (error) throw new Error(`updateScheduledItemStatus: ${error.message}`);
}

export async function removeScheduledItem(id: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("scheduled_items").delete().eq("id", id);
  if (error) throw new Error(`removeScheduledItem: ${error.message}`);
}
