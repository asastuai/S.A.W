import { supabaseAdmin } from "@/lib/supabase";
import { encryptApiKey, decryptApiKey } from "@/lib/byok-crypto";
import type { ByokKey, Provider } from "./types";

export async function storeByokKey(input: {
  handlerId: string;
  provider: Provider;
  plaintextKey: string;
  label?: string;
}): Promise<ByokKey> {
  const { ciphertext, iv } = await encryptApiKey(input.plaintextKey);
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("byok_keys")
    .upsert(
      {
        handler_id: input.handlerId,
        provider: input.provider,
        key_label: input.label ?? null,
        ciphertext,
        iv,
      },
      { onConflict: "handler_id,provider,key_label" }
    )
    .select("*")
    .single();
  if (error || !data) throw new Error(`storeByokKey: ${error?.message}`);
  return data as ByokKey;
}

export async function getDecryptedByokKey(byokKeyId: string): Promise<{
  provider: Provider;
  plaintext: string;
}> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("byok_keys")
    .select("provider, ciphertext, iv")
    .eq("id", byokKeyId)
    .single();
  if (error || !data) throw new Error(`getDecryptedByokKey: ${error?.message}`);
  const plaintext = await decryptApiKey(data.ciphertext, data.iv);
  // Update last_used_at
  await db
    .from("byok_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", byokKeyId);
  return { provider: data.provider as Provider, plaintext };
}

export async function listByokKeysForHandler(handlerId: string): Promise<ByokKey[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("byok_keys")
    .select("id, handler_id, provider, key_label, created_at, last_used_at")
    .eq("handler_id", handlerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listByokKeysForHandler: ${error.message}`);
  // Note: ciphertext/iv intentionally not returned to UI.
  return (data ?? []).map((r: any) => ({
    ...r,
    ciphertext: "",
    iv: "",
  })) as ByokKey[];
}

export async function deleteByokKey(byokKeyId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("byok_keys").delete().eq("id", byokKeyId);
  if (error) throw new Error(`deleteByokKey: ${error.message}`);
}
