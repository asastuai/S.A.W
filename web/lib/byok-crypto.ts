/**
 * AES-GCM encryption for BYOK API keys.
 * The plaintext key is sent over HTTPS, encrypted server-side with
 * SAW_BYOK_ENC_KEY (32 bytes, base64), stored in Supabase, and decrypted
 * only when the agent's wake cycle needs it.
 *
 * The plaintext NEVER lives in localStorage in v1 (BYOK lives in DB only).
 */

import { webcrypto as crypto } from "node:crypto";

function getKeyMaterial(): Promise<CryptoKey> {
  const raw = process.env.SAW_BYOK_ENC_KEY;
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
    ["encrypt", "decrypt"]
  );
}

export async function encryptApiKey(plaintext: string): Promise<{
  ciphertext: string;
  iv: string;
}> {
  const key = await getKeyMaterial();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    ciphertext: Buffer.from(cipher).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
  };
}

export async function decryptApiKey(
  ciphertext: string,
  iv: string
): Promise<string> {
  const key = await getKeyMaterial();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(iv, "base64") },
    key,
    Buffer.from(ciphertext, "base64")
  );
  return new TextDecoder().decode(plain);
}
