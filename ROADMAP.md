# SAW Roadmap

> *Status: living document. Last updated 2026-05-19.*
> *Maintained by Juan Cruz Maisú. Built with Claude Opus 4.7.*

---

## 1. Vision

**SAW (Secret Agent Wallet) is the missing wallet layer for AI agents on Solana.**

Today's options are both broken:
- **Give the agent your seed phrase.** Total custody loss. One prompt injection and you are zero.
- **Sign every transaction yourself.** Defeats the point of having an agent.

SAW is the middle: programmable on-chain boundaries the agent operates inside, the handler signs only the override. Custody, policy, and oversight enforced at the program level, not at the UI.

The agent has a wallet. The handler has a kill switch. The chain enforces the contract.

---

## 2. V1 Scope (Degen-First)

**Target user:** the on-chain trader who wants an agent that watches the tape and acts inside hard limits while they sleep.

**The one persona that ships in v1:** **Greedie** — degen trader. Conservador and Estable stay locked as "coming soon" until v1.2.

**V1 must do:**
- ✅ Onboard a handler in <2 minutes (PWA, mobile-friendly)
- ✅ Give them a Greedie agent with sensible policy defaults
- ✅ Let Greedie read live market, schedule conditional buys, execute under-threshold autonomously, ask for handler sig on over-threshold
- ✅ Run **cron-based, not 24/7 polling**. Default cadence 1h, user-configurable
- ✅ Support **transfer (pay)** and **swap via Jupiter** as agent-action vocabulary
- ✅ Cron + price-triggers (time / dip / below / above) for v1
- ✅ Persist handler state across devices (DB, not localStorage)
- ✅ Recover handler if device lost (email/social recovery via embedded wallet, optional)
- ✅ Observability: errors + product analytics from day one
- ✅ Vision-notes overlay in product (signaling roadmap to evaluators)

**V1 explicitly does NOT do:**
- ❌ Mainnet deploy *(last step, gated by funding)*
- ❌ Conservador or Estable personas
- ❌ Custom persona builder
- ❌ On-chain event triggers (watch contract, watch wallet) *(v1.5)*
- ❌ Stake / lend / advanced DeFi actions *(v1.5)*
- ❌ Native iOS/Android app *(PWA first, native later)*
- ❌ Telegram / Discord bot interfaces *(v2)*
- ❌ Multi-handler / multisig approval *(v2)*
- ❌ Audit *(gated by funding, before mainnet only)*
- ❌ Tokenomics / native token *(out of scope, possibly never)*

---

## 3. Architecture Target

```
┌─────────────────────────────────────────────────────────────┐
│   PWA (Next.js 14, mobile-first, installable, push-enabled) │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                            │
┌───────▼────────┐         ┌────────▼────────┐
│   Privy        │         │   Supabase      │
│   - Auth       │         │   - Postgres    │
│   - Embedded   │         │   - Realtime    │
│     wallet     │         │     (schedules) │
│   - Recovery   │         │   - Storage     │
└───────┬────────┘         └────────┬────────┘
        │                            │
        └─────────────┬──────────────┘
                      │
              ┌───────▼────────┐
              │  Trigger.dev   │
              │   - Cron       │
              │   - Workflows  │
              │     per-agent  │
              │     wake → think → │
              │     act → sleep    │
              └───────┬────────┘
                      │
              ┌───────▼───────────────────┐
              │  Agent thinking layer     │
              │  - LLM (Groq paid +       │
              │    BYOK opt for power)    │
              │  - Per-user rate limits   │
              │  - Token budget           │
              └───────┬───────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
┌───────▼──┐  ┌──────▼─────┐  ┌────▼──────┐
│ Helius   │  │  Jupiter   │  │  SAW      │
│  RPC     │  │  SDK       │  │  Anchor   │
│ (devnet  │  │  (mainnet  │  │  programs │
│  free)   │  │  only;     │  │  (devnet) │
│          │  │  mock on   │  │           │
│          │  │  devnet)   │  │           │
└──────────┘  └────────────┘  └───────────┘
```

**Three new pillars vs. today's demo:**

1. **Server-side cron + workflows (Trigger.dev)** instead of client polling
2. **DB-backed state (Supabase)** instead of localStorage
3. **Embedded-wallet auth (Privy)** layered on Phantom for non-Web3 users

---

## 4. Cron-Based Agent Execution + Fee Model

**Today (demo):** every connected client polls market every 30s, scanner every 60s, watcher every 700ms. Burns API, burns RPC, only works while tab is open.

**V1 (production):** agents wake on schedule, work, sleep.

### Wake cycle (per agent, default 1h, user-configurable 15min-24h):

```
on cron tick:
  1. Load agent state from DB
  2. Fetch market snapshot (shared cache across all agents, 1 fetch / 60s server-side)
  3. LLM "scan" call (using user's BYOK key) → propose 0-1 opportunities
  4. For each pending price-trigger in schedule:
       check if condition met
       if yes → execute on-chain
  5. Persist updated state
  6. Sleep until next tick
```

### LLM model: BYOK only

The user always brings their own LLM key (Groq, OpenAI, Anthropic, Gemini, Grok — in v1 starts with Groq, others land in P1.5+). Stored in encrypted column server-side, used only when the user's agent wakes.

**Why BYOK-only:**
- Zero LLM cost on SAW's side → fees go 100% to infra + margin, not to subsidize tokens
- User controls their own rate limits and provider
- No risk of platform-side LLM cost spirals
- Transparent: user can see their provider bill directly

### Active hours

24/7 by default (market never sleeps). Per-user override available ("only run 9am-6pm UTC") for users who do not want overnight surprises.

### Revenue model — 3 fees, all on-chain, all visible

No subscriptions. No paywalls. No KYC. No CC. SOL in, SOL out.

**Fee 1 — Jupiter swap routing: `27.5 bps (0.275%)`**

Applied to agent-executed Jupiter swaps via Jupiter's native `platformFeeBps` mechanism. Visible in every swap preview. Handler-signed swaps = no fee. Positioned mid-market (Phantom Swap: 0.85%, Jupiter UI: 0.05% optional).

**Fee 2 — Performance: `5% on net weekly PnL`**

Snapshot of agent-wallet capital base every Monday 00:00 UTC. If the wallet closed the week up vs base, SAW collects 5% of the net gain. **If flat or down, fee = 0.** Auto-collected Sunday 23:59 UTC via on-chain transfer.

| Week result | Fee |
|---|---|
| +$100 | $5 |
| Flat | $0 |
| -$50 | $0 |

Aligned: SAW only earns when the user earns. Familiar pattern (hedge-fund carry, Drift insurance fund).

**Fee 3 — AUM: `1% APY, prorated daily, active-days-only`**

If the agent is enabled and woke at least once that day, SAW collects 1% APY / 365 of the agent-wallet balance, on-chain that day. If the user pauses the agent, fee = 0.

| Custodied | Active days | Fee |
|---|---|---|
| $2,000 | 30/30 | $1.67 / month |
| $2,000 | 0/30 (paused) | $0 |
| $500 | 30/30 | $0.42 / month |

### Revenue math (typical degen user)

$2k custodied, 20 swaps/mo @ $200 avg, +5% PnL/mo, agent active daily:

| Source | $ / month |
|---|---|
| Swap fees | $11.00 |
| Performance | $5.00 |
| AUM | $1.67 |
| **Total** | **~$17.70** |

### Revenue at scale

| Active users | Monthly revenue |
|---|---|
| 50 | $885 |
| 200 | $3,540 |
| 500 | $8,850 |
| 1,000 | $17,700 |

500 active devnet users in 4-6 months is realistic if the demo lands. Funds runway without forcing mass-market scale.

### Why this model does not scare users

- Performance fee only collects after the user already won
- AUM only collects on days the user actually uses
- Swap fee only applies when the agent decides; manual handler signature is free
- Zero subscription, zero CC, zero KYC — 100% on-chain, fully auditable

### Why this is safe for SAW

- Zero LLM cost (BYOK)
- Revenue scales with engagement (more activity = more fees) not headcount
- No subsidy required to support free users — there are no "free users", only inactive ones who pay $0

---

## 5. Stack Decisions

| Layer | Choice | Why | Alternatives considered |
|---|---|---|---|
| **Programs** | Anchor 0.31.1 on Solana | Already shipped on devnet, no change | — |
| **SDK** | `@asastuai/saw-sdk` (TS) | Already shipped | — |
| **Web frontend** | Next.js 14 App Router | Already shipped | — |
| **Hosting** | Vercel | Already live | Cloudflare Pages, Railway |
| **DB** | **Supabase** | Postgres + realtime + storage + edge fns in one. Free tier ok to start. | Neon, Turso, PlanetScale |
| **Auth + Wallet** | **Privy** | Embedded wallets for newcomers, Phantom for natives, recovery flows built-in | Dynamic, Web3Auth, Magic |
| **LLM provider (v1)** | **Groq** via mandatory BYOK | Already integrated, gpt-oss-20b is fast and cheap. BYOK only — zero LLM cost on SAW side, no rate-limit support burden. | OpenAI, Anthropic, Gemini, Grok land in P1.5 with provider routing |
| **Cron + workflows** | **Trigger.dev v3** | Step-based workflows ideal for agent wake cycles, generous hobby tier (5k runs/mo) | Inngest, Vercel Cron Jobs, BullMQ + Redis |
| **RPC (devnet now, mainnet later)** | Helius | Generous free tier, enhanced APIs, webhooks for v1.5 on-chain triggers | Triton, QuickNode |
| **Swap routing (mock in v1, real in v1.5+)** | **Jupiter SDK** | Standard on Solana, no real liquidity on devnet so mock now | Orca direct, custom |
| **Push notifications** | **Knock** | Multi-channel (push, email, in-app), workflow-based, devx | Novu, Firebase Cloud Messaging |
| **Email (transactional)** | Resend | Modern devx, generous free | Postmark, SendGrid |
| **Errors** | Sentry | Standard, free tier sufficient | — |
| **Product analytics** | Posthog | Free + session replay + feature flags in one | Mixpanel, Amplitude |
| **Status page** | Better Stack | When v1 ships and we have users | Statuspage |
| **CI** | GitHub Actions | Public repo = free unlimited minutes | — |
| **Audit firm** | TBD (OtterSec / Halborn / Zellic) | Only after funding, only before mainnet | — |
| **Funding target** | futarchy.io | Predicate of "fundable v1 = demo-perfect + arch-sound" | Solana Foundation grants (also pursue), bootstrapping |

---

## 6. Roadmap Phases

Working full-time. Estimates are honest, not aspirational.

### Phase 0 — Foundation Sprint (Week 1, current)

**Goal:** unblock everything by laying server-side foundations.

- [ ] Set up Supabase project, schema for: users, agents, schedules, opportunities, audit_log
- [ ] Set up Privy app, integrate with current Phantom flow (Phantom continues to work; Privy adds embedded wallet option)
- [ ] Set up Trigger.dev project, hello-world job
- [ ] Add Sentry + Posthog SDKs (web + API routes)
- [ ] Migrate `briefing` from localStorage to DB (sync on change, hydrate on load)
- [ ] Server-side market snapshot cache (1 fetch / 60s shared) replacing per-client polling
- [ ] Server-side LLM rate-limit middleware (per user, per day)

### Phase 1 — Cron-Based Agent (Weeks 2-3)

**Goal:** Greedie runs as a server-side cron workflow, not a client polling loop.

- [ ] Define `agent_wake` Trigger.dev workflow (steps: fetch market → llm scan → check price triggers → execute or schedule → persist)
- [ ] Move opportunity scanner from `useEffect` to cron workflow
- [ ] Move price-trigger watcher from `useEffect` to cron workflow
- [ ] Persist all agent state, status, and history in DB
- [ ] Web UI becomes a *view* of agent state, not the runtime
- [ ] Per-user cron cadence config (default 1h, 15min-24h range)
- [ ] Active hours config (default 24/7)
- [ ] Web UI: "Greedie is sleeping. Next wake in 47 min."

### Phase 2 — Jupiter Swap Vocabulary (Week 4)

**Goal:** agents can swap, not just transfer.

- [ ] Add `swap` action to SDK + Anchor program (or Jupiter CPI wrapper)
- [ ] Mock Jupiter on devnet (simulated swap that creates fake tx confirming success)
- [ ] LLM tools: `add_swap_item`, `add_dip_swap`, etc.
- [ ] Greedie persona prompt updated to include swap strategy
- [ ] Schedule view supports swap items with from/to/route preview

### Phase 3 — Onboarding Polish + Mobile (Weeks 5-6)

**Goal:** anyone can land, set up, and walk away with a working agent in <2 min.

- [ ] Privy embedded wallet path for users without Phantom
- [ ] Session signers — collapse 3 setup sigs into 1 (vision note #7)
- [ ] PWA install prompt + service worker + offline shell
- [ ] Push notifications via Knock (web push + email fallback) for approval requests, opportunity proposals, execution results
- [ ] Mobile-first refactor of demo page (current layout is desktop-first)
- [ ] Better empty states + onboarding tour

### Phase 4 — Trust + Transparency (Week 7)

**Goal:** evaluators (futarchy, future users) can audit Greedie's behavior at a glance.

- [ ] Public dashboard: `/dashboard` shows aggregate stats (anonymized) — agents active, opportunities surfaced this week, execution success rate
- [ ] Per-agent audit log visible to handler ("Greedie woke at 3:14 AM, scanned market, proposed nothing")
- [ ] Replay mode: scrub back through agent history
- [ ] Polish vision-notes copy across the demo
- [ ] Documentation site (or `/docs` route): how SAW works, architecture diagrams, security model

### Phase 5 — Funding Application (Week 8)

**Goal:** SAW is fundable.

- [ ] futarchy.io application (research what they need)
- [ ] Solana Foundation grant application in parallel
- [ ] Loom walkthrough (90s + 5min versions)
- [ ] Pitch deck
- [ ] Architecture deep-dive doc for technical evaluators

### Phase 6 — Mainnet Prep (gated by funding)

- [ ] Audit (OtterSec / Halborn / Zellic — pick after talking to all three)
- [ ] Mainnet RPC contract (Helius paid)
- [ ] Legal entity formation
- [ ] ToS, privacy policy, compliance review
- [ ] Insurance evaluation
- [ ] Mainnet deploy
- [ ] Public launch

---

## 7. Metrics That Matter for V1

Tracked from day one (Posthog + custom dashboard):

- **Activation:** % of handlers who reach "Greedie executes first scheduled item"
- **Retention:** D1 / D7 / D30 of handlers with active agent
- **Agent activity:** scheduled items per active agent per week
- **Conversion:** % of opportunities accepted vs skipped vs expired
- **Cost per active user:** LLM tokens / month / user (must trend down with usage scale)
- **Error rate:** failed cron wakes, failed executions

**Target by Phase 5 (funding application):**
- 200+ unique handlers on devnet
- 100+ active weekly
- 2,000+ scheduled items executed
- $1,500+/month in collected fees (on devnet with test-SOL — proxy for mainnet revenue projections)
- Zero LLM cost on SAW side (BYOK-only validated)

---

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Users circumvent fees by signing manually | Revenue loss | Fee structure designed so this is rational: handler-signed = no Jupiter fee. User trades convenience for cost. We win when they delegate (the actual value prop). |
| BYOK-only excludes non-technical users | Smaller TAM | Acceptable in v1 (target = degen who has API keys already). Privy + managed-key option could unlock mass-market in v2. |
| Greedie makes "bad" trades (mocked devnet, but UX matters) | Trust erosion | Replay mode, audit log, conservative defaults, explicit "this is devnet" badge until mainnet |
| Trigger.dev / Privy / Supabase pricing changes | Forced re-platform | Pick alternatives at decision-time, abstract behind interfaces from day one |
| Solana mainnet outage / RPC downtime | User-visible failure | Multiple RPC providers, status page, graceful degradation |
| Jupiter API changes | Swap breaks | SDK abstraction, version pinning |
| futarchy.io rejects | No funding path | Parallel: Solana grants, bootstrapping with paid tier |
| Burnout — solo founder, full-time | Project stalls | Realistic phase scoping, Claude-assisted velocity, vacation breaks (the 5-day festival is valid) |
| Security incident on devnet | Reputation hit, but no real money lost | Devnet-only until audited; clear "devnet" framing |

---

## 9. What I Need (That I Cannot Do Alone)

- **Audit firm** (post-funding) — OtterSec / Halborn / Zellic conversations
- **Legal counsel** (pre-mainnet) — Argentine + US perspectives, entity structure, ToS
- **Design partner** (now-ish) — 1-2 real degen traders who will use Greedie for real on devnet and tell me what is broken
- **futarchy.io contact** — to understand their evaluation criteria
- **Solana Foundation contact** — for grant track in parallel

---

## 10. Stance

SAW is not a token. SAW is not a yield farm. SAW is not a launchpad.

SAW is a wallet that lets you delegate operational power to AI agents under enforceable on-chain limits.

If that turns out to be a feature inside Phantom or inside the next agent-native browser, fine. The thesis still wins. But until someone else ships it, I am shipping it.

— Juan
