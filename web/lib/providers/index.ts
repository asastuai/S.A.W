import type { Provider } from "@/lib/db/types";
import type { ProviderAdapter } from "./types";
import { groqAdapter } from "./groq";
import { geminiAdapter } from "./gemini";
import { anthropicAdapter } from "./anthropic";
import {
  cerebrasAdapter,
  deepseekAdapter,
  grokAdapter,
  kimiAdapter,
  openaiAdapter,
} from "./openai-compat";

/**
 * Provider registry. Active providers in v1.2:
 *   - Groq (free, fast)
 *   - Gemini 2.5 Flash-Lite (1500 RPD free)
 *   - DeepSeek V3 (cheapest)
 *   - Grok 3 mini (xAI)
 *   - OpenAI gpt-4o-mini
 *   - Anthropic Claude Haiku 4.5
 *   - Cerebras Llama 3.3 70B (free tier, fastest inference)
 *   - Kimi (Moonshot AI, cheap with Chinese coverage)
 */
const REGISTRY: Partial<Record<Provider, ProviderAdapter>> = {
  groq: groqAdapter,
  gemini: geminiAdapter,
  deepseek: deepseekAdapter,
  grok: grokAdapter,
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  cerebras: cerebrasAdapter as any,
  kimi: kimiAdapter as any,
};

export function getProviderAdapter(provider: Provider): ProviderAdapter {
  const adapter = REGISTRY[provider];
  if (!adapter) {
    throw new Error(`Provider ${provider} not yet implemented in v1`);
  }
  return adapter;
}

export function isProviderImplemented(provider: Provider): boolean {
  return Boolean(REGISTRY[provider]);
}

export type { ProviderAdapter, CompletionRequest, CompletionResponse, ChatMessage, ToolDefinition, ToolCall } from "./types";
