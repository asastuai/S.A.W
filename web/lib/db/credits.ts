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
 * Idempotent on tx signature: the unique constraint on
 * llm_credit_topups.tx_signature blocks duplicate audit rows.
 *
 * M-3 fix: balance increment now goes through the `add_credits` Postgres
 * function so Postgres serializes concurrent topups for the same handler.
 * The previous read-then-write pattern lost credits when two distinct
 * topups landed at the same millisecond.
 *
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

  // 2) Atomic increment via stored function (race-safe across handlers).
  const { data, error } = await db.rpc("add_credits", {
    p_handler_id: input.handlerId,
    p_amount_calls: input.callsCredited,
    p_lamports: input.lamports,
    p_tx: input.txSignature,
  });
  if (error) throw new Error(`addCreditsFromTopup rpc: ${error.message}`);
  return Number(data ?? 0);
}

/**
 * Atomic decrement: spend one call. Returns the new balance.
 * Throws if no balance to spend.
 *
 * M-3 fix companion: previously a compare-and-set that could silently
 * skip on contention (giving the user a free call). Now an atomic
 * `update ... where balance > 0` via stored function — every call that
 * actually went out costs exactly one credit.
 */
export async function spendOneCall(handlerId: string): Promise<number> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("spend_one_call", {
    p_handler_id: handlerId,
  });
  if (error) {
    if (error.message?.includes("no_credits")) throw new Error("no_credits");
    throw new Error(`spendOneCall: ${error.message}`);
  }
  return Number(data ?? 0);
}
