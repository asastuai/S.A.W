import { supabaseAdmin } from "@/lib/supabase";
import type { FeeKind, FeeLedgerEntry } from "./types";

export async function recordFee(input: {
  handlerId: string;
  agentId?: string | null;
  kind: FeeKind;
  amountLamports: number;
  asset?: string;
  relatedTx?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}): Promise<FeeLedgerEntry> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("fee_ledger")
    .insert({
      handler_id: input.handlerId,
      agent_id: input.agentId ?? null,
      fee_kind: input.kind,
      amount_lamports: input.amountLamports,
      asset: input.asset ?? "SOL",
      related_tx: input.relatedTx ?? null,
      period_start: input.periodStart?.toISOString() ?? null,
      period_end: input.periodEnd?.toISOString() ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`recordFee: ${error?.message}`);
  return data as FeeLedgerEntry;
}

export async function listFeesForHandler(
  handlerId: string,
  limit = 100
): Promise<FeeLedgerEntry[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("fee_ledger")
    .select("*")
    .eq("handler_id", handlerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listFeesForHandler: ${error.message}`);
  return (data as FeeLedgerEntry[]) ?? [];
}

export async function totalFeesForHandlerInPeriod(input: {
  handlerId: string;
  from: Date;
  to: Date;
}): Promise<{ totalLamports: number; byKind: Record<FeeKind, number> }> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("fee_ledger")
    .select("fee_kind, amount_lamports")
    .eq("handler_id", input.handlerId)
    .gte("created_at", input.from.toISOString())
    .lte("created_at", input.to.toISOString());
  if (error) throw new Error(`totalFeesForHandlerInPeriod: ${error.message}`);

  const byKind: Record<FeeKind, number> = { swap: 0, performance: 0, aum: 0 };
  let total = 0;
  for (const row of data ?? []) {
    byKind[row.fee_kind as FeeKind] += row.amount_lamports;
    total += row.amount_lamports;
  }
  return { totalLamports: total, byKind };
}
