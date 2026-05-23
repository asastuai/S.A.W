/**
 * Telegram bot helpers.
 *
 * v1: chat-only bot — the bot receives messages, routes them through
 * /api/agent/chat, and replies with the agent's reply + a link to the
 * web app for execution. Actual on-chain dispatch still requires the
 * browser session (agent keypair lives in localStorage).
 */

import { Bot, webhookCallback, type Context } from "grammy";
import { supabaseAdmin } from "@/lib/supabase";
import { detectProvider } from "@/lib/api-key";
import { getProviderAdapter, isProviderImplemented } from "@/lib/providers";
import { getDecryptedByokKey } from "@/lib/db/byok";
import { listAgentsForHandler } from "@/lib/db/agents";
import { listChatMessages, appendChatMessage } from "@/lib/db/chat";
import type { ChatMessage as ProviderMessage } from "@/lib/providers";

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

    // Active persona from the link (defaults to greedie). Falls back
    // to the first agent that has a key attached if the active one
    // isn't found (eg. a stale link from before multi-persona).
    const wantPersona = link.active_persona ?? "greedie";
    const agent =
      agents.find((a) => a.persona === wantPersona && a.byok_key_id) ??
      agents.find((a) => a.byok_key_id) ??
      agents[0];

    if (!agent.byok_key_id) {
      await ctx.reply(
        `Agent has no LLM key configured.\n\nOpen ${WEB_URL}/demo, set your API key, then click "Connect Telegram" again to attach it.`
      );
      return;
    }

    let key;
    try {
      key = await getDecryptedByokKey(agent.byok_key_id);
    } catch {
      await ctx.reply("Couldn't decrypt your LLM key. Re-add via the web.");
      return;
    }
    const provider = detectProvider(key.plaintext);
    if (!isProviderImplemented(provider as any)) {
      await ctx.reply(`Provider ${provider} not yet supported.`);
      return;
    }
    const adapter = getProviderAdapter(provider as any);

    await ctx.replyWithChatAction("typing");

    // Load last 10 messages from DB to keep context
    const history = await listChatMessages(agent.id, 10);
    const messages: ProviderMessage[] = [
      {
        role: "system",
        content: personaSystemPrompt(agent.persona, WEB_URL),
      },
      ...history.map(
        (m): ProviderMessage => ({
          role: m.role === "agent" ? "assistant" : m.role === "system" ? "system" : "user",
          content: m.content,
        })
      ),
      { role: "user", content: text },
    ];

    try {
      const response = await adapter.complete(
        {
          model: adapter.defaultModel,
          messages,
          temperature: 0.6,
          maxTokens: 400,
        },
        key.plaintext
      );
      const reply = response.content.trim() || "…";

      await appendChatMessage(agent.id, "user", text);
      await appendChatMessage(agent.id, "agent", reply);

      await ctx.reply(reply);
    } catch (e: any) {
      await ctx.reply(`LLM error: ${e.message ?? String(e)}`);
    }
  });
}

async function findLink(chatId: number) {
  const { data } = await supabaseAdmin()
    .from("telegram_links")
    .select("handler_id, username, active_persona")
    .eq("chat_id", chatId)
    .maybeSingle();
  return data;
}

function personaSystemPrompt(persona: string, webUrl: string): string {
  const shared =
    `You are a conversational assistant. Keep replies short — 1 to 3 sentences ` +
    `unless the user asks for detail. Respond in the same language the user wrote in. ` +
    `Greet greetings, answer questions, hold context. Don't end every reply with ` +
    `"open ${webUrl}/demo" — only mention it when the user asks to actually execute, ` +
    `swap, stake, or sign something on-chain. This is a chat surface, not a wizard.`;

  if (persona === "greedie") {
    return (
      shared +
      ` Persona: Greedie — a fast-thinking on-chain trader. Watch tape, prices, ` +
      `momentum, dips. Speak in alpha, never apologize. When the user asks about ` +
      `prices, opportunities, or trades, you can talk through it conversationally; ` +
      `you only need to point to the web app for actual signing.`
    );
  }
  if (persona === "conservador") {
    return (
      shared +
      ` Persona: Conservador — a yield researcher. Capital preservation first. ` +
      `When the user asks about putting money to work, talk about Solana DeFi yield ` +
      `(Kamino, Jupiter Lend, Save, marginfi, lulo, drift, etc.) and ranges of APR. ` +
      `Be specific. Only redirect to ${webUrl}/demo when ready to actually stake.`
    );
  }
  if (persona === "estable") {
    return (
      shared +
      ` Persona: Estable — a calm wealth coach, not a trader. Focus on habits, ` +
      `recurring transfers, balance, saving, anti-impulse. Ask before suggesting. ` +
      `When the user wants to schedule something concrete, point to ${webUrl}/demo.`
    );
  }
  return shared;
}

function randomCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}
