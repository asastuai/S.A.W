# X / Twitter thread — SAW v1.2 announce

Copy-paste each tweet as-is. Numbers count chars (X limit = 280 per tweet for unverified, 25k+ for verified).

---

## Thread (6 tweets)

### 1/6 (hook)

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

### 2/6 (the problem)

```
today you have two options:

(a) give the agent your seed → one prompt injection and you're zero.
(b) sign every tx yourself → defeats the point of having an agent.

SAW is the missing layer in between. on-chain policy enforcement.
the agent decides under the cap, you sign the override.
```

### 3/6 (the stack, with screenshot of /demo)

```
v1.2 ships with:

• 8 LLM providers (BYOK, auto-detected by key prefix)
• 2 personas: Greedie (degen trader), Conservador (yield researcher)
• cron-based wakes — silent by default so free-tier keys last
• real on-chain SOL transfer per swap on devnet, visible in explorer
• live public dashboard + treasury page
```

### 4/6 (the fee model, with screenshot of /treasury)

```
fees, all on-chain, no subscriptions:

• 55 bps on agent-executed Jupiter swaps (vs Phantom's 85)
• 5% on net weekly PnL — only when the agent makes you money
• 1% APY AUM on active days — pause = pay zero

every fee verifiable here: saw-gilt.vercel.app/treasury
```

### 5/6 (the build, with screenshot of /dashboard)

```
built solo this week.
3 anchor programs, TS SDK, next.js demo, Supabase, Privy, Trigger via cron-job.org, Sentry, PostHog.
all open source: github.com/asastuai/S.A.W

devnet today. mainnet after audit.

every wake, every fee, every approval — public:
saw-gilt.vercel.app/dashboard
```

### 6/6 (the ask)

```
looking for:
• degen design partners (try it on devnet, tell me what's broken)
• audit firm intros (OtterSec / Halborn / Zellic conversations)
• anyone building agent infra on solana

DMs open.

— Juan Cruz Maisú ♥
```

---

## Screenshots needed (you take, on your machine)

1. **For tweet 3:** demo page mid-flow, showing the briefing room with Greedie mascot + chat + a schedule item visible. Hide the sleep badge if it's set to silent — make sure auto-wake is on for the shot.

2. **For tweet 4:** /treasury page showing the treasury address + a recent on-chain tx in the list.

3. **For tweet 5:** /dashboard page showing real numbers (handlers, active agents, wakes 7d, etc.). Even small numbers are fine — shows the data is real.

4. **Optional cover image:** mascot of Greedie at 180px with the gold theme. Already exists in the demo header.

Take 4 screenshots → drop them on the X compose UI in the order above.

---

## Tone check

✓ no em-dashes
✓ first-person possessive ("my", "I", "the agent the handler holds")
✓ compression
✓ Benedetti line breaks (each line a breath)
✓ signature on closing tweet

If you want a softer hook for tweet 1, swap it for:

```
spent the week building the wallet layer agents have been missing.

SAW — programmable on-chain custody for AI agents on Solana.
the agent transacts under your limits. you sign the override.

zero seed phrases. zero sign-every-tx.

live: saw-gilt.vercel.app
```
