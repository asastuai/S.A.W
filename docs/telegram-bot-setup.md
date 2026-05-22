# Telegram bot setup

The TG bot scaffold is done. To activate, you need to:

## 1. Create the bot (2 min)

1. Open Telegram → search **@BotFather**
2. Send `/newbot`
3. Pick a name (e.g. `SAW Agent`) and a username (must end in `bot`, e.g. `sawagentbot` or `saw_devnet_bot`)
4. BotFather replies with the bot token: `123456789:ABC-DEF1234ghIklZyx57W2v1u123ew11`
5. Save that token — you'll paste it to me

Optionally customize (also via BotFather):
- `/setdescription` — "I'm your SAW agent. Talk to me about trades, yields, plans."
- `/setabouttext` — "Personal AI agent on Solana"
- `/setuserpic` — upload an image
- `/setcommands` — paste:
  ```
  start - Connect this chat to your handler
  status - Show your linked handler + agents
  ```

## 2. Generate a webhook secret (10 sec)

```
openssl rand -hex 32
```

Save the output. We'll use it as `TELEGRAM_WEBHOOK_SECRET` so only Telegram can hit our endpoint.

## 3. Paste both to me

I'll add them to `.env.local` + Vercel + register the webhook with Telegram.

## 4. Then I run

```
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://saw-gilt.vercel.app/api/telegram/webhook&secret_token=<SECRET>"
```

That tells Telegram to POST every message to our endpoint.

## 5. Smoke test

After webhook is set:
1. Open your bot in Telegram, send `/start`
2. Bot replies with a pair link → `saw-gilt.vercel.app/connect/telegram?code=XXXX`
3. Click → sign in Privy → confirm link
4. Back in TG, send `/status` — should show your linked handler + agents
5. Send a message — bot routes through your default agent's LLM and replies

## Architecture summary

- TG message → `/api/telegram/webhook` → grammy handler in `lib/telegram.ts`
- For chat messages: looks up handler by chat_id, finds their first agent, decrypts BYOK key, calls the provider adapter, replies in TG
- Chat history is persisted in `chat_messages` so the web sees what was said in TG and vice versa
- **No on-chain execution from TG** in v1 — bot is chat-only because the agent keypair lives in browser localStorage. For actions, bot tells the user to open the web

## Limits + costs

- Telegram bot: free, unlimited
- Each chat message hits your BYOK LLM provider → counts against your quota
- Vercel serverless function cold start ~1-2s on first TG message, then warm
- Webhook secret check rejects unauthenticated calls — safe to leave public

## v1.3 future

- On-chain dispatch from TG when we have Privy delegated signing or server-side agent keypair storage
- Push notifications via TG for approval requests
- Multi-agent switching: `/switch greedie`
- Recipe shortcuts: `/swap 0.05 SOL USDC now`
