# SAW Security Model

## Threat model

### Threats SAW defends against

| Threat | Defense |
|---|---|
| Agent compromised by prompt injection | On-chain policy hard-limits per-tx and daily caps. Agent cannot exceed them even if "convinced" to. |
| Agent operator (handler) drained by malicious LLM response | Approval modal for over-threshold actions. Handler signs explicitly. |
| Stolen BYOK API key | Encrypted at rest (AES-GCM with `SAW_BYOK_ENC_KEY`). Worker decrypts only at wake time. Revocable at provider side. |
| Cross-handler data leak | Row-Level Security on every table, bound to Privy JWT (`auth.jwt() ->> 'sub'`). |
| Frontend XSS exfiltrating wallet | Strict CSP (planned), no `dangerouslySetInnerHTML`, Privy-managed embedded wallets isolate the signing context. |
| Worker bypassed to forge fees | `fee_ledger` is append-only audit trail. Treasury reconciliation matches on-chain transfers to ledger entries. |
| Replay of old agent decisions | Each scheduled item has a unique ID + deadline. Worker checks `status` before executing; cannot double-fire. |
| Phantom mobile not detecting demo | `ErrorBoundary` + explicit mobile hint to open via Phantom in-app browser. |

### Threats SAW explicitly does NOT defend against (v1)

| Threat | Why not in v1 |
|---|---|
| Solana mainnet exploit affecting agent_wallet program | v1 is devnet-only. Mainnet gated by audit. |
| Sophisticated MEV against agent's Jupiter swaps | Jupiter handles its own MEV protection (Jito bundles, slippage controls). |
| User exporting embedded wallet private key | Privy exposes export by design — user choice. |
| User losing access to BYOK provider account | Out of scope. User can re-add a new key. |
| Smart contract upgrade attack | Programs are upgradeable in v1 (faster iteration). Made immutable before mainnet. |

## Key management

### Handler primary wallet

Either:
- **Privy embedded wallet** — Privy custodies the key via Shamir-split (3-of-5 by default), recovers via login. Suitable for newcomers.
- **External wallet (Phantom etc.)** — handler self-custody. No SAW involvement.

### Agent keypair

- Generated client-side at agent creation (`Keypair.generate()`).
- Public key stored in `agents.agent_pubkey`.
- **Private key stored in Privy as a "delegated wallet"** (v1 plan) so the worker can sign on behalf of the agent without ever holding the raw key in our server RAM.
- Alternative for v1.0 if Privy delegated wallets land late: agent secret stored AES-GCM encrypted in Supabase next to BYOK. Removed from Supabase the moment delegated wallets are wired.

### BYOK provider keys

- Submitted via HTTPS to `/api/byok` (POST).
- Encrypted server-side with AES-256-GCM using `SAW_BYOK_ENC_KEY` (32 random bytes, never rotated without re-encrypting all rows).
- Stored as `(ciphertext, iv)` in `byok_keys`.
- Decrypted ONLY inside:
  - `worker/src/jobs/agent-wake.ts` when the agent wakes.
  - `web/app/api/agent/chat/route.ts` when the handler chats with the agent during briefing.
- Never logged, never returned via API, never exposed to the browser.

### SAW treasury

- Single wallet in v1 (devnet) — keypair held by team.
- Before mainnet: replaced with **Squads multisig (3-of-5)** of team members.
- Long-term: replaced with a SAW governance program owning the treasury PDA.

## Surface analysis

### Authenticated endpoints

| Endpoint | Auth | RLS | Sensitive |
|---|---|---|---|
| `POST /api/byok` | Privy JWT | — (service role) | Yes — accepts plaintext key once |
| `GET /api/byok` | Privy JWT | service role + filter on `handler_id` | Returns metadata only, never plaintext |
| `POST /api/agents` | Privy JWT | service role + handler check | Yes — creates on-chain commitments |
| `POST /api/agent/chat` | Privy JWT | service role | Triggers LLM call, costs user tokens |
| `POST /api/agent/scan` | Privy JWT | service role | Triggers LLM call |
| `POST /api/agent/wake` | Admin token | service role | Internal — for forced wake testing |
| `GET /api/handler/me` | Privy JWT | — | Returns the caller's row only |

### Public endpoints

| Endpoint | Why public |
|---|---|
| `GET /api/market/snapshot` | Market data, cached, no PII |
| `GET /` (landing) | Marketing |

## Audit roadmap

- **P0 (current):** internal review every PR, automated `npm audit` + `cargo audit` in CI.
- **P3:** dependency-locking review + manual review of all on-chain instructions before mainnet preparation.
- **P5 (funding application):** publish security model + signed audit-readiness checklist.
- **P6 (mainnet prep):** full external audit by **OtterSec / Halborn / Zellic**. No mainnet deploy without audit report published.
