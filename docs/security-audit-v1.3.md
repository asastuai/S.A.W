# SAW v1.3 Security Audit

**Auditor:** Claude (autonomous loop)
**Date:** 2026-05-23
**Scope:** 3 Anchor programs (agent_wallet, policy_registry, approval_queue) + Next.js API surface + Telegram bot
**Methodology:** Static read of all program source + endpoint code, dynamic pentest of public endpoints via curl, transient-error fault injection, threat-model walk of the policy/approval flow.

---

## Summary

| Severity | Open | Fixed | Total |
|---|---|---|---|
| CRITICAL | 0 | 0 | 0 |
| HIGH | 0 | 1 | 1 |
| MEDIUM | 2 | 0 | 2 |
| LOW | 4 | 0 | 4 |

Overall the protocol is in good shape. The Anchor programs follow Anchor idiom correctly: PDA-derived authority, signer constraints on owner-only ops, `require_keys_eq!` on cross-account references, `token::authority` constraint on source ATAs. The off-chain API uses Privy JWT auth on user-facing routes, a Bearer secret for cron, the Telegram webhook secret header check, and an internal HMAC-ish secret for bot → endpoint calls.

The one HIGH was an internal-auth bypass amplifier: a leaked `INTERNAL_API_SECRET` would let an attacker target arbitrary handlers because the endpoint took `x-handler-id` on trust. Fixed in commit `<next>` by validating handler existence + rejecting bad secrets hard instead of silently falling through.

The MEDIUMs are about queue accounting and policy mutability under privileged change. The LOWs are minor (audit logging, defensive deny-list, observability).

---

## HIGH (fixed)

### H-1 · Internal-auth amplifies a leaked SECRET to arbitrary-handler spoof

**Where:** `web/app/api/agent/chat/route.ts` — internal-auth path
**Discovered via:** pentest test #2 + #3
**Impact:** Anyone in possession of `INTERNAL_API_SECRET` (env var) could chat as ANY handler id by passing `x-internal-secret + x-handler-id`. The id was trusted without DB check.

- Consequences:
  - Drain another handler's SAW credits balance.
  - Create scheduled_items / chat messages under another handler's row (read by the user as if they were their own).
  - Probe handler-existence: spawn random uuids, see which return "no credits" vs which throw — handler enumeration.

- Bonus surface: a misconfigured secret was silently accepted as "anonymous" (the else branch fell through to the no-Privy path). So unauthorized callers got a successful (but anonymous) response instead of a 401 — making the bypass hard to detect from outside.

**Fix:** Two changes in the resolver:
1. After accepting the secret, look up the handler row via `supabaseAdmin().from("handlers").select("id").eq("id", internalHandler).maybeSingle()`. If the row doesn't exist → return 404.
2. If a secret is attempted but doesn't match the env var → return 401 immediately, no silent fallback.

Defense-in-depth: rotating `INTERNAL_API_SECRET` periodically remains a good practice.

---

## MEDIUM (open)

### M-1 · `approval_queue.pending_count` not released on expiry

**Where:** `programs/approval_queue/src/lib.rs`
**Impact:** `MAX_PENDING_PER_WALLET = 10`. `mark_approved` and `mark_denied` decrement `pending_count`, but neither runs automatically on `expires_at`. If the agent fills the queue with 10 requests and the owner ignores them until expiry, all 10 slots stay occupied — the agent cannot create new requests even though the existing ones are dead.

**Reproduce:** Agent creates 10 `request_payment` calls. Owner does nothing. After 24h all expire. Agent calls `request_payment` again → `MaxPendingReached`.

**Fix proposed:** Add a `prune_expired` instruction (no auth required) that walks expired requests, marks them `Denied`, and decrements `pending_count`. Or change `request_payment` to itself sweep expired entries before incrementing. Keeps the slot ceiling honest.

**Severity rationale:** Not exploitable for fund loss; a hostile agent can DoS its own queue (the agent is presumably trusted because the owner set it). Recovery is a single `deny_request` per expired item. Functional bug, not security.

### M-2 · `policy_registry.set_policy` lets the owner brick the wallet

**Where:** `programs/policy_registry/src/lib.rs`
**Impact:** Owner can set `daily_limit = 0` or `cooldown_seconds = u64::MAX`, effectively freezing the agent. There's no minimum-viable-policy invariant.

**Severity rationale:** Owner footgun, not adversary attack. But docs should call this out. `emergency_withdraw` still works, so funds aren't stuck.

**Fix proposed:** Add upper bounds on `cooldown_seconds` (e.g. max 1 week) and reject `daily_limit == 0` unless `recipient_allowlist` is empty (intentional pause).

---

## LOW (open)

### L-1 · `request_payment` lets agent create up-to-MAX_PENDING zero-amount spam

**Where:** `programs/agent_wallet/src/lib.rs` line 154
**Impact:** Agent can flood the queue with amount=0 requests that pass policy (0 is below per_tx_limit) and force the owner to manually deny each one. Minor griefing.

**Fix:** `require!(amount > 0, WalletError::ZeroAmount)` at the top of `request_payment` and `pay_direct`.

### L-2 · `/api/agent/scan` returns `{opportunities:[]}` for unauthenticated callers

**Where:** `web/app/api/agent/scan/route.ts`
**Impact:** Silent empty response could hide misconfiguration. Should probably return 401 to make the auth requirement explicit.

### L-3 · `/api/topup` GET requires Privy auth but only returns aggregate user data

**Where:** `web/app/api/topup/route.ts` GET handler
**Impact:** None directly; just noting that the bot can't introspect a handler's balance via this endpoint (must use the internal-auth chat endpoint or hit Supabase directly). Could add an internal-auth GET path for parity with the chat endpoint if useful.

### L-4 · `agent_wallet.emergency_withdraw` does not zero the policy daily_spent

**Where:** `programs/agent_wallet/src/lib.rs` line 358
**Impact:** After an emergency withdraw the policy's `daily_spent` still reflects pre-emergency spending. If the owner refunds the wallet and the agent resumes, the cap is artificially low until midnight (account level). Not security, UX edge case.

---

## Out-of-scope but worth tracking

- **On-chain v.s. off-chain trust split:** Several "guards" live in the API layer (rate limits, credit decrement, threshold check on the client). The Anchor programs enforce the canonical policy on-chain. A client-side bypass can't move funds outside the on-chain policy, which is the right separation. Audit notes confirm.
- **Telegram bot auth:** webhook verifies `X-Telegram-Bot-Api-Secret-Token`, the bot delegates to `/api/agent/chat` with internal-auth. Both layers OK.
- **Cron auth:** Bearer with `CRON_SECRET`. Rejects without and with random tokens. OK.
- **Privy JWT validation:** Trusts `extractPrivyClaims` — assumes that function validates signatures. Verified separately (out of scope for this run).

---

## Pentest log

12 endpoints probed (curl), each with a deliberate misconfiguration:

| # | Endpoint | Misconfig | Expected | Got | Verdict |
|---|---|---|---|---|---|
| 1 | POST /api/agent/chat | no auth | noKeyReply | noKeyReply | ✓ |
| 2 | POST /api/agent/chat | wrong internal-secret | 401 | noKeyReply (silent fall-through) | **HIGH → fixed** |
| 3 | POST /api/agent/chat | valid secret + random handler id | 404 | accepted (treated as valid) | **HIGH → fixed** |
| 4 | GET /api/agents | no auth | 401 | 401 | ✓ |
| 5 | PATCH /api/agents/[id] | no auth | 401 | 401 | ✓ |
| 6 | POST /api/topup | no auth | 401 | 401 | ✓ |
| 7 | GET /api/cron/wake-due-agents | no auth | 403 | 403 | ✓ |
| 8 | GET /api/cron/wake-due-agents | wrong bearer | 403 | 403 | ✓ |
| 9 | POST /api/telegram/webhook | no secret header | 403 | 403 | ✓ |
| 10 | POST /api/telegram/init-pair | no auth | 401 | 401 | ✓ |
| 11 | POST /api/debug/spawn-test-handler | no secret | 401 | 401 | ✓ |
| 12 | POST /api/debug/spawn-test-handler | wrong secret | 401 | 401 | ✓ |

---

## Next iteration recommendations

1. Wire `prune_expired` instruction (M-1) so the queue self-cleans.
2. Add `require!(amount > 0)` guards (L-1).
3. Set policy bounds (M-2) — at least cap `cooldown_seconds`.
4. Consider migrating from a shared INTERNAL_API_SECRET to per-caller HMAC-signed requests (rotate without redeploy + revoke individual callers).
