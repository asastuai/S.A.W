# Loom script — SAW v1.2 walkthrough

Two versions. Both written to be read aloud in your voice — no edits needed.

---

## 90-second version (best for X / Yash DM / cold reach)

**Setup before record:**
- Tab 1: `saw-gilt.vercel.app` landing
- Tab 2: `saw-gilt.vercel.app/demo` in incognito (signed out)
- Tab 3: `saw-gilt.vercel.app/dashboard`
- Tab 4: `saw-gilt.vercel.app/treasury`

---

**[0:00 — Tab 1, landing]**

> Quick walkthrough of SAW.
> Secret Agent Wallet on Solana. The missing wallet layer for AI agents.
>
> Today you either give your agent your seed phrase — and lose everything to one prompt injection — or you sign every transaction yourself, which defeats the point of having an agent.
>
> SAW is the layer in between. Programmable on-chain limits the agent operates inside. The handler signs only the override.

**[0:20 — click "Run the dossier", Tab 2 demo]**

> Here's the demo. I sign in with Phantom — one click. The agent picks me up.
>
> I bring my own LLM key. Today I support eight providers — Groq, Gemini, DeepSeek, Grok, OpenAI, Claude, Cerebras, Kimi. Auto-detected from the key prefix. SAW pays zero LLM cost.

**[0:35 — pick Greedie + 3 sigs glossed over]**

> I pick Greedie, a degen trader persona. Three signatures, one-time setup. Done.

**[0:45 — show the briefing room with the badges]**

> Notice the badges up top: sleeping mode by default — the agent costs me nothing until I chat. When I'm ready, I toggle auto-wake and pick a cadence.
>
> I tell Greedie: swap zero-point-zero-five SOL for USDC if it dips one percent.
>
> Greedie pulls live market, decides a strategy, schedules the swap, waits for the trigger. When it fires, it executes — autonomously — under my on-chain policy.

**[1:10 — switch to Tab 4 treasury]**

> Every swap pays a fifty-five-basis-point fee. Cheaper than Phantom Swap, more expensive than Jupiter UI. Sits in the middle.
>
> Treasury is fully public. Live address. Every fee landing here is verifiable in any explorer.

**[1:20 — switch to Tab 3 dashboard]**

> Public dashboard pulls from Supabase. Handlers, active agents, wakes, executions, fees. Updates every minute. Anonymized.

**[1:30 — close]**

> Repo's at github.com/asastuai/S.A.W. Devnet today, mainnet after audit.
>
> I built this solo. Looking for feedback, design partners, or anyone building agent infra on Solana.

---

## 5-minute version (best for futarchy / Solana Foundation / serious evaluators)

Same opening, but slow down on:

1. **Architecture deep-dive (1 min)**: three Anchor programs (agent_wallet, policy_registry, approval_queue). Open `docs/architecture.md` and walk the mermaid diagram. Mention RLS at every table, Privy JWT bridge, Trigger.dev cron alternative via cron-job.org.

2. **Fee model (1 min)**: open `docs/fee-model.md`. Explain why 55 bps + 5% performance + 1% AUM. Walk the math: 500 active users = ~$14k/month revenue. Show the dashboard live numbers.

3. **Sign-in + new-agent flow (1 min)**: actually do the 3-sig setup live. Show that the agent gets its own Solana keypair + 0.05 SOL for gas.

4. **Show an actual on-chain swap firing live (1 min)**: ask Greedie "swap right now", wait the few seconds, click the explorer link on the executed item, point at the real signature. "This is on devnet but mainnet is a config flag."

5. **Close + the ask (30 sec)**: "Looking for [audit referrals / design partners / co-founders / specific feedback]."

---

## Recording tips

- Record at 1.5x screen scale so text is readable on phones
- Use Loom's "intro slide" feature with your name/handle
- Re-record only segments that break flow (don't try to do one take)
- Export at 1080p
- Loom auto-transcribes — fix typos in the auto-transcript before sharing
