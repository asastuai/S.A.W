import type { Provider } from "@/lib/db/types";
import type { ProviderAdapter } from "./types";
import { groqAdapter } from "./groq";

/**
 * Provider registry. Only Groq is active in v1.
 *
 * To add OpenAI / Anthropic / Gemini / Grok later:
 *   1. Implement `ProviderAdapter` for the provider (./openai.ts, etc.)
 *   2. Register here.
 *   3. Update db/types Provider union if not already present.
 *   4. Update AgentGate UI to mark the card as active.
 */
const REGISTRY: Partial<Record<Provider, ProviderAdapter>> = {
  groq: groqAdapter,
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
