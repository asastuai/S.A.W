import { GoogleGenerativeAI, type FunctionDeclaration, type Tool } from "@google/generative-ai";
import type {
  CompletionRequest,
  CompletionResponse,
  ProviderAdapter,
  ToolCall,
} from "./types";

/**
 * Gemini adapter — uses Google's generative-ai SDK.
 *
 * Pricing as of v1: Gemini 2.5 Flash is ~$0.075/$0.30 per 1M tok in/out,
 * plus a generous free tier (~1500 RPD).
 *
 * Tool calling: Gemini supports function calling but uses a different
 * shape than OpenAI. We normalize bi-directionally.
 */
export const geminiAdapter: ProviderAdapter = {
  id: "gemini",
  defaultModel: "gemini-2.5-flash",
  async complete(req: CompletionRequest, apiKey: string): Promise<CompletionResponse> {
    const genai = new GoogleGenerativeAI(apiKey);

    // Build system instruction from the first system message
    const systemMsg = req.messages.find((m) => m.role === "system");
    const otherMsgs = req.messages.filter((m) => m.role !== "system");

    const tools: Tool[] | undefined = req.tools
      ? [
          {
            functionDeclarations: req.tools.map(
              (t): FunctionDeclaration => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters as any,
              })
            ),
          },
        ]
      : undefined;

    const model = genai.getGenerativeModel({
      model: req.model || "gemini-2.5-flash",
      systemInstruction: systemMsg?.content,
      tools,
      generationConfig: {
        temperature: req.temperature ?? 0.5,
        maxOutputTokens: req.maxTokens ?? 900,
      },
    });

    // Gemini expects history (all but last) + the latest message separately
    const history = otherMsgs.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const last = otherMsgs[otherMsgs.length - 1];

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(last?.content ?? "");
    const response = result.response;

    const text = response.text();
    const fnCalls = response.functionCalls() ?? [];
    const toolCalls: ToolCall[] = fnCalls.map((c, i) => ({
      id: `gemini-tc-${i}-${Date.now()}`,
      name: c.name,
      arguments: JSON.stringify(c.args),
    }));

    const usage = response.usageMetadata;
    return {
      content: text,
      toolCalls,
      usage: {
        promptTokens: usage?.promptTokenCount ?? 0,
        completionTokens: usage?.candidatesTokenCount ?? 0,
      },
      finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
    };
  },
};
