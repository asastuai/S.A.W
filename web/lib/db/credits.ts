import { supabaseAdmin } from "@/lib/supabase";

/**
 * LLM credits: pre-paid balance of agent-chat calls a handler can spend
 * against SAW's server-side LLM key when they don't have their own BYOK
 * key. Topped up by on-chain SOL transfer to the treasury.
 */

// Pricing policy. 0.01 SOL = 500 calls (devnet baseline; adjust before
// mainnet). 1 SOL = 1_000_000_000 lamports → 0.01 SOL = 10_000_000.
export const LAMPORTS_PER_TOPUP = 10_000_000; // 0.01 SOL
export const CALLS_PER_TOPUP = 500;

/** Convert any amount of lamports to credits at the current rate. */
export function lamportsToCalls(lamports: number): number {
  if (lamports < LAMPORTS_PER_TOPUP) return 0;
  const units = Math.floor(lamports / LAMPORTS_PER_TOPUP);
  return units * CALLS_PER_TOPUP;
}

export type CreditRow = {
  handler_id: string;
  balance_calls: number;
  total_paid_lamports: number;
  last_topup_at: string | null;
  last_topup_tx: string | null;
};

export async function getCredits(handlerId: string): Promise<CreditRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("llm_credits")
    .select("handler_id, balance_calls, total_paid_lamports, last_topup_at, last_topup_tx")
    .eq("handler_id", handlerId)
    .maybeSingle();
  if (error) throw new Error(`getCredits: ${error.message}`);
  return (data as CreditRow) ?? null;
}

/**
 * Append credits to a handler's balance after a verified on-chain topup.
 * Idempotent on tx signature: same sig won't double-credit.
 * Returns the new balance.
 */
export async function addCreditsFromTopup(input: {
  handlerId: string;
  txSignature: string;
  lamports: number;
  callsCredited: number;
}): Promise<number> {
  const db = supabaseAdmin();

  // 1) Insert audit row (unique on tx_signature → blocks replays)
  const { error: topupErr } = await db.from("llm_credit_topups").insert({
    handler_id: input.handlerId,
    tx_signature: input.txSignature,
    lamports: input.lamports,
    calls_credited: input.callsCredited,
  });
  if (topupErr) {
    // 23505 = unique violation — treat as "already credited", return current
    if (topupErr.code === "23505") {
      const existing = await getCredits(input.handlerId);
      return existing?.balance_calls ?? 0;
    }
    throw new Error(`addCreditsFromTopup audit: ${topupErr.message}`);
  }

  // 2) Upsert balance with manual increment (no atomic op in PostgREST,
  //    so we read-then-write inside a single function; race risk is
  //    minimal because tx_signature uniqueness blocks duplicates).
  const existing = await getCredits(input.handlerId);
  const newBalance = (existing?.balance_calls ?? 0) + input.callsCredited;
  const newTotal = (existing?.total_paid_lamports ?? 0) + input.lamports;

  const { error: upsertErr } = await db.from("llm_credits").upsert(
    {
      handler_id: input.handlerId,
      balance_calls: newBalance,
      total_paid_lamports: newTotal,
      last_topup_at: new Date().toISOString(),
      last_topup_tx: input.txSignature,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "handler_id" }
  );
  if (upsertErr) throw new Error(`addCreditsFromTopup upsert: ${upsertErr.message}`);

  return newBalance;
}

/**
 * Atomic-ish decrement: spend one call. Returns the new balance.
 * Throws if no balance to spend (caller should check first).
 */
export async function spendOneCall(handlerId: string): Promise<number> {
  const db = supabaseAdmin();
  const existing = await getCredits(handlerId);
  if (!existing || existing.balance_calls <= 0) {
    throw new Error("no_credits");
  }
  const next = existing.balance_calls - 1;
  const { error } = await db
    .from("llm_credits")
    .update({ balance_calls: next, updated_at: new Date().toISOString() })
    .eq("handler_id", handlerId)
    // Compare-and-set: only update if balance hasn't changed since we read.
    // Race-safe enough for v1; a concurrent call would skip the decrement
    // and the second LLM call still goes through but balance stays high
    // (favoring the user, which is fine for a credit system).
    .eq("balance_calls", existing.balance_calls);
  if (error) throw new Error(`spendOneCall: ${error.message}`);
  return next;
}
