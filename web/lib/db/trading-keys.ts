/**
 * web/lib/db/trading-keys.ts
 *
 * DB access layer for agent_trading_keys (0014_perps.sql).
 *
 * Security rules (C-1, spec §Task 8):
 *   - Only supabaseAdmin (service-role) touches this table — RLS has NO policies,
 *     so anon/authenticated keys are locked out at the DB level.
 *   - ciphertext and iv are NEVER included in any type returned to callers
 *     outside this module that could end up in an HTTP response.
 *   - The public shape (TradingKeyPublic) only carries pubkey + metadata.
 */

import { supabaseAdmin } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────────────

/** Full DB row (server-only, never returned in HTTP responses). */
export interface TradingKeyRow {
  id: string;
  agent_id: string;
  pubkey: string;
  ciphertext: string; // AES-GCM base64 — NEVER expose in API responses
  iv: string;          // AES-GCM IV base64 — NEVER expose in API responses
  created_at: string;
}

/** Safe public shape — no secret material. */
export interface TradingKeyPublic {
  id: string;
  agent_id: string;
  pubkey: string;
  created_at: string;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Returns the trading key row for an agent, or null if none exists.
 * Returns the full row (including ciphertext/iv) for server-side decryption.
 * NEVER forward this to a response object — strip ciphertext/iv first.
 */
export async function getTradingKey(agentId: string): Promise<TradingKeyRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("agent_trading_keys")
    .select("*")
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error) throw new Error(`getTradingKey: ${error.message}`);
  return (data as TradingKeyRow | null) ?? null;
}

/**
 * Inserts a new trading key row.
 * Returns the public shape (no ciphertext/iv) — safe for logging and callers.
 *
 * Throws if a row already exists for the agent (unique constraint on agent_id).
 */
export async function createTradingKey(input: {
  agentId: string;
  pubkey: string;
  ciphertext: string;
  iv: string;
}): Promise<TradingKeyPublic> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("agent_trading_keys")
    .insert({
      agent_id: input.agentId,
      pubkey: input.pubkey,
      ciphertext: input.ciphertext,
      iv: input.iv,
    })
    .select("id, agent_id, pubkey, created_at")
    .single();

  if (error) throw new Error(`createTradingKey: ${error.message}`);
  return data as TradingKeyPublic;
}
