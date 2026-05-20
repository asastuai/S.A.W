import { supabaseAdmin } from "@/lib/supabase";
import type { Agent, Persona } from "./types";

export async function listAgentsForHandler(handlerId: string): Promise<Agent[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("agents")
    .select("*")
    .eq("handler_id", handlerId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listAgentsForHandler: ${error.message}`);
  return (data as Agent[]) ?? [];
}

export async function getAgentByHandlerAndPersona(
  handlerId: string,
  persona: Persona
): Promise<Agent | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("agents")
    .select("*")
    .eq("handler_id", handlerId)
    .eq("persona", persona)
    .maybeSingle();
  if (error) throw new Error(`getAgentByHandlerAndPersona: ${error.message}`);
  return (data as Agent) ?? null;
}

export async function createAgent(input: {
  handlerId: string;
  persona: Persona;
  agentPubkey: string;
  walletPda: string;
  policyPda: string;
  queuePda: string;
  byokKeyId?: string | null;
  cronCadenceMinutes?: number;
}): Promise<Agent> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("agents")
    .insert({
      handler_id: input.handlerId,
      persona: input.persona,
      agent_pubkey: input.agentPubkey,
      wallet_pda: input.walletPda,
      policy_pda: input.policyPda,
      queue_pda: input.queuePda,
      byok_key_id: input.byokKeyId ?? null,
      cron_cadence_minutes: input.cronCadenceMinutes ?? 60,
      next_wake_at: new Date(
        Date.now() + (input.cronCadenceMinutes ?? 60) * 60_000
      ).toISOString(),
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`createAgent: ${error?.message}`);
  return data as Agent;
}

export async function setAgentActive(agentId: string, active: boolean): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("agents").update({ active }).eq("id", agentId);
  if (error) throw new Error(`setAgentActive: ${error.message}`);
}

export async function updateAgentSchedule(
  agentId: string,
  patch: { cronCadenceMinutes?: number; activeHoursStart?: number | null; activeHoursEnd?: number | null }
): Promise<void> {
  const db = supabaseAdmin();
  const update: any = {};
  if (patch.cronCadenceMinutes !== undefined) update.cron_cadence_minutes = patch.cronCadenceMinutes;
  if (patch.activeHoursStart !== undefined) update.active_hours_start = patch.activeHoursStart;
  if (patch.activeHoursEnd !== undefined) update.active_hours_end = patch.activeHoursEnd;
  if (Object.keys(update).length === 0) return;
  const { error } = await db.from("agents").update(update).eq("id", agentId);
  if (error) throw new Error(`updateAgentSchedule: ${error.message}`);
}

export async function attachByokKey(agentId: string, byokKeyId: string | null): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("agents")
    .update({ byok_key_id: byokKeyId })
    .eq("id", agentId);
  if (error) throw new Error(`attachByokKey: ${error.message}`);
}
