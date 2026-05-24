# X / Twitter thread — SAW v1.3 announce

Copy-paste each tweet as-is. Numbers count chars (X limit = 280 per tweet for unverified, 25k+ for verified).

---

## Thread (7 tweets)

### 1/7 (hook)

```
the agent wallet stack everyone is missing on solana, shipped.

SAW — Secret Agent Wallet.

your AI agent gets a programmable wallet with on-chain policy.
it acts inside hard limits.
you hold the override.

zero seed-phrase sharing.
zero sign-every-tx fatigue.

→ saw-gilt.vercel.app
```

### 2/7 (the problem)

```
today you have two options:

(a) give the agent your seed → one prompt injection and you're zero.
(b) sign every tx yourself → defeats the point of having an agent.

SAW is the missing layer between.
on-chain policy enforcement.
the agent acts under the cap, you sign the override.
```

### 3/7 (v1.3 stack — screenshot of /demo briefing room)

```
v1.3 ships with:

• one Operative per handler. trade, yield, savings — same agent.
• rename it from settings (your codename, your rules)
• one Phantom signature for the entire on-chain setup
• 8 LLM providers (BYOK) OR 0.01 SOL = 500 calls (no key needed)
• telegram bridge in one click
• cron wakes silent by default — agent costs zero until you chat
```

### 4/7 (security — show audit doc)

```
shipped a 14-bug audit pass before the public push:

• JWT signature verification (was missing!)
• wallet hijacking via /api/handler/me (claim victim's primary wallet)
• 2 IDOR fixes (item + opportunity mutation across handlers)
• topup front-running (signer check)
• 4 anchor-program hardenings

zero CRITICAL / HIGH / MEDIUM open.
```

### 5/7 (fee model — screenshot of /treasury)

```
fees, all on-chain, no subscriptions:

• 55 bps on agent-executed swaps (vs Phantom Swap's 85)
• 5% on net weekly PnL — only when the agent makes money
• 1% APY AUM on active days — pause = pay zero
• 100x+ margin on pay-with-crypto LLM calls (Gemini Flash-Lite under)

every fee verifiable: saw-gilt.vercel.app/treasury
```

### 6/7 (the build — screenshot of /dashboard)

```
built solo on devnet.
3 anchor programs, TS SDK, next.js demo, Supabase + RLS, Privy auth, cron-job.org wakes, Sentry, PostHog, grammy telegram bot.
all open source: github.com/asastuai/S.A.W

every handler, every wake, every fee, every credit — public:
saw-gilt.vercel.app/dashboard
```

### 7/7 (the ask)

```
looking for:
• design partners (devnet, tell me what's broken)
• audit firm intros (OtterSec / Halborn / Zellic conversations)
• anyone building agent infra on solana

DMs open.

— Juan Cruz Maisú ♥
```

---

## Screenshots needed (you take, on your machine)

1. **For tweet 3:** demo page mid-flow, the Operative briefing room with a yield proposal queued ("kamino-lend · USDC · 18.4%" or similar live DefiLlama pick). Codename can be the default "Operative" or a custom one — your call. Hard-refresh the demo so you don't have any leftover state from old testing.

2. **For tweet 4:** /docs/security-audit-v1.3.md scrolled to the summary table (3 CRITICAL / 6 HIGH / 4 MEDIUM all fixed). Use a code-block screenshot tool so the table renders crisply.

3. **For tweet 5:** /treasury page showing the address + a recent topup tx in the activity list.

4. **For tweet 6:** /dashboard page showing real numbers (handlers, active operatives, credits sold). Even small numbers are fine — shows the data is real.

5. **Optional cover image:** mascot of the Operative at 180px with the gold theme.

Take 5 screenshots → drop them on the X compose UI in the order above.

---

## Tone check

✓ no em-dashes
✓ first-person possessive ("my", "I", "the agent the handler holds")
✓ compression
✓ Benedetti line breaks (each line a breath)
✓ signature on closing tweet

If you want a softer hook for tweet 1, swap it for:

```
spent the month building the wallet layer agents have been missing.

SAW — programmable on-chain custody for AI agents on Solana.
one operative. trade, yield, savings. on-chain policy as the floor.

zero seed phrases. zero sign-every-tx.

live: saw-gilt.vercel.app
```

---

## Tone variant: "security-first" hook (better for builders / auditors)

```
shipped the wallet layer your agent needs before it touches mainnet.

SAW: programmable on-chain custody for AI agents on solana.

just closed a 14-bug audit — 3 CRITICAL, 6 HIGH, 4 MEDIUM — before
the public push. zero open in those brackets.

→ saw-gilt.vercel.app
→ docs/security-audit-v1.3.md (full report)
```
