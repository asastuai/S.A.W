/**
 * worker/src/lib/trading-key.ts
 *
 * Loads and decrypts the agent's trading keypair from `agent_trading_keys`.
 * Mirror of web/lib/byok-crypto.ts decryptApiKey — same AES-GCM algorithm,
 * same master key env var (SAW_BYOK_ENC_KEY), same base64 encoding.
 *
 * The encrypted value is the base58-encoded secretKey (64 bytes).
 * After decryption: base58decode → Keypair.fromSecretKey.
 *
 * Returns null if no row exists for this agentId (venue not enabled).
 * Throws on decryption failure or env var missing.
 *
 * SECURITY: the plaintext secretKey is NEVER written to disk or logged.
 */

import { webcrypto as crypto } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import type { SupabaseClient } from "@supabase/supabase-js";

function base58Decode(encoded: string): Uint8Array {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const BASE = BigInt(58);
  let num = BigInt(0);
  for (const char of encoded) {
    const idx = ALPHABET.indexOf(char);
    if (idx < 0) throw new Error(`Invalid base58 character: ${char}`);
    num = num * BASE + BigInt(idx);
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num % 256n));
    num >>= 8n;
  }
  // Count leading zeroes (encoded as leading '1's)
  for (const char of encoded) {
    if (char === "1") bytes.unshift(0);
    else break;
  }
  return new Uint8Array(bytes);
}

function getKeyMaterial(): Promise<CryptoKey> {
  const raw = process.env["SAW_BYOK_ENC_KEY"];
  if (!raw) throw new Error("SAW_BYOK_ENC_KEY env var missing");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) {
    throw new Error("SAW_BYOK_ENC_KEY must decode to 32 bytes (AES-256)");
  }
  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function decryptTradingKey(ciphertext: string, iv: string): Promise<string> {
  const key = await getKeyMaterial();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(iv, "base64") },
    key,
    Buffer.from(ciphertext, "base64"),
  );
  return new TextDecoder().decode(plain);
}

/**
 * Loads and decrypts the agent's trading Keypair.
 * Returns null if no trading key is registered for this agent (venue not enabled).
 */
export async function loadTradingKeypair(
  db: SupabaseClient,
  agentId: string,
): Promise<Keypair | null> {
  const { data, error } = await db
    .from("agent_trading_keys")
    .select("ciphertext, iv")
    .eq("agent_id", agentId)
    .maybeSingle();

  if (error) throw new Error(`agent_trading_keys query failed: ${error.message}`);
  if (!data) return null;

  // Decrypt → base58-encoded secretKey → Uint8Array → Keypair
  const secretKeyBase58 = await decryptTradingKey(data.ciphertext, data.iv);
  const secretKeyBytes = base58Decode(secretKeyBase58);
  return Keypair.fromSecretKey(secretKeyBytes);
}
