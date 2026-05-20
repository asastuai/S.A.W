import Groq from "groq-sdk";
import type {
  CompletionRequest,
  CompletionResponse,
  ProviderAdapter,
  ToolCall,
} from "./types";

export const groqAdapter: ProviderAdapter = {
  id: "groq",
  defaultModel: "openai/gpt-oss-20b",
  async complete(req: CompletionRequest, apiKey: string): Promise<CompletionResponse> {
    const client = new Groq({ apiKey });
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
      model: req.model || "openai/gpt-oss-20b",
      messages,
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
