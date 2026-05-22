import { NextRequest, NextResponse } from "next/server";
import { describeMarket, getSnapshot } from "@/lib/market";
import { describeYieldPools, topYieldPools } from "@/lib/defillama";
import { detectProvider } from "@/lib/api-key";
import { getProviderAdapter, isProviderImplemented } from "@/lib/providers";
import type { ChatMessage as ProviderMessage, ToolDefinition } from "@/lib/providers";
import { extractPrivyClaims } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { llmRateLimitReached, recordLlmUsage } from "@/lib/db/llm";
import type { Provider } from "@/lib/db/types";

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
  const isConservador = persona.id === "conservador";
  const isEstable = persona.id === "estable";
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

You have TWO kinds of actions:
- propose_swap: Jupiter swap between two assets (e.g. SOL→USDC, BONK→SOL). This is your primary tool for any "buy", "sell", "trade", "swap" intent. SAW collects a 55 bps platform fee on each swap, automatically.
- add_dip_buy_item / add_threshold_buy_item / add_twap_series: legacy TEST-token transfers. Use only if the handler explicitly wants test transfers.

Workflow when the handler asks you to buy/sell/swap something:
1. ALWAYS call get_market_price first to see current price, 24h range, and momentum.
2. Decide a strategy based on what you see:
   - Asset near 24h low + bearish: propose_swap with trigger=below at slightly under current
   - Asset mid-range + choppy: propose 2-3 propose_swap items spaced via different triggers
   - Asset near 24h high: propose_swap with trigger=dip (-2 to -3%) and longer deadline, or suggest waiting
   - User asks aggressive: tighter targets, faster execution
   - User asks safe: wider targets, more patience
3. Explain your reading IN ONE SENTENCE before adding items. ("SOL is at $185, sitting near 24h low after -1.2% — going to swap 0.5 SOL for USDC on a dip.")
4. Propose 1-4 swap items. Be specific about fromAsset, toAsset, amount, trigger.
5. Wait for handler confirmation before mark_ready_to_run.

For the demo: use short timeframes. Trigger deadlines in 90-180 seconds.

v1.0 note: Jupiter has no real devnet liquidity, so swaps run in mock mode (the fee, audit log, and UX are real; the on-chain leg is simulated). Real Jupiter integration lands when SAW moves to mainnet.`
    : "";

  const estableExtras = isEstable
    ? `

You are a personal wealth coach, NOT a trader. Your job is to help the handler build healthy financial habits over time.

Workflow when the handler talks to you:
1. ASK first, propose later. Get clarity on the goal (save? rebalance? set aside for a fixed purpose? build emergency fund?) before suggesting anything.
2. Use round, predictable amounts. Recurring habits, not opportunistic moves.
3. Examples of plans you draft:
   - "Set aside $20 every Monday for 8 weeks → emergency cushion"
   - "If wallet exceeds $1000, auto-rebalance excess to USDC"
   - "Weekly reminder to check exposure if any single asset > 40% of balance"
4. Use propose_swap to move small amounts into stables (USDC) when the user wants to "set aside" or "lock in gains". Never use swap for speculation.
5. Be reassuring, never pushy. Use phrases like "no rush", "let me know when you're comfortable", "we can adjust this".
6. ALWAYS surface the policy: "Your daily cap is X, per-tx Y. Above Z you'll sign. Comfortable?"
7. Mark items ready_to_run only after explicit confirmation.

Tone: calm, patient, like a financial advisor friend. No hype, no FOMO, no "alpha". You are anti-degen.

Your job: turn one-time decisions into repeated habits.`
    : "";

  const conservadorExtras = isConservador
    ? `

You are a yield researcher who ACTS, not just talks. The handler comes to you for proactive picks with LIVE DATA, not interrogation.

GOLDEN RULE: when the user gives you an asset + amount + intent (e.g. "put 500 USDC to work, best APR, safe"), you have enough. DO NOT ask for more clarification. Make a call.

MANDATORY WORKFLOW for any "yield / staking / lending / where to put X" question:

Step 1 — Acknowledge in ONE short sentence:
"On it — pulling top USDC yield venues on Solana right now, back in a sec with the top 3."

Step 2 — Call get_yield_options with the asset (e.g. asset="USDC"). This returns LIVE APRs from DefiLlama, NOT your training data. Use safeOnly=true for stables, safeOnly=false if the user explicitly wants risky picks.

Step 3 — Pick the top 3 from the response. For each, call propose_swap:
- fromAsset = the user's asset (e.g. "USDC")
- toAsset = the venue's vault token (e.g. "kUSDC" for Kamino, "USDC-supply" for MarginFi). If unclear, use a descriptive symbol like "KAMINO-USDC".
- amount = user's amount divided by 3 if diversifying, or full amount on the top pick if they want a single position. Default: full amount on #1, smaller chunks on #2 and #3 as alternatives.
- vendor = "{project} · {symbol} · {apy}%" (e.g. "kamino-lend · USDC · 18.4%")
- trigger = "now"
- reason = brief, factual, e.g. "Top APR on safe USDC pools today"

Step 4 — After the tool calls, reply with a tight summary citing the LIVE APRs from step 2's response. Example:
"Three picks ordered by APR:
• kamino-lend USDC — 18.4% · TVL $340M · solid
• marginfi USDC supply — 14.7% · TVL $180M · solid
• lulo USDC — 21.2% · TVL $45M · younger, slightly more risk
Your call — tap Accept on the one you want, or tell me to swap any for another."

What you NEVER do:
- ask "what's your risk tolerance?" — assume safe-default and proceed
- ask "what amount?" — they gave it; use it
- propose_swap without first calling get_yield_options (data must be live)
- claim numbers from training data — always cite what get_yield_options returned

Tone: measured, decisive, factual. "Boring is the alpha" — but boring doesn't mean slow.`
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

USE TOOLS to add/modify/remove items — don't just describe. Amounts are in TEST tokens (whole units like 20). Be conversational and brief. ALWAYS reply in English.

CRITICAL OUTPUT RULE: Every response MUST contain a short natural-language reply to the handler in addition to any tool calls. Never return only tool calls with empty text. Even one sentence like "Done, added X" or "Looking at the market now…" is mandatory.${greedieExtras}${conservadorExtras}${estableExtras}

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
      name: "get_yield_options",
      description:
        "Fetch top yield/staking opportunities on Solana RIGHT NOW from DefiLlama. Returns top N pools by APR matching an asset filter. CRITICAL: call this BEFORE proposing any yield/staking/lending item — use real live APRs, never training-data estimates.",
      parameters: {
        type: "object",
        properties: {
          asset: {
            type: "string",
            description: "Asset symbol to look for (e.g. USDC, USDT, SOL, mSOL). Substring match against pool symbols.",
          },
          safeOnly: {
            type: "boolean",
            description: "If true, filter to single-asset low-IL pools with TVL > $5M (default true for stables).",
          },
          limit: {
            type: "number",
            description: "How many pools to return (default 5, max 10).",
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
  {
    type: "function" as const,
    function: {
      name: "propose_swap",
      description:
        "Schedule a Jupiter swap from one asset to another. v1.0 runs in devnet-mock mode (Jupiter has no real devnet liquidity), but the schedule + fee ledger + UI flow is real. Use this for any 'trade X for Y' intent. SAW takes a 55 bps platform fee, visible in preview.",
      parameters: {
        type: "object",
        properties: {
          fromAsset: { type: "string", description: "Asset to sell (e.g. SOL, USDC, BONK)" },
          toAsset: { type: "string", description: "Asset to buy" },
          amount: {
            type: "number",
            description: "Amount of fromAsset to swap, in whole units (e.g. 0.5 SOL → 0.5)",
          },
          trigger: {
            type: "string",
            enum: ["now", "dip", "below", "above"],
            description: "When to execute. 'now' = immediate.",
          },
          basisPrice: { type: "number", description: "Required when trigger=dip — USD basis price" },
          dropPct: { type: "number", description: "Required when trigger=dip — drop % from basis" },
          targetPrice: { type: "number", description: "Required when trigger=below/above — USD target" },
          deadlineSeconds: { type: "number", description: "Cancel if not triggered in N seconds (default 300)" },
          reason: { type: "string", description: "Why this swap, short" },
        },
        required: ["fromAsset", "toAsset", "amount", "trigger", "reason"],
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

    const provider = detectProvider(apiKey);
    if (provider === "unknown" || !isProviderImplemented(provider as any)) {
      return NextResponse.json({
        reply: `Unsupported API key format. Try Groq (gsk_...), Gemini (AIza...), DeepSeek (sk-...), or Grok (xai-...).`,
        actions: [],
      });
    }
    const adapter = getProviderAdapter(provider as any);

    // Optional rate limit: only enforced if the caller sent a Privy JWT
    // and the handler exists in DB. Anonymous requests pass through.
    let handlerId: string | null = null;
    try {
      const claims = extractPrivyClaims(req);
      if (claims) {
        const handler = await getHandlerByPrivy(claims.privy_user_id);
        if (handler) {
          handlerId = handler.id;
          const rl = await llmRateLimitReached(handler.id);
          if (rl.reached) {
            return NextResponse.json(
              {
                reply: `Daily LLM call cap reached (${rl.used}/${rl.limit}). Resets in 24h. Switch your BYOK provider or upgrade tier when ready.`,
                actions: [],
              },
              { status: 429 }
            );
          }
        }
      }
    } catch {
      /* non-fatal — rate limit is best-effort */
    }

    // All three personas get the swap + market tools. Their system
    // prompts steer them toward distinct use-cases (Greedie speculates,
    // Conservador researches yield, Estable builds habits / saves to
    // stables).
    const baseToolList = [...greedieTools, ...baseTools];
    const tools: ToolDefinition[] = baseToolList.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));
    const system = buildSystemPrompt(body);

    const messages: ProviderMessage[] = [
      { role: "system", content: system },
      ...body.conversation.map(
        (m): ProviderMessage => ({
          role: m.role === "agent" ? "assistant" : m.role === "system" ? "system" : "user",
          content: m.content,
        })
      ),
      { role: "user", content: body.newMessage },
    ];

    const actions: AgentAction[] = [];
    let finalReply = "";
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    const requestStart = Date.now();

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const response = await adapter.complete(
        {
          model: adapter.defaultModel,
          messages,
          tools,
          toolChoice: "auto",
          temperature: 0.5,
          maxTokens: 900,
        },
        apiKey
      );
      totalPromptTokens += response.usage.promptTokens;
      totalCompletionTokens += response.usage.completionTokens;

      const toolCalls = response.toolCalls;

      if (toolCalls.length === 0) {
        finalReply = response.content.trim();
        break;
      }

      messages.push({
        role: "assistant",
        content: response.content,
        toolCalls,
      });

      let triggeredAction = false;

      for (const call of toolCalls) {
        let args: any = {};
        try {
          args = JSON.parse(call.arguments || "{}");
        } catch (_) {}

        let toolResult = "ok";

        switch (call.name) {
          case "get_market_price":
            try {
              const snap = await getSnapshot(String(args.asset || "SOL"));
              toolResult = describeMarket(snap);
            } catch (e: any) {
              toolResult = `Error fetching price: ${e.message ?? String(e)}`;
            }
            break;

          case "get_yield_options":
            try {
              const asset = String(args.asset || "USDC");
              const safeOnly = args.safeOnly !== false; // default true
              const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));
              const pools = await topYieldPools({
                assetFilter: asset,
                safeOnly,
                limit,
              });
              toolResult =
                pools.length === 0
                  ? `No matching pools for ${asset}. Try a broader filter.`
                  : `Top ${pools.length} ${asset} pools on Solana (DefiLlama, live):\n${describeYieldPools(pools)}`;
            } catch (e: any) {
              toolResult = `Error fetching yields: ${e.message ?? String(e)}`;
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

          case "propose_swap": {
            const from = String(args.fromAsset || "SOL").toUpperCase();
            const to = String(args.toAsset || "USDC").toUpperCase();
            const amt = Number(args.amount);
            const tk = String(args.trigger || "now");
            const reason = String(args.reason || `swap ${from} for ${to}`);
            const now = Date.now();
            const deadlineSecs = Math.max(60, Math.round(Number(args.deadlineSeconds) || 300));

            // Build trigger
            let trigger: any = { kind: "time" };
            let scheduledFor = now;
            if (tk === "dip" && args.basisPrice && args.dropPct) {
              trigger = {
                kind: "dip",
                asset: from,
                basisPrice: Number(args.basisPrice),
                dropPct: Number(args.dropPct),
                deadline: now + deadlineSecs * 1000,
              };
            } else if ((tk === "below" || tk === "above") && args.targetPrice) {
              trigger = {
                kind: tk,
                asset: from,
                price: Number(args.targetPrice),
                deadline: now + deadlineSecs * 1000,
              };
            }

            // Encode the swap intent into the existing schedule-item shape:
            // vendor is a display string the UI parses; amount in TEST units
            // for now (devnet mock; real Jupiter integration in P2.5).
            actions.push({
              type: "add",
              item: {
                vendor: `SWAP · ${from} → ${to}`,
                amount: Math.round(amt * 10 ** DEMO_DECIMALS),
                scheduledFor,
                reason,
                trigger,
              },
            });
            triggeredAction = true;
            toolResult = `swap scheduled: ${amt} ${from} → ${to} (${tk})`;
            break;
          }

          default:
            toolResult = "unknown tool";
        }

        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: toolResult,
        });
      }

      // If only mutating tools were called (no observers), give the model
      // one final pass to summarize. Strip tools entirely so smaller
      // models can't crash by disobeying tool_choice:"none".
      if (
        triggeredAction &&
        !toolCalls.some(
          (c) =>
            c.name === "get_market_price" || c.name === "get_yield_options"
        )
      ) {
        const followup = await adapter.complete(
          {
            model: adapter.defaultModel,
            messages,
            tools: undefined,
            toolChoice: undefined,
            temperature: 0.4,
            maxTokens: 300,
          },
          apiKey
        );
        totalPromptTokens += followup.usage.promptTokens;
        totalCompletionTokens += followup.usage.completionTokens;
        finalReply = followup.content.trim();
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
    if (!finalReply) {
      finalReply =
        actions.length > 0
          ? "Done. Check the schedule on the right."
          : "Thinking — try a more specific request (asset, amount, when).";
    }

    // Best-effort: record usage for transparency + future analytics.
    if (handlerId) {
      try {
        await recordLlmUsage({
          handlerId,
          provider: provider as Provider,
          model: adapter.defaultModel,
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          endpoint: "chat",
          durationMs: Date.now() - requestStart,
        });
      } catch (e) {
        console.warn("[chat] llm_usage record failed", e);
      }
    }

    return NextResponse.json({ reply: finalReply, actions });
  } catch (e: any) {
    return NextResponse.json(
      { reply: `LLM error: ${e.message ?? String(e)}`, actions: [] },
      { status: 500 }
    );
  }
}
