import OpenAI from "openai";
import type {
  CompletionRequest,
  CompletionResponse,
  ProviderAdapter,
  ToolCall,
} from "./types";

/**
 * Factory for OpenAI-compatible providers (DeepSeek, xAI Grok, Cerebras,
 * Together, etc.). They all expose an OpenAI-shaped /chat/completions
 * endpoint and use the same tool-calling format.
 *
 * Different providers → different baseURL + default model. Same code.
 */
export function makeOpenAICompatAdapter(opts: {
  id: ProviderAdapter["id"];
  baseURL: string;
  defaultModel: string;
}): ProviderAdapter {
  return {
    id: opts.id,
    defaultModel: opts.defaultModel,
    async complete(req: CompletionRequest, apiKey: string): Promise<CompletionResponse> {
      const client = new OpenAI({ apiKey, baseURL: opts.baseURL });

      const messages = req.messages.map((m) => {
        if (m.role === "tool") {
          return {
            role: "tool" as const,
            tool_call_id: m.toolCallId!,
            content: m.content,
          };
        }
        if (m.role === "assistant" && m.toolCalls?.length) {
          return {
            role: "assistant" as const,
            content: m.content ?? "",
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: tc.arguments },
            })),
          };
        }
        return { role: m.role as "system" | "user" | "assistant", content: m.content };
      });

      const tools = req.tools?.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));

      const completion = await client.chat.completions.create({
        model: req.model || opts.defaultModel,
        messages: messages as any,
        tools,
        tool_choice: req.toolChoice ?? (tools ? "auto" : undefined),
        temperature: req.temperature ?? 0.5,
        max_tokens: req.maxTokens ?? 900,
      });

      const choice = completion.choices[0]?.message;
      const toolCalls: ToolCall[] =
        choice?.tool_calls?.map((tc: any) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        })) ?? [];

      return {
        content: choice?.content ?? "",
        toolCalls,
        usage: {
          promptTokens: completion.usage?.prompt_tokens ?? 0,
          completionTokens: completion.usage?.completion_tokens ?? 0,
        },
        finishReason: mapFinish(completion.choices[0]?.finish_reason),
      };
    },
  };
}

function mapFinish(s?: string): CompletionResponse["finishReason"] {
  switch (s) {
    case "stop":
      return "stop";
    case "tool_calls":
      return "tool_calls";
    case "length":
      return "length";
    default:
      return "other";
  }
}

// Pre-baked adapters for common cheap providers
export const deepseekAdapter = makeOpenAICompatAdapter({
  id: "deepseek",
  baseURL: "https://api.deepseek.com/v1",
  defaultModel: "deepseek-chat",
});

export const grokAdapter = makeOpenAICompatAdapter({
  id: "grok",
  baseURL: "https://api.x.ai/v1",
  defaultModel: "grok-3-mini",
});

export const openaiAdapter = makeOpenAICompatAdapter({
  id: "openai",
  baseURL: "https://api.openai.com/v1",
  defaultModel: "gpt-4o-mini",
});

export const cerebrasAdapter = makeOpenAICompatAdapter({
  id: "cerebras" as any, // not yet in Provider union below — added in db/types
  baseURL: "https://api.cerebras.ai/v1",
  defaultModel: "llama-3.3-70b",
});

export const kimiAdapter = makeOpenAICompatAdapter({
  id: "kimi" as any,
  baseURL: "https://api.moonshot.ai/v1",
  defaultModel: "moonshot-v1-8k",
});
