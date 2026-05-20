import { supabaseAdmin } from "@/lib/supabase";
import type { LlmEndpoint, LlmUsage, Provider } from "./types";

/**
 * LLM usage is logged for transparency and abuse prevention.
 * Even though BYOK pays the LLM bill, we count to detect pathological
 * patterns (e.g. 10k chat calls/hour) and rate-limit on top.
 */
export async function recordLlmUsage(input: {
  handlerId: string;
  agentId?: string | null;
  provider: Provider;
  model: string;
  promptTokens: number;
  completionTokens: number;
  endpoint: LlmEndpoint;
  durationMs?: number;
}): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("llm_usage").insert({
    handler_id: input.handlerId,
    agent_id: input.agentId ?? null,
    provider: input.provider,
    model: input.model,
    prompt_tokens: input.promptTokens,
    completion_tokens: input.completionTokens,
    total_tokens: input.promptTokens + input.completionTokens,
    endpoint: input.endpoint,
    duration_ms: input.durationMs ?? null,
  });
  if (error) throw new Error(`recordLlmUsage: ${error.message}`);
}

const RATE_LIMIT_PER_DAY = Number(process.env.SAW_LLM_RATE_LIMIT_PER_DAY ?? 500);

export async function llmRateLimitReached(handlerId: string): Promise<{
  reached: boolean;
  used: number;
  limit: number;
}> {
  const db = supabaseAdmin();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await db
    .from("llm_usage")
    .select("id", { count: "exact", head: true })
    .eq("handler_id", handlerId)
    .gte("created_at", since);
  if (error) throw new Error(`llmRateLimitReached: ${error.message}`);
  const used = count ?? 0;
  return { reached: used >= RATE_LIMIT_PER_DAY, used, limit: RATE_LIMIT_PER_DAY };
}
