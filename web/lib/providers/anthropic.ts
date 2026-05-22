import Anthropic from "@anthropic-ai/sdk";
import type {
  CompletionRequest,
  CompletionResponse,
  ProviderAdapter,
  ToolCall,
} from "./types";

/**
 * Anthropic adapter — Claude family.
 *
 * Default model: claude-haiku-4-5 (cheap, fast, tool calling solid).
 * For pricier reasoning, the user can override via env.
 *
 * Anthropic's API uses a different shape than OpenAI: system prompt
 * is a top-level field, messages alternate user/assistant, tool_use
 * blocks are nested in content arrays.
 */
export const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",
  defaultModel: "claude-haiku-4-5",
  async complete(req: CompletionRequest, apiKey: string): Promise<CompletionResponse> {
    const client = new Anthropic({ apiKey });

    const systemMsg = req.messages.find((m) => m.role === "system");

    // Anthropic requires alternating user/assistant. Tool results become
    // user messages with a tool_result content block.
    const messages: any[] = [];
    for (const m of req.messages) {
      if (m.role === "system") continue;
      if (m.role === "tool") {
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: m.toolCallId!,
              content: m.content,
            },
          ],
        });
        continue;
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        const content: any[] = [];
        if (m.content) content.push({ type: "text", text: m.content });
        for (const tc of m.toolCalls) {
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: safeParseJson(tc.arguments),
          });
        }
        messages.push({ role: "assistant", content });
        continue;
      }
      messages.push({ role: m.role, content: m.content });
    }

    const tools = req.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as any,
    }));

    const response = await client.messages.create({
      model: req.model || "claude-haiku-4-5",
      system: systemMsg?.content,
      messages,
      tools,
      max_tokens: req.maxTokens ?? 900,
      temperature: req.temperature ?? 0.5,
    });

    let textContent = "";
    const toolCalls: ToolCall[] = [];
    for (const block of response.content) {
      if (block.type === "text") textContent += block.text;
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        });
      }
    }

    return {
      content: textContent,
      toolCalls,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
      finishReason:
        response.stop_reason === "tool_use"
          ? "tool_calls"
          : response.stop_reason === "end_turn"
          ? "stop"
          : response.stop_reason === "max_tokens"
          ? "length"
          : "other",
    };
  },
};

function safeParseJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
