/**
 * Provider-agnostic LLM interface.
 *
 * SAW supports multiple providers (Groq, OpenAI, Anthropic, Gemini, Grok).
 * Each provider has different SDK shapes and tool-calling dialects.
 * This module normalizes them behind one interface so the agent code does
 * not care which provider it is talking to.
 */

import type { Provider } from "@/lib/db/types";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** when role === "tool", the id of the tool call this responds to */
  toolCallId?: string;
  /** when role === "assistant", any tool calls the model made */
  toolCalls?: ToolCall[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSONSchema
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none" | "required";
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionResponse {
  content: string;
  toolCalls: ToolCall[];
  usage: { promptTokens: number; completionTokens: number };
  finishReason: "stop" | "tool_calls" | "length" | "other";
}

export interface ProviderAdapter {
  id: Provider;
  defaultModel: string;
  complete(req: CompletionRequest, apiKey: string): Promise<CompletionResponse>;
}
