# SAW Architecture

## System diagram

```mermaid
flowchart TB
  subgraph Browser["Browser / PWA"]
    UI["Next.js 14 App"]
    Mascot["Mascot + Chat UI"]
    UI --- Mascot
  end

  subgraph Auth["Auth + Wallet"]
    Privy["Privy<br/>(email / social / wallet)"]
    Phantom["Phantom external<br/>(Solana wallet adapter)"]
  end

  UI -->|"login / sign"| Privy
  UI -->|"sign tx"| Phantom

  subgraph Edge["Vercel Edge / Functions"]
    APIs["/api/agent/chat<br/>/api/agent/scan<br/>/api/market/snapshot<br/>/api/handler/me<br/>/api/byok<br/>/api/agents/*"]
    MarketCache["Server-side market cache<br/>(60s TTL, shared)"]
    RateLimit["LLM rate-limit middleware"]
    APIs --- MarketCache
    APIs --- RateLimit
  end

  UI -->|"REST"| APIs

  subgraph DB["Supabase (Postgres + Auth bridge)"]
    Handlers[handlers]
    ByokKeys[byok_keys<br/>AES-GCM]
    Agents[agents]
    Schedule[scheduled_items]
    Opps[opportunities]
    Chats[chat_messages]
    Wakes[agent_wakes]
    Usage[llm_usage]
    Fees[fee_ledger]
  end

  APIs --> DB
  Privy -. "JWT" .-> DB

  subgraph Worker["Trigger.dev workers"]
    AgentWake["agent-wake<br/>(per-agent cron)"]
    PerfFee["weekly-performance-fee<br/>(Sun 23:59 UTC)"]
    AumFee["daily-aum-fee<br/>(daily 23:55 UTC)"]
  end

  AgentWake --> DB
  PerfFee --> DB
  AumFee --> DB

  subgraph LLM["LLM Providers (BYOK only)"]
    Groq["Groq (v1)"]
    OAI["OpenAI"]
    ANT["Anthropic"]
    GMI["Gemini"]
    GRK["Grok"]
  end

  AgentWake -->|"decrypt BYOK"| LLM
  APIs -->|"decrypt BYOK"| LLM

  subgraph Chain["Solana devnet (v1) / mainnet (post-funding)"]
    AW["agent_wallet program"]
    PR["policy_registry program"]
    AQ["approval_queue program"]
    Jup["Jupiter aggregator"]
    Treasury["SAW treasury wallet"]
  end

  Worker --> AW
  Worker --> AQ
  UI --> AW
  UI --> AQ
  AgentWake --> Jup
  Jup -->|"55 bps platformFee"| Treasury
  PerfFee -->|"5% of weekly PnL"| Treasury
  AumFee -->|"1% APY / day"| Treasury

  subgraph Obs["Observability"]
    Sentry["Sentry (errors)"]
    Posthog["PostHog (analytics + replay)"]
  end
  UI --- Obs
  APIs --- Obs
  Worker --- Obs
```

## Module map

```
saw/
├── programs/                    Anchor on-chain code (Rust)
│   ├── agent_wallet/
│   ├── policy_registry/
│   └── approval_queue/
├── sdk/                         @asastuai/saw-sdk (TypeScript)
│   ├── client.ts                SawClient
│   ├── wallet-handle.ts         WalletHandle
│   ├── policy.ts                Policy helpers
│   └── pdas.ts                  PDA derivations
├── web/                         @asastuai/saw-web (Next.js 14)
│   ├── app/
│   │   ├── api/
│   │   │   ├── agent/{chat,scan,wake}/route.ts
│   │   │   ├── byok/route.ts
│   │   │   ├── handler/me/route.ts
│   │   │   └── market/snapshot/route.ts
│   │   ├── demo/page.tsx
│   │   ├── dashboard/page.tsx          [P4]
│   │   └── layout.tsx
│   ├── components/
│   │   ├── privy-provider.tsx
│   │   ├── mascot.tsx
│   │   ├── chat.tsx
│   │   ├── schedule-view.tsx
│   │   ├── opportunity-reel.tsx
│   │   ├── api-key-modal.tsx
│   │   ├── creator-note.tsx
│   │   └── error-boundary.tsx
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── byok-crypto.ts
│   │   ├── fees.ts
│   │   ├── treasury.ts
│   │   ├── jupiter.ts
│   │   ├── posthog.ts
│   │   ├── db/
│   │   │   ├── types.ts
│   │   │   ├── handlers.ts
│   │   │   ├── agents.ts
│   │   │   ├── schedule.ts
│   │   │   ├── opportunities.ts
│   │   │   ├── chat.ts
│   │   │   ├── byok.ts
│   │   │   ├── fees.ts
│   │   │   └── llm.ts
│   │   └── providers/
│   │       ├── types.ts
│   │       ├── groq.ts
│   │       └── index.ts          (registry)
│   └── sentry.{client,server,edge}.config.ts
├── worker/                      @asastuai/saw-worker (Trigger.dev)
│   ├── trigger.config.ts
│   └── src/
│       ├── jobs/
│       │   ├── agent-wake.ts
│       │   ├── weekly-performance-fee.ts
│       │   └── daily-aum-fee.ts
│       └── lib/
│           ├── supabase.ts
│           ├── market.ts
│           └── fees.ts
├── db/
│   └── migrations/
│       └── 0001_init.sql
├── docs/
│   ├── architecture.md
│   ├── security-model.md
│   └── fee-model.md
└── ROADMAP.md
```

## Data ownership

| Layer | Owns | Reads from | Writes to |
|---|---|---|---|
| Browser | UI state, ephemeral form data | API routes | API routes only |
| API routes | request handling, RLS-bound queries | Supabase (anon, via Privy JWT) | Supabase (service role for cross-handler ops) |
| Worker jobs | agent runtime, fee collection | Supabase (service role), on-chain | Supabase (service role), on-chain |
| On-chain programs | custody, policy enforcement | — | — |

## Critical invariants

1. **Plaintext BYOK keys never leave the server's RAM.** Encrypted at rest in Supabase (AES-GCM), decrypted only inside the worker / API route that needs them.
2. **RLS on every table.** Handlers can only see their own data via Privy JWT. Service role (workers) bypasses for system operations.
3. **No agent acts without a registered policy on-chain.** The agent wallet program enforces this; the worker cannot circumvent.
4. **All fees recorded in fee_ledger before/after on-chain collection.** Single source of truth for revenue.
5. **Cron cadence is per-agent.** No global "tick" that fires all agents at once — they wake on independent schedules to spread load.
