# SAW — Secret Agent Wallet

**An agent-native consumer wallet on Solana. Your agent operates with limits. Your handler signs the override.**

Live demo: [coming soon — link after deploy]
Devnet programs: see `Anchor.toml`

---

## What this is

SAW is a wallet primitive built specifically for AI agents to hold and move user capital under enforceable on-chain constraints. The user (the **handler**) defines a policy once. The **agent** transacts within it autonomously. Anything above the threshold queues for human approval.

It's the missing layer between "give your agent your seed phrase" (catastrophic) and "sign every transaction yourself" (defeats the point of automation).

## Why now

AI agents are about to move money. Today the choices are:

1. Give the agent custodial access to a wallet → unlimited downside.
2. Sign every action → kills the autonomy that made the agent useful.
3. Build custom escrow / multisig per app → no portability.

SAW is the wallet primitive. Policy lives on-chain. Agent keypairs are rotatable. Threshold approvals are a queue with explicit handler signature. Emergency withdraw always available.

## Architecture

Three Anchor programs deployed on Solana devnet:

| Program | Address | Purpose |
|---------|---------|---------|
| `agent_wallet` | `6wsPfHTs13KA3seca53S8sc4oW7ropypGU7PzA4345TB` | PDA-derived wallet, agent signing rules, emergency controls |
| `policy_registry` | `FGTkQ9C8zr7Rm9WFZ7rK6cDdY7Bju1dTsjSN5GuHqAJF` | Daily cap, per-tx cap, allowlist, threshold — enforced on-chain |
| `approval_queue` | `8HJpiQCaCHcvbDVX7K6shcHmNkUZJUfSEqm9mhVcXXnr` | Pending requests above threshold, awaiting handler signature |

Cross-program calls via manual `invoke_signed` (avoids Anchor 0.31.1 cpi+idl-build bug). Token-2022 compatible via `token_interface`. Confidential Transfers extension is a planned next iteration.

## Repository layout

```
programs/          Anchor programs (Rust)
  agent_wallet/    Wallet PDA + agent signing
  policy_registry/ Policy storage + on-chain check
  approval_queue/  Pending request lifecycle
sdk/               TypeScript SDK (@asastuai/saw-sdk)
web/               Next.js demo + landing
tests/             Anchor tests + SDK integration tests
```

## Demo

The interactive demo at `/demo` walks through a full briefing-to-execution loop:

1. **Pick an operative.** Three persona presets (Greedie, Conservador, Estable). Greedie is fully wired to live SOL price feeds via CoinGecko.
2. **Brief them.** Plain-English chat. The agent uses tools (`get_market_price`, `add_dip_buy_item`, `add_twap_series`, etc.) to propose conditional schedule items. Handler can edit, accept, or reject.
3. **Watch them work.** Live mode polls the price every 30s. Conditional triggers fire when matched. Each transaction is real on-chain on devnet.
4. **Approve when asked.** Anything over the threshold pops a notification sheet. Handler signs in Phantom — agent cannot bypass.

The opportunity reel runs in parallel: the agent scans the market unprompted and surfaces proactive proposals with confidence and expiry.

## Quick start (local)

```bash
# Install
pnpm install

# Build the SDK
pnpm -F @asastuai/saw-sdk build

# Run the web app
pnpm -F @asastuai/saw-web dev
# Open http://localhost:3000

# Run Anchor tests
anchor test
```

To use the LLM-powered chat, set a free [Groq](https://console.groq.com) key:

```bash
echo 'GROQ_API_KEY=gsk_your_key' > web/.env.local
```

## Stack

- **Anchor 0.31.1** — programs in Rust
- **Solana 3.1.x Agave** — runtime
- **Next.js 14** — web app, App Router
- **@solana/web3.js + @solana/wallet-adapter** — Phantom integration
- **Groq + Llama / gpt-oss** — LLM tool calling for the briefing chat
- **CoinGecko** — free market price feed
- **Tailwind CSS** — visual layer (noir aesthetic, custom keyframes)

## Status

| Layer | State |
|-------|-------|
| Anchor programs | Deployed on devnet, IDLs published |
| TypeScript SDK | Built, integration-tested |
| Web demo | Live with real on-chain execution |
| Confidential Transfers Layer B | Planned next iteration |
| Mainnet deploy | After audit |

## License

Apache-2.0.

---

Built by [asastu.ai](https://asastu.ai).
