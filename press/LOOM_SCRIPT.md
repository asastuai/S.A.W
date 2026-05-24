# Loom script — SAW v1.3 walkthrough

Two versions. Both written to be read aloud in your voice — no edits needed.

---

## 90-second version (best for X / Yash DM / cold reach)

**Setup before record:**
- Tab 1: `saw-gilt.vercel.app` landing
- Tab 2: `saw-gilt.vercel.app/demo` in incognito (signed out)
- Tab 3: `saw-gilt.vercel.app/dashboard`
- Tab 4: `saw-gilt.vercel.app/treasury`
- Tab 5: Telegram open at `@Secretagentwallet_bot`

---

**[0:00 — Tab 1, landing]**

> Quick walk-through of SAW.
> Secret Agent Wallet on Solana. One operative, full spectrum.
>
> Today you either give your agent your seed phrase — and lose everything to one prompt injection — or you sign every transaction yourself, which kills the point of having an agent.
>
> SAW is the layer in between. Programmable on-chain limits the agent operates inside. You sign only the override.

**[0:18 — click "Run the dossier", Tab 2 demo]**

> Here's the demo. I sign in with Phantom — one click. The agent picks me up.
>
> You'll notice: I never had to pick an agent type, never had to pick a model, never had to paste an API key. The setup just runs.

**[0:30 — single Phantom signature for atomic setup]**

> One signature. Behind the scenes that one tx mints my devnet USDC, creates my agent wallet, sets up the on-chain policy and approval queue, and funds the agent's keypair with gas. Done.

**[0:40 — briefing room]**

> I'm now talking to my Operative. You can rename it — Lobo, Cipher, whatever. Default is just "Operative."
>
> One conversation, three skills: it can read the tape and propose swaps, it can pull live yields from DefiLlama, and it can help me build saving habits. No specialist hand-off, no switching personas.

**[1:00 — I say: "poneme 100 USDC en el mejor APR de Solana"]**

> Watch this. I tell the Operative — in plain Spanish — "put 100 USDC into the best Solana APR you can find."
>
> It calls DefiLlama live, picks the top three pools by APR, and schedules the swap. Right side of the screen. Waiting for me to sign on-chain.

**[1:20 — Tab 5, Telegram]**

> Same operative, on my phone. I paired Telegram in one click from the header.
>
> "How much do I have to put in?" — answers me with my actual balance. Same memory, same codename, same policy. From anywhere.

**[1:35 — close]**

> Pay-with-crypto if you don't want to bring your own LLM key — 0.01 SOL gets you 500 calls. Or use Groq's free tier. Your choice.
>
> Repo: github.com/asastuai/S.A.W. Devnet today, mainnet after audit.
>
> Built solo. Looking for design partners or anyone building agent infra on Solana.

---

## 5-minute version (best for futarchy / Solana Foundation / serious evaluators)

Same opening, but slow down on:

1. **Architecture (1 min)**: three Anchor programs (agent_wallet, policy_registry, approval_queue). Open `docs/architecture.md` and walk the mermaid diagram. Mention RLS at every Supabase table, Privy JWT verification against the live JWKS, the cron polling cron-job.org against `/api/cron/wake-due-agents` with a Bearer secret.

2. **Security posture (1 min)**: open `docs/security-audit-v1.3.md`. Show: 3 CRITICAL + 6 HIGH + 4 MEDIUM closed in the v1.3 audit. Walk one fix — pick the JWT verification swap from "no signature check" to `jose.jwtVerify` against Privy's JWKS. "This shipped before anyone outside the team saw the repo."

3. **Fee model (1 min)**: open `docs/fee-model.md`. Explain why 55 bps swap + 5% performance + 1% AUM + the SAW-credits margin (0.01 SOL = 500 LLM calls at ~95% margin). Show the dashboard live numbers.

4. **The actual one-shot setup (30 sec)**: from incognito, sign in, connect Phantom, single signature. Land in the briefing chat. "Compare this to MetaMask Snaps or generic delegated keys — they're either kernel-level or session-wide. SAW gives you on-chain policy with one transaction."

5. **Show a real on-chain swap firing live (1 min)**: ask Operative "swap right now", wait the few seconds, click the explorer link on the executed item, point at the real signature. "Devnet today; mainnet is a config flag plus an external audit."

6. **Close + the ask (30 sec)**: "Looking for [audit referrals / design partners / co-founders / specific feedback]."

---

## Recording tips

- Record at 1.5x screen scale so text is readable on phones
- Use Loom's "intro slide" feature with your name/handle
- Re-record only segments that break flow (don't try to do one take)
- Export at 1080p
- Loom auto-transcribes — fix typos in the auto-transcript before sharing
- Before hitting record, hard-refresh + Ctrl-Shift-Delete the demo tab so the localStorage is empty — the auto-bootstrap flow is the wow moment, don't ruin it with a half-restored session
