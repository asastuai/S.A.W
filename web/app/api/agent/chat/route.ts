import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { describeMarket, getSnapshot } from "@/lib/market";

export const runtime = "nodejs";

const DEMO_DECIMALS = 6;
const MAX_ITERATIONS = 6;

type ChatMessage = {
  role: "user" | "agent" | "system";
  content: string;
};

type ScheduleItemLite = {
  id: string;
  vendor: string;
  amount: number;
  scheduledFor: number;
  reason: string;
  status: string;
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
  schedule: ScheduleItemLite[];
  conversation: ChatMessage[];
  newMessage: string;
};

type Trigger =
  | { kind: "time" }
  | { kind: "dip"; asset: string; basisPrice: number; dropPct: number; deadline?: number }
  | { kind: "below"; asset: string; price: number; deadline?: number }
  | { kind: "above"; asset: string; price: number; deadline?: number };

type ActionAdd = {
  type: "add";
  item: {
    vendor: string;
    amount: number;
    scheduledFor: number;
    reason: string;
    trigger?: Trigger;
  };
};
type ActionRemove = { type: "remove"; id: string };
type ActionModify = {
  type: "modify";
  id: string;
  changes: { vendor?: string; amount?: number; scheduledFor?: number; reason?: string };
};
type ActionReady = { type: "ready" };
export type AgentAction = ActionAdd | ActionRemove | ActionModify | ActionReady;

function fmt(n: number): string {
  return `${(n / 10 ** DEMO_DECIMALS).toFixed(2)} TEST`;
}

function buildSystemPrompt(body: RequestBody): string {
  const { persona, schedule } = body;
  const isGreedie = persona.id === "greedie";
  const scheduleSummary =
    schedule.length === 0
      ? "Schedule is currently empty."
      : `Current schedule (${schedule.length} items):\n` +
        schedule
          .map(
            (i) =>
              `- ${i.id} | ${fmt(i.amount)} → ${i.vendor} at ${new Date(
                i.scheduledFor
              ).toLocaleTimeString()} (${i.status}) | "${i.reason}"`
          )
          .join("\n");

  const greedieExtras = isGreedie
    ? `

You are a trader. You read the market before proposing anything.

Workflow when the handler asks you to buy/sell something:
1. ALWAYS call get_market_price first to see current price, 24h range, and momentum.
2. Decide a strategy based on what you see:
   - Asset near 24h low + bearish: propose a threshold_buy slightly below current (e.g. -0.5%) with short deadline
   - Asset mid-range + choppy: propose twap_series spread across the next 60-120 seconds
   - Asset near 24h high: propose a deeper dip_buy (-2 to -3%) with longer deadline OR suggest waiting
   - User asks aggressive: tighter targets, faster execution
   - User asks safe: wider targets, more patience
3. Explain your reading IN ONE SENTENCE before adding items. ("SOL is at $185, sitting near 24h low after -1.2% — going to spread 3 dip-buys.")
4. Propose 1-4 conditional items. Be specific about the trigger.
5. Wait for handler confirmation before mark_ready_to_run.

For the demo: use short timeframes. Trigger deadlines in 90-180 seconds. TWAP intervals in seconds, not hours.`
    : "";

  return `You are ${persona.name}, a ${persona.role}.
Mission: ${persona.mission}

Briefing chat with your handler. They tell you intent; you propose a schedule.

Policy limits:
- Daily cap: ${fmt(persona.policy.dailyLimit)}
- Per-tx cap: ${fmt(persona.policy.perTxLimit)}
- Approval threshold: ${fmt(persona.policy.approvalThreshold)} (above this, handler signs at execution)
- Wallet balance: ${fmt(persona.walletBalance)}

${scheduleSummary}

NOW is ${new Date().toISOString()} (epoch ms: ${Date.now()}).

USE TOOLS to add/modify/remove items — don't just describe. Amounts are in TEST tokens (whole units like 20). Be conversational and brief. ALWAYS reply in English.${greedieExtras}

When schedule looks ready and user confirms, call mark_ready_to_run.`;
}

const baseTools = [
  {
    type: "function" as const,
    function: {
      name: "add_schedule_item",
      description:
        "Add a time-based payment. amount in TEST whole units. scheduledFor in unix epoch ms.",
      parameters: {
        type: "object",
        properties: {
          vendor: { type: "string" },
          amount: { type: "number" },
          scheduledFor: { type: "number" },
          reason: { type: "string" },
        },
        required: ["vendor", "amount", "scheduledFor", "reason"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_schedule_item",
      description: "Remove a queued item by id.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "modify_schedule_item",
      description: "Change vendor/amount/scheduledFor/reason of a queued item.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          vendor: { type: "string" },
          amount: { type: "number" },
          scheduledFor: { type: "number" },
          reason: { type: "string" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "mark_ready_to_run",
      description: "Handler confirmed go. Mark schedule ready to execute.",
      parameters: { type: "object", properties: {} },
    },
  },
];

const greedieTools = [
  {
    type: "function" as const,
    function: {
      name: "get_market_price",
      description:
        "Fetch current market snapshot for an asset (price USD, 24h high/low, 24h change %, momentum). Always call before proposing buys.",
      parameters: {
        type: "object",
        properties: {
          asset: {
            type: "string",
            description: "Symbol (e.g. SOL, BTC, ETH, JUP, BONK)",
          },
        },
        required: ["asset"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_dip_buy_item",
      description:
        "Add a buy that triggers when asset drops a % from a basis price. Use when expecting a pullback.",
      parameters: {
        type: "object",
        properties: {
          vendor: { type: "string", description: "Label, e.g. 'Jupiter · SOL dip-buy'" },
          amount: { type: "number", description: "TEST tokens (whole units)" },
          asset: { type: "string", description: "Asset symbol to watch" },
          basisPrice: { type: "number", description: "USD price as basis (usually current price)" },
          dropPct: { type: "number", description: "Drop % from basis to trigger (e.g. 1.5)" },
          deadlineSeconds: { type: "number", description: "Cancel if not triggered in N seconds (default 180)" },
          reason: { type: "string" },
        },
        required: ["vendor", "amount", "asset", "basisPrice", "dropPct", "reason"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_threshold_buy_item",
      description:
        "Add a buy that triggers when asset crosses an absolute price (above or below).",
      parameters: {
        type: "object",
        properties: {
          vendor: { type: "string" },
          amount: { type: "number" },
          asset: { type: "string" },
          targetPrice: { type: "number", description: "USD price to trigger at" },
          direction: { type: "string", enum: ["below", "above"] },
          deadlineSeconds: { type: "number" },
          reason: { type: "string" },
        },
        required: ["vendor", "amount", "asset", "targetPrice", "direction", "reason"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_twap_series",
      description:
        "Add a series of equal-size time-based buys (TWAP). Splits totalAmount into count items spaced intervalSeconds apart.",
      parameters: {
        type: "object",
        properties: {
          vendor: { type: "string" },
          totalAmount: { type: "number", description: "Total TEST to spread across items" },
          count: { type: "number", description: "Number of equal buys (2-6)" },
          intervalSeconds: { type: "number", description: "Spacing between buys" },
          reason: { type: "string" },
        },
        required: ["vendor", "totalAmount", "count", "intervalSeconds", "reason"],
      },
    },
  },
];

function noKeyReply(): { reply: string; actions: AgentAction[] } {
  return {
    reply:
      "I need a brain to think. Click ⚙ Configure agent above and paste your free Groq API key — takes a minute at console.groq.com/keys.",
    actions: [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    if (!body.newMessage?.trim()) {
      return NextResponse.json({ reply: "", actions: [] });
    }

    const userKey = req.headers.get("x-user-api-key")?.trim() || "";
    const apiKey = userKey || process.env.GROQ_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json(noKeyReply());
    }

    const groq = new Groq({ apiKey });
    const tools =
      body.persona.id === "greedie" ? [...greedieTools, ...baseTools] : baseTools;
    const system = buildSystemPrompt(body);

    const messages: any[] = [
      { role: "system", content: system },
      ...body.conversation.map((m) => ({
        role: m.role === "agent" ? "assistant" : m.role === "system" ? "system" : "user",
        content: m.content,
      })),
      { role: "user", content: body.newMessage },
    ];

    const actions: AgentAction[] = [];
    let finalReply = "";

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const completion = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.5,
        max_tokens: 900,
      });

      const choice = completion.choices[0]?.message;
      const toolCalls = choice?.tool_calls ?? [];

      if (toolCalls.length === 0) {
        finalReply = (choice?.content ?? "").trim();
        break;
      }

      messages.push({
        role: "assistant",
        content: choice?.content ?? "",
        tool_calls: toolCalls,
      });

      let triggeredAction = false;

      for (const call of toolCalls) {
        let args: any = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch (_) {}

        let toolResult = "ok";

        switch (call.function.name) {
          case "get_market_price":
            try {
              const snap = await getSnapshot(String(args.asset || "SOL"));
              toolResult = describeMarket(snap);
            } catch (e: any) {
              toolResult = `Error fetching price: ${e.message ?? String(e)}`;
            }
            break;

          case "add_schedule_item":
            actions.push({
              type: "add",
              item: {
                vendor: String(args.vendor),
                amount: Math.round(Number(args.amount) * 10 ** DEMO_DECIMALS),
                scheduledFor: Number(args.scheduledFor),
                reason: String(args.reason),
                trigger: { kind: "time" },
              },
            });
            triggeredAction = true;
            toolResult = "added";
            break;

          case "add_dip_buy_item": {
            const deadlineSecs = Number(args.deadlineSeconds ?? 180);
            actions.push({
              type: "add",
              item: {
                vendor: String(args.vendor),
                amount: Math.round(Number(args.amount) * 10 ** DEMO_DECIMALS),
                scheduledFor: Date.now(),
                reason: String(args.reason),
                trigger: {
                  kind: "dip",
                  asset: String(args.asset).toUpperCase(),
                  basisPrice: Number(args.basisPrice),
                  dropPct: Number(args.dropPct),
                  deadline: Date.now() + deadlineSecs * 1000,
                },
              },
            });
            triggeredAction = true;
            toolResult = "added dip-buy";
            break;
          }

          case "add_threshold_buy_item": {
            const deadlineSecs = Number(args.deadlineSeconds ?? 180);
            const direction = args.direction === "above" ? "above" : "below";
            actions.push({
              type: "add",
              item: {
                vendor: String(args.vendor),
                amount: Math.round(Number(args.amount) * 10 ** DEMO_DECIMALS),
                scheduledFor: Date.now(),
                reason: String(args.reason),
                trigger: {
                  kind: direction,
                  asset: String(args.asset).toUpperCase(),
                  price: Number(args.targetPrice),
                  deadline: Date.now() + deadlineSecs * 1000,
                },
              },
            });
            triggeredAction = true;
            toolResult = "added threshold-buy";
            break;
          }

          case "add_twap_series": {
            const count = Math.max(1, Math.min(8, Math.round(Number(args.count) || 3)));
            const interval = Math.max(2, Math.round(Number(args.intervalSeconds) || 10));
            const total = Number(args.totalAmount);
            const each = total / count;
            const reason = String(args.reason);
            for (let k = 0; k < count; k++) {
              actions.push({
                type: "add",
                item: {
                  vendor: `${args.vendor} (${k + 1}/${count})`,
                  amount: Math.round(each * 10 ** DEMO_DECIMALS),
                  scheduledFor: Date.now() + k * interval * 1000,
                  reason: `${reason} — TWAP slice ${k + 1}/${count}`,
                  trigger: { kind: "time" },
                },
              });
            }
            triggeredAction = true;
            toolResult = `added ${count} TWAP slices`;
            break;
          }

          case "remove_schedule_item":
            actions.push({ type: "remove", id: String(args.id) });
            triggeredAction = true;
            toolResult = "removed";
            break;

          case "modify_schedule_item": {
            const changes: ActionModify["changes"] = {};
            if (args.vendor !== undefined) changes.vendor = String(args.vendor);
            if (args.amount !== undefined)
              changes.amount = Math.round(Number(args.amount) * 10 ** DEMO_DECIMALS);
            if (args.scheduledFor !== undefined)
              changes.scheduledFor = Number(args.scheduledFor);
            if (args.reason !== undefined) changes.reason = String(args.reason);
            actions.push({ type: "modify", id: String(args.id), changes });
            triggeredAction = true;
            toolResult = "modified";
            break;
          }

          case "mark_ready_to_run":
            actions.push({ type: "ready" });
            triggeredAction = true;
            toolResult = "ready";
            break;

          default:
            toolResult = "unknown tool";
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: toolResult,
        });
      }

      // If only mutating tools were called (no get_*), we don't need another LLM round
      // unless the assistant produced no content. But Llama tends to want to summarize
      // after — let it do one more pass max.
      if (
        triggeredAction &&
        !toolCalls.some((c) => c.function.name === "get_market_price")
      ) {
        // give it one more round to summarize, then break
        const followup = await groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages,
          tools,
          tool_choice: "none",
          temperature: 0.4,
          max_tokens: 300,
        });
        finalReply = (followup.choices[0]?.message?.content ?? "").trim();
        break;
      }
    }

    if (!finalReply && actions.length > 0) {
      const adds = actions.filter((a) => a.type === "add").length;
      const removes = actions.filter((a) => a.type === "remove").length;
      const ready = actions.some((a) => a.type === "ready");
      const parts = [];
      if (adds > 0) parts.push(`Added ${adds} ${adds === 1 ? "item" : "items"}`);
      if (removes > 0) parts.push(`Removed ${removes}`);
      if (ready) parts.push("Locked in. Starting execution.");
      finalReply = parts.join(". ") || "Done.";
    }
    if (!finalReply) finalReply = "…";

    return NextResponse.json({ reply: finalReply, actions });
  } catch (e: any) {
    return NextResponse.json(
      { reply: `LLM error: ${e.message ?? String(e)}`, actions: [] },
      { status: 500 }
    );
  }
}
