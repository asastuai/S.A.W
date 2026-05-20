import { supabaseAdmin } from "@/lib/supabase";
import type { ChatMessage, ChatRole } from "./types";

export async function listChatMessages(agentId: string, limit = 50): Promise<ChatMessage[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("chat_messages")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`listChatMessages: ${error.message}`);
  return (data as ChatMessage[]) ?? [];
}

export async function appendChatMessage(
  agentId: string,
  role: ChatRole,
  content: string
): Promise<ChatMessage> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("chat_messages")
    .insert({ agent_id: agentId, role, content })
    .select("*")
    .single();
  if (error || !data) throw new Error(`appendChatMessage: ${error?.message}`);
  return data as ChatMessage;
}
