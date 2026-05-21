import type { Provider } from "@/lib/db/types";
import type { ProviderAdapter } from "./types";
import { groqAdapter } from "./groq";
import { geminiAdapter } from "./gemini";
import { deepseekAdapter, grokAdapter } from "./openai-compat";

/**
 * Provider registry. Active providers in v1.1:
 *   - Groq (free tier, fast inference)
 *   - Gemini 2.5 Flash (very cheap, generous free tier, Google reliability)
 *   - DeepSeek V3 (cheapest market price, OpenAI-compatible)
 *   - Grok 3 mini (xAI, OpenAI-compatible)
 *
 * To add OpenAI / Anthropic / Kimi / Cerebras later:
 *   1. Implement `ProviderAdapter` for the provider
 *   2. Register here
 *   3. Update db/types Provider union if missing
 *   4. Update AgentGate UI to mark the card as active
 */
const REGISTRY: Partial<Record<Provider, ProviderAdapter>> = {
  groq: groqAdapter,
  gemini: geminiAdapter,
  deepseek: deepseekAdapter,
  grok: grokAdapter,
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
