# Telegram bot — onboarding flow

## How it looks to a user (this is the point)

1. User signs in to /demo, picks a persona, completes setup
2. In the header next to settings: button **`📱 connect telegram`**
3. Click → web requests a one-time pair code from server → opens
   `https://t.me/<saw_bot>?start=<code>` in a new tab
4. Telegram launches the bot conversation; bot receives `/start <code>`
5. Bot looks up the code (already pre-bound to this handler), creates
   the permanent telegram_links row, replies **"✓ Linked. Mandame lo que quieras."**
6. User chats normally. No paste, no manual code, no second login.

Total clicks for the user: **1** (the button in the header).

## What Juan does — ONE TIME, for the whole platform

The bot is platform-wide. Every user shares it. You only set it up once.

### Step 1: BotFather (2 min)

1. In Telegram → search **@BotFather**
2. `/newbot` → name (e.g. `SAW Agent`) → username (must end in `bot`, e.g. `saw_agent_bot`)
3. Save the token: `1234567:ABC-DEF…`
4. Optionally: `/setdescription`, `/setabouttext`, `/setuserpic`
5. Optionally: `/setcommands` and paste:
   ```
   start - Begin or re-link
   status - Show linked handler + agents
   ```

### Step 2: Generate a webhook secret (10 sec)

Run on your machine:

```
openssl rand -hex 32
```

Save the output.

### Step 3: Tell me

Paste in one message:

```
TELEGRAM_BOT_TOKEN=<the_botfather_token>
TELEGRAM_WEBHOOK_SECRET=<the_openssl_output>
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=saw_agent_bot
```

(Replace `saw_agent_bot` with whatever username you actually picked.)

### Step 4: I run the activation

I will:

1. Add the 3 env vars to `.env.local` + Vercel production env
2. Push migration `0005_telegram_handler_initiated.sql` for Supabase
3. Register the webhook with Telegram via:

```
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://saw-gilt.vercel.app/api/telegram/webhook&secret_token=<SECRET>"
```

4. Smoke test from my own TG account.

## Architecture (1-paragraph)

`POST /api/telegram/init-pair` (handler-authed) writes a pair code with
`handler_id` to `telegram_pair_codes`, returns a deep link. User clicks,
Telegram opens, bot receives `/start <code>` in `lib/telegram.ts`. Bot
looks up the code, confirms it's not expired or consumed, upserts a
`telegram_links` row binding `chat_id → handler_id`, consumes the code.
Subsequent text messages from that chat hit `bot.on("message:text")`,
load the handler's first agent, decrypt the BYOK key, call the provider
adapter, and reply with the LLM's text.

## v1 limits

- Bot is chat-only. On-chain execution still needs the browser session
  because the agent keypair lives in browser localStorage. The bot will
  nudge the user toward the web for swaps / approvals.
- One handler can link N chats (mobile + desktop both work).
- One chat is bound to one handler (last wins on re-pair).
- 15 minute TTL on pair codes.

## v1.3 future

- On-chain dispatch from TG (requires server-side agent keypair via
  Privy delegated signing or encrypted storage)
- TG push notifications for approval requests
- `/swap`, `/yield`, `/status` shortcut commands
- Multi-agent switching: `/switch greedie`
