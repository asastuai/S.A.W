import { NextRequest, NextResponse } from "next/server";
import { describeMarket, getSnapshot } from "@/lib/market";
import { detectProvider } from "@/lib/api-key";
import { getProviderAdapter, isProviderImplemented } from "@/lib/providers";
import type { ChatMessage as ProviderMessage, ToolDefinition } from "@/lib/providers";
import { extractPrivyClaims } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { llmRateLimitReached, recordLlmUsage } from "@/lib/db/llm";
import type { Provider } from "@/lib/db/types";

export const runtime = "nodejs";

const DEMO_DECIMALS = 6;

type Trigger =
  | { kind: "time" }
  | { kind: "dip"; asset: string; basisPrice: number; dropPct: number; deadline?: number }
  | { kind: "below"; asset: string; price: number; deadline?: number }
  | { kind: "above"; asset: string; price: number; deadline?: number };

type ScannedOpportunity = {
  title: string;
  message: string;
  suggested: {
    vendor: string;
    amount: number;
    reason: string;
    trigger?: Trigger;
    scheduledFor?: number;
  };
  confidence: "low" | "medium" | "high";
  expiresAt: number;
};

type RequestBody = {
  persona: {
    id: string;
    name: string;
    role: string;
    mission: string;
    policy: {
      dailyLimit: number;
      perTxLimit: number;
      approvalThreshold: number;
    };
    walletBalance: number;
  };
  scheduleSummary: string;
  dismissedTitles: string[];
  pendingTitles: string[];
};

function fmt(n: number): string {
  return `${(n / 10 ** DEMO_DECIMALS).toFixed(2)} USDC-dev`;
}

const tools = [
  {
    type: "function" as const,
    function: {
      name: "get_market_price",
      description: "Get current market snapshot for an asset (price, 24h range, momentum).",
      parameters: {
        type: "object",
        properties: { asset: { type: "string" } },
        required: ["asset"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "propose_opportunity",
      description:
        "Propose a single proactive opportunity to the handler. Only call when there is a clear, real signal — never invent. amount in TEST whole units.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short headline (under 60 chars)" },
          message: {
            type: "string",
            description:
              "1-2 sentence pitch in your voice, conversational. Explain the signal you saw.",
          },
          vendor: { type: "string" },
          amount: { type: "number" },
          reason: { type: "string", description: "Short reason for the suggested item" },
          triggerKind: {
            type: "string",
            enum: ["time", "dip", "below", "above"],
          },
          asset: { type: "string", description: "Asset symbol if conditional" },
          basisPrice: { type: "number" },
          dropPct: { type: "number" },
          targetPrice: { type: "number" },
          scheduledForSeconds: { type: "number", description: "Seconds from now if time-based" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          expiresInSeconds: {
            type: "number",
            description: "Seconds until this offer expires (60-600)",
          },
        },
        required: [
          "title",
          "message",
          "vendor",
          "amount",
          "reason",
          "confidence",
          "expiresInSeconds",
        ],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "no_opportunities",
      description: "Call this when scanning shows nothing actionable right now.",
      parameters: { type: "object", properties: {} },
    },
  },
];

function buildSystemPrompt(body: RequestBody): string {
  const { persona } = body;
  return `You are ${persona.name}, ${persona.role}. ${persona.mission}

You're doing a periodic SCAN — the handler did NOT ask you anything. Your job: check the tape and decide if there's a CLEAR opportunity worth surfacing.

Rules:
- Be selective but proactive. AIM TO SURFACE 1 OPPORTUNITY PER SCAN when there's any tradeable range (high-low spread > 1%). Only call no_opportunities if the market is literally flat (<0.3% intraday range).
- Always call get_market_price first before proposing anything.
- Maximum 1 opportunity per scan.
- Don't repeat opportunities the user already saw:
  - Currently pending: ${body.pendingTitles.length ? body.pendingTitles.join(", ") : "(none)"}
  - Recently dismissed: ${body.dismissedTitles.length ? body.dismissedTitles.join(", ") : "(none)"}
- Vary the angle each scan — if last opportunity was a dip-buy below current price, next time consider a threshold-buy above, or a TWAP, or a different asset.
- Respect policy: amounts ≤ per-tx cap (${fmt(persona.policy.perTxLimit)}) and ≤ wallet balance (${fmt(persona.walletBalance)}). Suggested amounts in the 10-50 USDC-dev range work well for demo.
- Voice: conversational, brief, like a friend who watches markets. ALWAYS reply in English. Example: "SOL is glued to the day's low — if you want, I'll put 30 below $94 before 4pm".

Current schedule context:
${body.scheduleSummary || "(empty)"}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;

    const userKey = req.headers.get("x-user-api-key")?.trim() || "";
    const apiKey = userKey || process.env.GROQ_API_KEY || "";
    if (!apiKey) {
      // L-2 fix: was silently returning {opportunities:[]} which hid
      // misconfiguration from callers. Now an explicit message tells
      // the client to attach a BYOK key or SAW credits.
      return NextResponse.json(
        {
          opportunities: [],
          error:
            "no LLM key — attach x-user-api-key header or top up SAW credits",
        },
        { status: 401 }
      );
    }

    const provider = detectProvider(apiKey);
    if (provider === "unknown" || !isProviderImplemented(provider as any)) {
      return NextResponse.json(
        {
          opportunities: [],
          error: `unsupported provider for key prefix (${provider})`,
        },
        { status: 400 }
      );
    }
    const adapter = getProviderAdapter(provider as any);

    // Optional rate limit (best-effort, requires Privy JWT + handler row)
    let handlerId: string | null = null;
    try {
      const claims = await extractPrivyClaims(req);
      if (claims) {
        const handler = await getHandlerByPrivy(claims.privy_user_id);
        if (handler) {
          handlerId = handler.id;
          const rl = await llmRateLimitReached(handler.id);
          if (rl.reached) {
            return NextResponse.json({
              opportunities: [],
              error: `Daily LLM cap reached (${rl.used}/${rl.limit})`,
            });
          }
        }
      }
    } catch {
      /* non-fatal */
    }
    const requestStart = Date.now();
    let scanPromptTokens = 0;
    let scanCompletionTokens = 0;

    const normalizedTools: ToolDefinition[] = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));

    const messages: ProviderMessage[] = [
      { role: "system", content: buildSystemPrompt(body) },
      { role: "user", content: "Scan the market now. What do you see?" },
    ];

    const opportunities: ScannedOpportunity[] = [];
    const MAX = 4;

    for (let iter = 0; iter < MAX; iter++) {
      const response: any = await adapter.complete(
        {
          model: adapter.defaultModel,
          messages,
          tools: normalizedTools,
          toolChoice: "auto",
          temperature: 0.6,
          maxTokens: 600,
        },
        apiKey
      );

      scanPromptTokens += response.usage?.promptTokens ?? 0;
      scanCompletionTokens += response.usage?.completionTokens ?? 0;
      const toolCalls = response.toolCalls;
      if (toolCalls.length === 0) break;

      messages.push({
        role: "assistant",
        content: response.content,
        toolCalls,
      });

      let done = false;

      for (const call of toolCalls) {
        let args: any = {};
        try {
          args = JSON.parse(call.arguments || "{}");
        } catch (_) {}

        let toolResult = "ok";

        if (call.name === "get_market_price") {
          try {
            const snap = await getSnapshot(String(args.asset || "SOL"));
            toolResult = describeMarket(snap);
          } catch (e: any) {
            toolResult = `Error: ${e.message ?? String(e)}`;
          }
        } else if (call.name === "propose_opportunity") {
          let trigger: Trigger | undefined;
          let scheduledFor: number | undefined;
          const now = Date.now();
          const tk = String(args.triggerKind || "time");
          const deadlineSecs = Math.max(60, Math.round(Number(args.expiresInSeconds) || 180));

          if (tk === "dip" && args.asset && args.basisPrice && args.dropPct) {
            trigger = {
              kind: "dip",
              asset: String(args.asset).toUpperCase(),
              basisPrice: Number(args.basisPrice),
              dropPct: Number(args.dropPct),
              deadline: now + deadlineSecs * 1000,
            };
            scheduledFor = now;
          } else if ((tk === "below" || tk === "above") && args.asset && args.targetPrice) {
            trigger = {
              kind: tk,
              asset: String(args.asset).toUpperCase(),
              price: Number(args.targetPrice),
              deadline: now + deadlineSecs * 1000,
            };
            scheduledFor = now;
          } else {
            const inSecs = Math.max(0, Number(args.scheduledForSeconds) || 30);
            trigger = { kind: "time" };
            scheduledFor = now + inSecs * 1000;
          }

          opportunities.push({
            title: String(args.title).slice(0, 80),
            message: String(args.message),
            suggested: {
              vendor: String(args.vendor),
              amount: Math.round(Number(args.amount) * 10 ** DEMO_DECIMALS),
              reason: String(args.reason),
              trigger,
              scheduledFor,
            },
            confidence: ["low", "medium", "high"].includes(args.confidence)
              ? args.confidence
              : "medium",
            expiresAt: now + deadlineSecs * 1000,
          });
          toolResult = "logged";
          done = true;
        } else if (call.name === "no_opportunities") {
          toolResult = "noted";
          done = true;
        }

        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: toolResult,
        });
      }

      if (done) break;
    }

    if (handlerId) {
      try {
        await recordLlmUsage({
          handlerId,
          provider: provider as Provider,
          model: adapter.defaultModel,
          promptTokens: scanPromptTokens,
          completionTokens: scanCompletionTokens,
          endpoint: "scan",
          durationMs: Date.now() - requestStart,
        });
      } catch (e) {
        console.warn("[scan] llm_usage record failed", e);
      }
    }

    return NextResponse.json({ opportunities });
  } catch (e: any) {
    return NextResponse.json(
      { opportunities: [], error: e.message ?? String(e) },
      { status: 500 }
    );
  }
}
