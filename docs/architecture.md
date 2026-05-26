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

---

## v1.3 changes (current)

### Unified Operative model

Three persona personas (Greedie / Conservador / Estable) collapsed into a single Operative per handler. Handler picks a custom codename in settings; the LLM context adapts intent (trade / yield / save) per message. Old persona rows kept readable for back-compat but new setups only mint an `operative`.

**Why:** the persona switcher added cognitive load with little upside — one chat handling all three skills is the natural product.

### Real on-chain transfer to arbitrary address (`propose_transfer`)

New LLM tool exposes `propose_transfer(toAddress, amount, reason)`. When the handler says "mandale 5 USDC-dev a `<pubkey>`", the Operative validates the address shape, queues a `ScheduleItem` with `item.toAddress` set, and `dispatchItem` routes the `payDirect` (or `requestPayment` + `approveAndExecute` above threshold) to the ATA derived from that address — creating the ATA on the fly if it doesn't exist (agent pays rent from its gas SOL).

End-to-end verified on devnet (sig `QCn46M6gZfQaYzXr9b3DzNSKp1xXRUEySZqwY1FB14iA4MtqmkWe8fwzZsv4jwDnTNrmtqjedCk2bR9Ag3VjwGz`, finalized). On-chain policy enforces per-tx + daily caps + approval threshold regardless of destination.

### Jupiter swap adapter (mainnet-gated)

New LLM tools:
- `get_jupiter_quote(inputSymbol, outputSymbol, amountLamports, slippageBps)` — always calls Jupiter v6 quote API for real mainnet pricing. Works on devnet too (read-only, no liquidity needed).
- `propose_jupiter_swap(...)` — queues a swap as a `ScheduleItem` with `jupiterSwap` descriptor.

The execute path is gated by `NEXT_PUBLIC_JUPITER_ENABLED`. On devnet (current) the queue accepts the item but `dispatchItem` returns a visible "mainnet pending" error. Mainnet deploy flips the flag and the same flow executes for real.

Server endpoint `POST /api/agent/build-swap-tx` builds the Jupiter tx with `platformFeeBps: 55` routed to `getTreasuryAddressString()` — the platform fee accrues to SAW on every swap.

### LLM provider tool-calling ranking

`/api/agent/chat` reorders the SAW-credits provider chain by tool-calling quality before invoking the LLM:

`cerebras > groq > anthropic > openai > grok > kimi > deepseek > gemini`

Why: Gemini Flash-Lite (cheap, free RPD tier) is weak with function calls in chat history with prior tool-success references — it generates `"Listo, propuse..."` text without emitting the tool call, leaving the schedule unchanged. Reorder pushes strong tool callers (Cerebras gpt-oss-120b, Groq llama-4) to the front so tools actually fire. Gemini stays in the chain as last-resort fallback only on transient errors.

BYOK keys (single-entry chains) are not reordered — that's the user's explicit choice.

### Security headers + audit pre-push

`next.config.mjs` now sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` lock-down. Verified live in production.

14-bug internal audit closed before public push: 3 CRITICAL + 6 HIGH + 4 MEDIUM, zero open. Report at `docs/security-audit-v1.3.md`. JWT signature verification (CRITICAL pre-fix), wallet-claim immutability, internal-auth handler validation, IDOR closures on schedule + opportunities, topup signer check, anchor program hardenings (`require!(amount > 0)`, `validate_params`, `prune_expired_request`, `reset_daily_spent`).

---

## End-to-end flow: `propose_transfer` (verified on devnet)

```mermaid
sequenceDiagram
  participant H as Handler (Phantom)
  participant UI as Demo UI
  participant API as /api/agent/chat
  participant LLM
  participant Agent as Agent keypair
  participant Chain as agent_wallet program

  H->>UI: "mandale 5 USDC-dev a 83yU..."
  UI->>API: POST {persona, schedule, conversation, newMessage}
  API->>LLM: messages + tools
  LLM-->>API: tool_call propose_transfer(toAddress, amount, reason)
  API-->>UI: { reply, actions: [add{item.toAddress}] }
  UI->>UI: dispatchItem(item)
  UI->>Chain: derive destination ATA, prepend createATA if missing
  Agent->>Chain: payDirect(destAddr, amount, salt)
  Chain->>Chain: policy_registry CPI — per-tx + daily caps
  Chain-->>UI: signature (finalized)
  UI->>H: schedule item status = done + explorer link
```

## End-to-end flow: Jupiter swap (mainnet-gated)

```mermaid
sequenceDiagram
  participant H as Handler (Phantom)
  participant UI as Demo UI
  participant API as /api/agent/build-swap-tx
  participant Jup as Jupiter v6 API
  participant Chain as Solana mainnet

  H->>UI: "swap 0.5 SOL to USDC"
  UI->>UI: dispatchItem(item.jupiterSwap)
  UI->>API: POST {inputMint, outputMint, amount, userPublicKey}
  API->>API: gate on NEXT_PUBLIC_JUPITER_ENABLED — 501 on devnet
  API->>Jup: GET /quote (platformFeeBps=55, feeAccount=SAW treasury)
  Jup-->>API: quoteResponse
  API->>Jup: POST /swap (quoteResponse + userPublicKey)
  Jup-->>API: serialized VersionedTransaction
  API-->>UI: { swapTransaction, quoteSummary }
  UI->>H: Phantom sign
  H-->>Chain: sendRawTransaction
  Chain-->>UI: signature (finalized)
```

