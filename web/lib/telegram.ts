/**
 * Telegram bot helpers.
 *
 * v1.2: bot delegates to /api/agent/chat via internal auth — inherits
 * the full tool suite (propose_swap, get_market_price, get_yield_options,
 * get_wallet_state, etc.) without duplicating it. Schedule actions
 * returned by the LLM are applied server-side (insert into DB). Actual
 * on-chain signing still happens in the browser session because the
 * agent keypair lives in localStorage.
 */

import { Bot, webhookCallback } from "grammy";
import { supabaseAdmin } from "@/lib/supabase";
import { getDecryptedByokKey } from "@/lib/db/byok";
import { listAgentsForHandler } from "@/lib/db/agents";
import { listChatMessages, appendChatMessage } from "@/lib/db/chat";
import { listScheduleForAgent, createScheduledItem, removeScheduledItem } from "@/lib/db/schedule";
import { PERSONAS, getPersona } from "@/lib/personas";
import { DEMO_DECIMALS } from "@/lib/saw";

const WEB_URL = process.env.NEXT_PUBLIC_APP_URL || "https://saw-gilt.vercel.app";

let _bot: Bot | null = null;

export function getBot(): Bot | null {
  if (!process.env.TELEGRAM_BOT_TOKEN) return null;
  if (_bot) return _bot;
  _bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
  registerHandlers(_bot);
  return _bot;
}

let _webhookCallback: any = null;
export function webhookHandler() {
  const bot = getBot();
  if (!bot) return null;
  if (!_webhookCallback) _webhookCallback = webhookCallback(bot, "std/http");
  return _webhookCallback as (req: Request) => Promise<Response>;
}

function registerHandlers(bot: Bot) {
  bot.command("start", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    // Already linked?
    const existing = await findLink(chatId);
    if (existing) {
      await ctx.reply(
        `✓ You're already linked.\n\nSend me anything to talk to your agent.\nFull execution via: ${WEB_URL}/demo`
      );
      return;
    }

    // Deep-link with a pair code? Telegram passes ?start=<code>
    // from t.me deep links as the first argument to /start.
    const arg = ctx.match?.toString().trim();
    if (arg) {
      const db = supabaseAdmin();
      const { data: pair } = await db
        .from("telegram_pair_codes")
        .select("handler_id, expires_at, consumed_at")
        .eq("code", arg)
        .maybeSingle();

      if (!pair) {
        await ctx.reply(
          `Invalid pair code. Open ${WEB_URL}/demo → Connect Telegram for a fresh link.`
        );
        return;
      }
      if (pair.consumed_at) {
        await ctx.reply(`That code was already used. Generate a new one in the web.`);
        return;
      }
      if (new Date(pair.expires_at) < new Date()) {
        await ctx.reply(`That code expired. Generate a new one in the web.`);
        return;
      }
      if (!pair.handler_id) {
        await ctx.reply(`Code missing handler. Reopen the deep link from /demo.`);
        return;
      }

      await db.from("telegram_links").upsert(
        {
          handler_id: pair.handler_id,
          chat_id: chatId,
          username: ctx.from?.username ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "chat_id" }
      );
      await db
        .from("telegram_pair_codes")
        .update({ consumed_at: new Date().toISOString(), chat_id: chatId })
        .eq("code", arg);

      await ctx.reply(
        `✓ Linked.\n\nMandame lo que quieras.\nEjecuciones on-chain: ${WEB_URL}/demo`
      );
      return;
    }

    // Bare /start → tell the user how to onboard
    await ctx.reply(
      `Welcome to SAW.\n\nOpen ${WEB_URL}/demo and click "Connect Telegram" — that brings you back here with a one-click link.`
    );
  });

  bot.command("status", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const link = await findLink(chatId);
    if (!link) {
      await ctx.reply("Not linked. Send /start to begin.");
      return;
    }
    const agents = await listAgentsForHandler(link.handler_id);
    await ctx.reply(
      `Linked: @${link.username ?? "?"}\n` +
        `Talking to: ${link.active_persona ?? "greedie"}\n` +
        `Agents: ${agents.length}\n` +
        agents
          .map(
            (a) =>
              `${a.persona === (link.active_persona ?? "greedie") ? "▶ " : "· "}${a.persona} (${a.active ? "auto-wake" : "silent"})`
          )
          .join("\n") +
        `\n\nSwitch with /switch greedie | conservador | estable`
    );
  });

  bot.command("switch", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const link = await findLink(chatId);
    if (!link) {
      await ctx.reply("Not linked. Send /start to begin.");
      return;
    }
    const arg = ctx.match?.toString().trim().toLowerCase();
    const valid = ["greedie", "conservador", "estable"] as const;
    if (!arg || !valid.includes(arg as any)) {
      await ctx.reply(
        `Pick one: /switch greedie | conservador | estable\n\nCurrent: ${link.active_persona ?? "greedie"}`
      );
      return;
    }
    await supabaseAdmin()
      .from("telegram_links")
      .update({ active_persona: arg })
      .eq("chat_id", chatId);
    await ctx.reply(`Now talking to ${arg}. Mandame lo que necesites.`);
  });

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat?.id;
    const text = ctx.message?.text?.trim();
    if (!chatId || !text || text.startsWith("/")) return;

    const link = await findLink(chatId);
    if (!link) {
      await ctx.reply("This chat is not linked. Send /start.");
      return;
    }

    const agents = await listAgentsForHandler(link.handler_id);
    if (agents.length === 0) {
      await ctx.reply(`No agents yet. Create one in the web first: ${WEB_URL}/demo`);
      return;
    }

    // Auto-routing: heuristic keyword scan picks the persona best suited
    // for the message. If it differs from the current active_persona, we
    // hand off explicitly so the user always knows who's talking.
    const currentPersona = link.active_persona ?? "greedie";
    const detected = detectIntentPersona(text);
    let wantPersona = currentPersona;
    let handoffNote = "";
    if (detected && detected !== currentPersona) {
      const fromName = getPersona(currentPersona)?.name ?? currentPersona;
      const toName = getPersona(detected)?.name ?? detected;
      const reason = handoffReason(detected);
      handoffNote =
        `🔁 ${fromName} → ${toName}.\n` +
        `Eso entra como ${reason}. Te lo paso a ${toName}, ya lo agarra.\n\n`;
      wantPersona = detected;
      await supabaseAdmin()
        .from("telegram_links")
        .update({ active_persona: detected })
        .eq("chat_id", chatId);
    }

    const agent =
      agents.find((a) => a.persona === wantPersona && a.byok_key_id) ??
      agents.find((a) => a.byok_key_id) ??
      agents[0];

    // Key resolution: if the agent has a BYOK key attached, decrypt
    // and use it. Otherwise let the endpoint fall back to SAW's key
    // (paid via credits) — no key in the request triggers the credit
    // path on the server.
    let plaintextKey: string | undefined;
    if (agent.byok_key_id) {
      try {
        const key = await getDecryptedByokKey(agent.byok_key_id);
        plaintextKey = key.plaintext;
      } catch {
        await ctx.reply("Couldn't decrypt your LLM key. Re-add via the web.");
        return;
      }
    }

    const internalSecret = process.env.INTERNAL_API_SECRET;
    if (!internalSecret) {
      await ctx.reply(
        "Server missing INTERNAL_API_SECRET. The bot needs this to talk to the agent endpoint."
      );
      return;
    }

    await ctx.replyWithChatAction("typing");

    // Load context: last 12 chat messages + current schedule for the
    // active persona, so the agent has full briefing context.
    const [history, schedule] = await Promise.all([
      listChatMessages(agent.id, 12),
      listScheduleForAgent(agent.id),
    ]);
    const personaDef = getPersona(agent.persona) ?? PERSONAS[0];
    const queuedItems = schedule
      .filter((s) => s.status === "queued")
      .slice(0, 8)
      .map((s) => ({
        id: s.id,
        vendor: s.vendor ?? "",
        amount: Number(s.amount),
        scheduledFor: new Date(s.scheduled_for).getTime(),
        reason: s.reason ?? "",
        status: s.status,
      }));

    // Reuse the web's /api/agent/chat endpoint via internal auth so the
    // bot inherits all the LLM tools (propose_swap, get_market_price,
    // get_yield_options, get_wallet_state, etc.) without duplicating
    // the logic here. Returns { reply, actions }.
    let reply = "";
    let actions: Array<any> = [];
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-internal-secret": internalSecret,
        "x-handler-id": link.handler_id,
        "x-telegram-voice": "1",
      };
      if (plaintextKey) headers["x-user-api-key"] = plaintextKey;
      const res = await fetch(`${WEB_URL}/api/agent/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          persona: {
            id: personaDef.id,
            name: personaDef.name,
            role: personaDef.role,
            mission: personaDef.mission,
            policy: personaDef.policy,
            walletBalance: 0, // server can't read on-chain balance for TG; LLM treats as unknown
          },
          schedule: queuedItems,
          conversation: history.map((m) => ({
            role: m.role === "agent" ? "agent" : m.role === "system" ? "system" : "user",
            content: m.content,
          })),
          newMessage: text,
          surface: "telegram",
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      reply = String(data.reply ?? "").trim();
      actions = Array.isArray(data.actions) ? data.actions : [];
    } catch (e: any) {
      await ctx.reply(`Agent error: ${e.message ?? String(e)}`);
      return;
    }

    // Apply actions server-side so the schedule item exists in DB by
    // the time the user opens the web for on-chain signing.
    const appliedSummary: string[] = [];
    for (const action of actions) {
      try {
        if (action.type === "add") {
          const item = action.item ?? {};
          const trig = item.trigger ?? { kind: "time" };
          const createdRow = await createScheduledItem({
            agentId: agent.id,
            actionType: "pay",
            vendor: String(item.vendor ?? ""),
            amount: Number(item.amount ?? 0),
            asset: "USDC-dev",
            reason: String(item.reason ?? ""),
            scheduledFor: new Date(Number(item.scheduledFor ?? Date.now())),
            trigger: {
              kind: trig.kind,
              basisPrice: trig.basisPrice,
              dropPct: trig.dropPct,
              targetPrice: trig.price,
              deadline: trig.deadline ? new Date(trig.deadline) : undefined,
            },
          });
          appliedSummary.push(
            `+ ${(Number(createdRow.amount) / 10 ** DEMO_DECIMALS).toFixed(2)} USDC-dev → ${createdRow.vendor ?? "?"}`
          );
        } else if (action.type === "remove") {
          await removeScheduledItem(String(action.id));
          appliedSummary.push(`- removed item`);
        }
        // "modify" and "ready" are no-ops from TG for now.
      } catch (e: any) {
        appliedSummary.push(`! error applying ${action.type}: ${e.message ?? String(e)}`);
      }
    }

    // Persist the conversation turn.
    await appendChatMessage(agent.id, "user", text);
    if (reply) await appendChatMessage(agent.id, "agent", reply);

    const finalText = [
      handoffNote,
      reply || "Listo.",
      appliedSummary.length > 0
        ? `\n\n📋 Dossier updated:\n${appliedSummary.join("\n")}\n\nSign on-chain at ${WEB_URL}/demo when ready.`
        : "",
    ]
      .join("")
      .trim();

    await ctx.reply(finalText);
  });
}

// Lightweight keyword-based intent router. Returns the persona best
// suited for the message, or null when ambiguous / casual (in which
// case the current active persona stays). Zero-cost, runs in <1ms.
// Words intentionally include both English and Spanish; if a keyword
// appears for multiple personas, the persona with the most hits wins;
// ties resolve in order greedie > conservador > estable (the most
// "action-oriented" person breaks the tie since the user is asking
// for something concrete).
function detectIntentPersona(
  text: string
): "greedie" | "conservador" | "estable" | null {
  const t = text.toLowerCase();

  const greedieHints = [
    "swap", "buy", "sell", "trade", "trader",
    "compra", "vende", "venta", "vender",
    "price", "precio", "pump", "dump", "moon",
    "alpha", "momentum", "tape", "candle", "vela",
    "long", "short", "leverage", "perp",
    "sol", "bonk", "jup", "btc", "eth",
    "dip", "rip", "ath", "atl",
  ];

  const conservadorHints = [
    "yield", "apr", "apy", "stake", "staking", "lend", "lending",
    "pool", "vault", "farm", "harvest",
    "kamino", "marginfi", "lulo", "drift", "jupiter lend", "save",
    "rendimiento", "rendir", "interes", "interés",
    "deposit", "deposito", "depósito", "depositar",
  ];

  const estableHints = [
    "save", "savings", "ahorrar", "ahorro", "ahorrá",
    "habit", "hábito", "habito", "weekly", "monthly", "every week",
    "every month", "todas las semanas", "todos los meses",
    "budget", "presupuesto",
    "coach", "consejo", "plan", "rebalance", "rebalancear",
    "set aside", "guardar", "apartar",
  ];

  const hits = (list: string[]) =>
    list.reduce((n, w) => (t.includes(w) ? n + 1 : n), 0);

  const g = hits(greedieHints);
  const c = hits(conservadorHints);
  const e = hits(estableHints);

  if (g === 0 && c === 0 && e === 0) return null;
  const max = Math.max(g, c, e);
  if (g === max) return "greedie";
  if (c === max) return "conservador";
  return "estable";
}

function handoffReason(p: "greedie" | "conservador" | "estable"): string {
  if (p === "greedie") return "trade / market read (degen desk)";
  if (p === "conservador") return "yield / staking (research desk)";
  return "savings / habit (coach desk)";
}

async function findLink(chatId: number) {
  const { data } = await supabaseAdmin()
    .from("telegram_links")
    .select("handler_id, username, active_persona")
    .eq("chat_id", chatId)
    .maybeSingle();
  return data;
}

function randomCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}
