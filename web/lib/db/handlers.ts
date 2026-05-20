import { supabaseAdmin } from "@/lib/supabase";
import type { Handler } from "./types";

/**
 * Upsert a handler row by Privy user ID. Called from the auth callback when
 * Privy signs the user in. Idempotent — multiple logins return the same row.
 */
export async function upsertHandler(input: {
  privyUserId: string;
  primaryWallet: string;
  email?: string | null;
}): Promise<Handler> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("handlers")
    .upsert(
      {
        privy_user_id: input.privyUserId,
        primary_wallet: input.primaryWallet,
        email: input.email ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "privy_user_id" }
    )
    .select("*")
    .single();

  if (error || !data) throw new Error(`upsertHandler: ${error?.message}`);
  return data as Handler;
}

export async function getHandlerByPrivy(privyUserId: string): Promise<Handler | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("handlers")
    .select("*")
    .eq("privy_user_id", privyUserId)
    .maybeSingle();
  if (error) throw new Error(`getHandlerByPrivy: ${error.message}`);
  return (data as Handler) ?? null;
}

export async function getHandlerByWallet(wallet: string): Promise<Handler | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("handlers")
    .select("*")
    .eq("primary_wallet", wallet)
    .maybeSingle();
  if (error) throw new Error(`getHandlerByWallet: ${error.message}`);
  return (data as Handler) ?? null;
}

export async function touchHandlerSeen(handlerId: string): Promise<void> {
  const db = supabaseAdmin();
  await db
    .from("handlers")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", handlerId);
}
