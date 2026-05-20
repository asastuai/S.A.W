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

export async function createScheduledItem(input: {
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
}): Promise<ScheduledItem> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("scheduled_items")
    .insert({
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
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`createScheduledItem: ${error?.message}`);
  return data as ScheduledItem;
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
