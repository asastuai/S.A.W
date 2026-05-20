import { supabaseAdmin } from "@/lib/supabase";
import type { Opportunity, OpportunityStatus } from "./types";

export async function listPendingOpportunities(agentId: string): Promise<Opportunity[]> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("opportunities")
    .select("*")
    .eq("agent_id", agentId)
    .eq("status", "pending")
    .gt("expires_at", now)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listPendingOpportunities: ${error.message}`);
  return (data as Opportunity[]) ?? [];
}

export async function createOpportunity(input: {
  agentId: string;
  title: string;
  message: string;
  suggested: {
    vendor?: string;
    amount?: number;
    asset?: string;
    reason?: string;
  };
  trigger?: {
    kind: "time" | "dip" | "below" | "above";
    basisPrice?: number;
    dropPct?: number;
    targetPrice?: number;
  };
  confidence: "low" | "medium" | "high";
  expiresAt: Date;
}): Promise<Opportunity> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("opportunities")
    .insert({
      agent_id: input.agentId,
      title: input.title,
      message: input.message,
      suggested_vendor: input.suggested.vendor ?? null,
      suggested_amount: input.suggested.amount ?? null,
      suggested_asset: input.suggested.asset ?? null,
      suggested_reason: input.suggested.reason ?? null,
      trigger_kind: input.trigger?.kind ?? null,
      trigger_basis_price: input.trigger?.basisPrice ?? null,
      trigger_drop_pct: input.trigger?.dropPct ?? null,
      trigger_target_price: input.trigger?.targetPrice ?? null,
      confidence: input.confidence,
      expires_at: input.expiresAt.toISOString(),
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`createOpportunity: ${error?.message}`);
  return data as Opportunity;
}

export async function resolveOpportunity(
  id: string,
  status: OpportunityStatus
): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("opportunities")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`resolveOpportunity: ${error.message}`);
}

export async function sweepExpiredOpportunities(): Promise<number> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("opportunities")
    .update({ status: "expired", resolved_at: now })
    .eq("status", "pending")
    .lt("expires_at", now)
    .select("id");
  if (error) throw new Error(`sweepExpiredOpportunities: ${error.message}`);
  return data?.length ?? 0;
}
