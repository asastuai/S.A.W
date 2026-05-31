# SAW — Secret Agent Wallet

**A programmable, on-chain custody primitive for AI agents on Solana. Your agent operates within hard limits. You sign the override. The policy is enforced by consensus, not by hoping the client behaves.**

- **Live demo:** https://saw-gilt.vercel.app  ·  try `/demo` (real on-chain execution on devnet)
- **Public dashboard:** https://saw-gilt.vercel.app/dashboard (every handler, wake, fee, credit — live)
- **Programs:** live on Solana devnet (addresses below)
- **Tutorials:** [docs/tutorials/](docs/tutorials/)

---

## What this is

SAW is a wallet primitive built specifically for AI agents to hold and move user capital under enforceable on-chain constraints. The user (the **handler**) defines a policy once. The **agent** transacts within it autonomously. Anything the agent is not pre-authorized to do queues for human approval.

It is the missing layer between "give your agent your seed phrase" (catastrophic) and "sign every transaction yourself" (defeats the point of automation).

The core idea is **PDA-derived authority**: the funds live in token accounts whose authority is a wallet PDA (no copyable key), the agent holds a separate keypair that can only *trigger* policy-gated instructions, and the owner keeps the powers that matter. A fully compromised agent key cannot move funds to an address the owner never approved. [Read the tutorial.](docs/tutorials/01-pda-derived-agent-authority.md)

## Why now

AI agents are about to move money. Today the choices are:

1. Give the agent custodial access to a wallet → unlimited downside, one prompt injection from zero.
2. Sign every action → kills the autonomy that made the agent useful.
3. Build custom escrow / multisig per app → no portability.

SAW is the portable wallet primitive. Policy lives on-chain. Agent keypairs are rotatable and revocable. Unknown destinations and over-threshold amounts route to an owner-signed approval queue. Emergency withdraw is always available to the owner.

## Security posture

This is custody software, so it has been audited like custody software. Far past hackathon hygiene:

- **Three security audits** ([v1.3](docs/security-audit-v1.3.md), [v1.4](docs/security-audit-v1.4.md), [v1.5](docs/security-audit-v1.5.md)) covering the on-chain programs, the SDK, and the full off-chain web/API surface. Every CRITICAL, HIGH, and MEDIUM finding is remediated; the v1.5 critical was verified closed against the live endpoint.
- **Adversarial review** of the recipient-gate change: four independent reviewers tried to bypass it from different angles; verdict was sound with zero real holes.
- **On-chain destination enforcement.** An agent keypair, by itself, cannot `pay_direct` to an address that is not in the owner's pre-authorized allowlist. Unknown / prompt-injected destinations escalate to `RequiresApproval` and wait for an owner signature. Hard caps (per-tx, daily, cooldown) Deny first and cannot be laundered through the queue. This is consensus-enforced, not a client-side check.
- **24-case Anchor test suite** including the crown-jewel test: *the agent cannot move funds to an arbitrary destination autonomously.*

## Architecture

Three small, independently auditable Anchor programs, live on Solana devnet:

| Program | Address | Purpose |
|---------|---------|---------|
| `agent_wallet` | `6wsPfHTs13KA3seca53S8sc4oW7ropypGU7PzA4345TB` | PDA-derived wallet, agent signing rules, CPI transfers, emergency controls |
| `policy_registry` | `FGTkQ9C8zr7Rm9WFZ7rK6cDdY7Bju1dTsjSN5GuHqAJF` | Daily cap, per-tx cap, cooldown, recipient allowlist, approval threshold — enforced on-chain |
| `approval_queue` | `8HJpiQCaCHcvbDVX7K6shcHmNkUZJUfSEqm9mhVcXXnr` | Requests the agent is not pre-authorized to make, awaiting an owner signature |

Bootstrap is **one transaction**: `initialize_wallet` creates the wallet PDA and CPIs into the other two programs to register the policy and queue. Spend limits are denominated in a single pinned mint (no oracle needed); the SDK ships `toBaseUnits` + `fetchMintDecimals` so caps are always built in the right base-units. Token-2022 compatible via `token_interface`.

## Demo

The interactive demo at `/demo` walks a full briefing-to-execution loop, all real on devnet:

1. **Brief the operative** in plain English. The agent uses tools (`get_market_price`, `add_dip_buy_item`, `add_twap_series`, `propose_transfer`, ...) to propose conditional schedule items. The handler can edit, cancel, or accept.
2. **Watch it work.** Live mode polls the price; conditional triggers fire on match; each execution is a real on-chain transaction.
3. **Approve when asked.** Anything over the threshold — or any transfer to an address the agent was not pre-authorized for — routes to an approval sheet. The handler signs in Phantom. The agent cannot bypass it; the on-chain policy is the floor.

## Repository layout

```
programs/          Anchor programs (Rust)
  agent_wallet/    Wallet PDA + agent signing + emergency controls
  policy_registry/ Policy storage + on-chain evaluate_policy
  approval_queue/  Owner-approval request lifecycle
sdk/               TypeScript SDK (@asastuai/saw-sdk)
web/               Next.js demo + landing
tests/             Anchor tests + SDK integration tests
docs/              Architecture, security audits, tutorials
```

## Quick start (local)

```bash
pnpm install
pnpm -F @asastuai/saw-sdk build      # build the SDK
pnpm -F @asastuai/saw-web dev        # run the web app → http://localhost:3000
anchor test                          # run the Anchor + SDK test suite
```

For the LLM-powered chat, set a free [Groq](https://console.groq.com) key:

```bash
echo 'GROQ_API_KEY=gsk_your_key' > web/.env.local
```

Using the SDK directly:

```ts
import { SawClient, buildPolicy, toBaseUnits, randomSalt } from "@asastuai/saw-sdk";

const handle = await client.createWallet({
  owner: owner.publicKey,
  agent: agent.publicKey,            // a separate keypair for the agent
  salt: randomSalt(),                // CSPRNG
  policy: buildPolicy({
    mint,
    dailyLimit: toBaseUnits(500, decimals),
    perTxLimit: toBaseUnits(120, decimals),
    approvalThreshold: toBaseUnits(80, decimals),
    recipientAllowlist: [knownVendor],   // pre-authorized auto-spend destinations
  }),
}, owner);                            // the OWNER signs the bootstrap
```

## Stack

- **Anchor 0.31.1 / Solana Agave** — programs in Rust
- **Next.js 14 (App Router)** + `@solana/web3.js` + `@solana/wallet-adapter` — web app + Phantom
- **TypeScript SDK** — `@asastuai/saw-sdk`, integration-tested
- **Multi-provider LLM (BYOK)** — Groq / Cerebras / OpenAI / Anthropic / Gemini, ranked for tool-calling quality
- **Supabase, Privy, grammy (Telegram), Sentry, PostHog** — off-chain surface

## Status

| Layer | State |
|-------|-------|
| Anchor programs | Live on devnet, IDLs published on-chain |
| TypeScript SDK | Built, integration-tested, 24-case suite green |
| Web demo | Live with real on-chain execution |
| Security | 3 audits + adversarial review; 0 CRITICAL / HIGH / MEDIUM open |
| Mainnet | Pending external audit + funding |

**Roadmap (not blockers).** Privacy-preserving caps via confidential transfers (Token-2022 / ZK) are a research direction, not a gate: hiding the amount conflicts with reading it on-chain to enforce a cap, so it likely arrives via integration (e.g. running the policy check over an encrypted amount) rather than a from-scratch build. Server-side agent signing (delegated wallets) and multichain are post-PMF.

## License

Apache-2.0.

---

Built by [asastu.ai](https://asastu.ai).
