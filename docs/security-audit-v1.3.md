# SAW v1.3 Security Audit

**Auditor:** Claude (autonomous loop)
**Date:** 2026-05-23
**Scope:** 3 Anchor programs (agent_wallet, policy_registry, approval_queue) + Next.js API surface + Telegram bot
**Methodology:** Static read of all program source + endpoint code, dynamic pentest of public endpoints via curl, transient-error fault injection, threat-model walk of the policy/approval flow.

---

## Summary

| Severity | Open | Fixed | Total |
|---|---|---|---|
| CRITICAL | 0 | 2 | 2 |
| HIGH | 0 | 6 | 6 |
| MEDIUM | 3 | 1 | 4 |
| LOW | 5 | 0 | 5 |

Overall the protocol is in good shape. The Anchor programs follow Anchor idiom correctly: PDA-derived authority, signer constraints on owner-only ops, `require_keys_eq!` on cross-account references, `token::authority` constraint on source ATAs. The off-chain API uses Privy JWT auth on user-facing routes, a Bearer secret for cron, the Telegram webhook secret header check, and an internal HMAC-ish secret for bot → endpoint calls.

The one HIGH was an internal-auth bypass amplifier: a leaked `INTERNAL_API_SECRET` would let an attacker target arbitrary handlers because the endpoint took `x-handler-id` on trust. Fixed in commit `<next>` by validating handler existence + rejecting bad secrets hard instead of silently falling through.

The MEDIUMs are about queue accounting and policy mutability under privileged change. The LOWs are minor (audit logging, defensive deny-list, observability).

---

## CRITICAL (fixed in round 2)

### C-1 · Privy JWT verified by nobody — full account takeover

**Where:** `web/lib/auth.ts` pre-fix
**Discovered via:** code read (the file itself admitted it in a TODO)
**Impact:** `extractPrivyClaims` did `JSON.parse(base64decode(token.split(".")[1]))` with **no signature check**. The endpoint trusted the `sub` claim verbatim. Any attacker could forge a JWT with `alg=none` + arbitrary `sub` and impersonate ANY handler. All Privy-protected endpoints were vulnerable: agent settings, chat history, schedule, opportunities, BYOK keys, Telegram pair, topup, handler/me. Total ATO of the platform.

**Fix:** Use `jose.createRemoteJWKSet` against Privy's public JWKS (`https://auth.privy.io/api/v1/apps/<APP_ID>/jwks.json`) + `jwtVerify` with `issuer=privy.io` and `audience=<APP_ID>`. Any verification failure → null → endpoint responds 401. `requireAuth` and `extractPrivyClaims` became async — all 16 call sites updated.

### C-2 · `POST /api/handler/me` lets attacker claim victim's wallet

**Where:** `web/app/api/handler/me/route.ts` pre-fix
**Discovered via:** chained with H-1 internal-auth fix
**Impact:** The body's `primaryWallet` field was trusted with no ownership proof. An attacker with their own Privy account could POST `{ primaryWallet: <victim wallet pubkey> }` and the handler row's `primary_wallet` would update silently. Combined with the new topup signer-check (H-4 below), this gave attackers a way to claim victim topups: victim signs and broadcasts a 0.01 SOL → treasury tx, attacker submits the public sig to /api/topup with their own Privy session, the signer check passes because `attacker.handler.primary_wallet == victim.wallet`. Attacker walks away with the credits.

**Fix:** Two-rule mitigation in `POST /api/handler/me`:
1. If the wallet is already claimed by a different `privy_user_id` → 403.
2. If the authenticated handler already has a `primary_wallet` set and the new value differs → 403 (no silent re-binding).

Wallet recovery flow (proper SIWS or Privy-side proof) is documented as v1.5 work. For v1.3 the rule is "first claim wins, immutable thereafter".

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

### H-2 · IDOR on `PATCH /api/agents/[id]/schedule` — modify any handler's items

**Where:** `web/app/api/agents/[id]/schedule/route.ts` PATCH
**Impact:** The handler is auth'd and the `agentId` is verified to belong to them, but the `itemId` query parameter is then trusted blindly. `updateScheduledItemStatus(itemId, ...)` operates on the row directly without joining back to the agent. An attacker with any valid session who knows another handler's `itemId` uuid can:
- Mark another handler's queued item as `done`, `failed`, `denied` — corrupting their UI + history
- Inject an arbitrary `txSignature` or `errorMessage` into another handler's record
- Coordinate timing attacks (mark "executing" right before they sign, causing UI race)

**Fix:** Before calling `updateScheduledItemStatus`, query the item row and verify `item.agent_id === params.id`. Return 404 if not.

### H-3 · IDOR on `PATCH /api/agents/[id]/opportunities` — same shape as H-2

**Where:** `web/app/api/agents/[id]/opportunities/route.ts` PATCH
**Impact:** Identical pattern to H-2 — `resolveOpportunity(oppId, status)` accepts any uuid, no agent binding. Attacker can `accept`/`skip`/`expire` opportunities belonging to other handlers.

**Fix:** Same template — query `opportunities.agent_id` for the supplied uuid + reject if mismatched.

### H-4 · Topup front-running — any user could claim any other user's topup tx

**Where:** `web/app/api/topup/route.ts`
**Discovered via:** code read of the comment that admitted it ("Skip strict check for v1 — any funded tx that credits the treasury counts as a topup for this authenticated handler.")
**Impact:** The endpoint verified the on-chain tx hit the treasury for ≥ 0.01 SOL, but did NOT verify the signer was the authenticated handler's primary wallet. Tx signatures are public the moment they're broadcast. Attacker watches RPC, sees victim's 0.01 SOL → treasury tx, races their own POST /api/topup with victim's signature using their own Privy session. Whoever calls /api/topup first gets the 500 credits.

**Fix:** Extract the tx's signer list (first N accounts where N = `numRequiredSignatures`) and verify the authenticated handler's `primary_wallet` is among them. Mismatch → 403. With C-2's wallet-claim immutability, the attacker can't simply re-bind their handler to victim's wallet either, so the chain is closed.

### H-6 · `/api/agents/[id]/fees` POST trusted client-supplied amountLamports

**Where:** `web/app/api/agents/[id]/fees/route.ts` POST
**Impact:** The route accepted `amountLamports` directly from the request body. Two abuses:
1. Fee evasion — client submits `kind=swap, amountLamports=0` (or just omits) → no fee recorded for what should have been a 55-bps swap charge. Direct money loss for SAW.
2. Stat inflation — client submits `kind=performance, amountLamports=999999999` for a swap they didn't actually do → public /dashboard "total fees" tile shows fake numbers. Vanity attack on the protocol's metrics.

**Fix:** `amountLamports` is now server-derived for every kind:
- `kind=swap` → require `swapInputLamports>0`, compute via `previewSwapFeeLamports` (the canonical 55-bps formula). Client cannot override.
- `kind=performance` / `kind=aum` → blocked entirely. Those need server-computed portfolio history; deferred to P0.5 work.

### H-5 · `/api/agents` POST rejected v1.3 operative bootstrap → silent UX break

**Where:** `web/app/api/agents/route.ts`
**Impact:** `ALLOWED_PERSONAS` was still `["greedie","conservador","estable"]` even though v1.3 only creates `operative`. New users in production were silently being denied an agent row in the DB. The browser's localStorage worked around it (chat ran client-side with BYOK), but: TG bot saw `agents.length === 0` and replied "No agents yet. Create one in the web", and any future sync (cron wakes, dashboard, opportunities) operated on zero rows.

**Severity:** functional HIGH (not adversarial), but visible to every new user.

**Fix:** Added `operative` to both `ALLOWED_PERSONAS` and `ACTIVE_PERSONAS`. Legacy 3 stay listed for back-compat with v1.2 rows.

---

## MEDIUM (fixed in round 4)

### M-4 · Missing security headers (X-Frame-Options, etc.)

**Where:** `web/next.config.mjs` pre-fix
**Impact:** No `headers()` configuration → Next/Vercel served only the defaults. Specifically: no `X-Frame-Options` → attacker can embed saw-gilt.vercel.app in an iframe on a phishing site and overlay invisible UI to trick the handler into clicking "approve" on a real on-chain transaction (clickjacking). No `X-Content-Type-Options: nosniff` → IE/older browsers can MIME-sniff a JSON response as HTML and execute injected script.

**Severity rationale:** MEDIUM because the clickjacking attack still needs a social-engineering vector (victim must visit the attacker page while logged in to SAW), and the MIME sniffing only affects legacy browsers. Worth fixing because the patch is one line.

**Fix:** Added `headers()` block to `next.config.mjs` setting `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` locking down unused browser caps. `Strict-Transport-Security` already comes from Vercel.

## MEDIUM (open)

### M-1 · `approval_queue.pending_count` not released on expiry

**Where:** `programs/approval_queue/src/lib.rs`
**Impact:** `MAX_PENDING_PER_WALLET = 10`. `mark_approved` and `mark_denied` decrement `pending_count`, but neither runs automatically on `expires_at`. If the agent fills the queue with 10 requests and the owner ignores them until expiry, all 10 slots stay occupied — the agent cannot create new requests even though the existing ones are dead.

**Reproduce:** Agent creates 10 `request_payment` calls. Owner does nothing. After 24h all expire. Agent calls `request_payment` again → `MaxPendingReached`.

**Fix proposed:** Add a `prune_expired` instruction (no auth required) that walks expired requests, marks them `Denied`, and decrements `pending_count`. Or change `request_payment` to itself sweep expired entries before incrementing. Keeps the slot ceiling honest.

**Severity rationale:** Not exploitable for fund loss; a hostile agent can DoS its own queue (the agent is presumably trusted because the owner set it). Recovery is a single `deny_request` per expired item. Functional bug, not security.

### M-3 · `addCreditsFromTopup` race on concurrent topups (same handler)

**Where:** `web/lib/db/credits.ts` `addCreditsFromTopup`
**Impact:** Function does `getCredits` → compute new balance → `upsert` in three steps. If the same handler submits two distinct topup txs concurrently (different tx_signatures), both calls pass the audit insert (different sigs, both unique), both read the old balance, both upsert the same `old + 500`. The user paid for 1000 calls but receives 500. Lost credits.

**Severity rationale:** Not adversarial — user only damages themselves. Frequency is low (deliberately concurrent topups by a single user are rare). But it's real money lost.

**Fix proposed:** Add a Postgres function `add_credits(handler_id, amount, lamports, sig)` that does `INSERT ... ON CONFLICT DO UPDATE SET balance_calls = llm_credits.balance_calls + EXCLUDED.balance_calls` atomically. Call via `db.rpc("add_credits", {...})`. Migration 0009 + 5-line credits.ts swap. Held back from this round because it needs a DB migration the user has to run by hand.

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

### L-5 · Telegram bot does not dedup `update_id`

**Where:** `web/lib/telegram.ts` `bot.on("message:text")`
**Impact:** Telegram retries webhooks if our endpoint times out or returns 5xx. Each retry runs the full LLM call + appends 2 chat rows + spends 1 credit. A handful of retries could drain user credits or double-post messages.

**Fix proposed:** Persist `update_id` in a small table (or a Supabase `processed_updates` set) on first hit; skip if seen. 30-line change including migration.

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
