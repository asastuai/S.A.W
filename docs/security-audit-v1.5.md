# SAW v1.5 Security Audit — Full Protocol (Ultra)

**Auditor:** Claude (Opus 4.8) — exhaustive multi-agent adversarial audit (ultracode)
**Date:** 2026-05-29
**Scope:** ENTIRE protocol — 3 Anchor programs, cross-program CPI, TypeScript SDK, **and the full off-chain surface** (Next.js API routes, auth/access-control, internal/cron/admin auth, Telegram bot, BYOK & secrets, fee/economic logic, Supabase/DB, LLM & agent loop, browser/client, Trigger.dev worker, dependencies).
**Methodology:** 197 agents. A recon pass cataloged every prior v1.3/v1.4 finding. 16 dimension finders read every file from scratch. Each finding was judged by a **3-lens adversarial panel** (exploitability / correctness / impact) and confirmed only with ≥2 of 3 votes. A completeness critic + loop-until-dry surfaced 3 additional gap dimensions (LLM credit TOCTOU, market/SSRF shared cache, client-side dispatcher). 8.1M tokens, ~71 min.

> **Why this round exists:** v1.3 covered the web layer manually; the v1.4 adversarial pass covered only on-chain + SDK. This is the first time the **full off-chain surface** got the adversarial 3-lens treatment. That is exactly where the protocol's real criticals have always lived (forged-JWT ATO, IDOR, topup front-running in v1.3) — and where this round found a new CRITICAL.

---

## Summary

| Severity | Confirmed | Notes |
|---|---|---|
| CRITICAL | 1 | Public anon-key RPC mints/drains LLM credits |
| HIGH | 4 | (a 5th "high" was the same critical re-reported by a second finder) |
| MEDIUM | 7 | |
| LOW | 17 | |
| INFO | 10 | |

57 raw findings → **40 confirmed, 17 refuted** by the 3-lens panel.

**Crown jewels status:** on-chain custody (funds), owner-auth (no ATO), and policy integrity remain protected — the forged-JWT/IDOR/topup criticals from v1.3 are all verified **still fixed**, and the on-chain programs hold. The new CRITICAL and most HIGHs are in the **off-chain economic/credit/identity layer**. The one exception that touches fund movement is **H-3 (propose_transfer)**, which can move agent funds autonomously below the approval threshold.

**Two honesty corrections to the raw counters:**
- The tool reported "7 prior fixes broken." This is a **mislabel** — those are pre-existing **open** items (I-1, I-2, B-2, L-8), all confirmed still-open-as-documented, not regressions. No applied fix broke.
- Of the 4 "regressions," only the SDK `policy.ts` daily-window divergence is debt **we introduced** (on-chain L-1 fix not mirrored off-chain). The others (M-3 credit race, L-5 telegram dedup fail-open) are nuances of fixes that still function.

---

## CRITICAL

### C-1 · `add_credits` / `spend_one_call` are SECURITY DEFINER and PUBLIC-executable via the anon key

**Where:** `db/migrations/0009_atomic_credits.sql:9-53` (and `prune_processed_updates` in `0010`)
**Verified independently:** both functions are `security definer` (0009:16, 0009:41); a repo-wide grep finds **zero** `revoke`/`grant` statements in any migration; the anon key is `NEXT_PUBLIC_SUPABASE_ANON_KEY` (shipped in the browser bundle, `web/lib/supabase.ts:13`).

**Impact:** Postgres grants `EXECUTE` to `PUBLIC` by default, and a stock Supabase project exposes public-schema functions to the `anon`/`authenticated` roles via `POST <SUPABASE_URL>/rest/v1/rpc/<fn>`. Because the functions are SECURITY DEFINER they run as owner and **bypass RLS**. So anyone holding the public anon key can:
- `add_credits(p_handler_id, p_amount_calls, …)` → mint unlimited LLM credits for any handler with **zero on-chain topup verification** — the entire `/api/topup` guard chain (auth, treasury check, ≥0.01 SOL, signer == primary_wallet, unique-sig) is bypassed because the attacker never touches `/api/topup`.
- `spend_one_call(p_handler_id)` in a loop → drain any victim's balance to zero (DoS the victim's agent).

Handler UUIDs are returned verbatim by `GET /api/handler/me`, so self-minting needs only one's own session.

**Blast radius:** destroys the paid-credit business model; lets an attacker drain SAW's funded Groq key for free; victim lockout. Does **not** touch on-chain funds.

**Fix (new migration):**
```sql
revoke execute on function public.add_credits(uuid,int,bigint,text) from public, anon, authenticated;
revoke execute on function public.spend_one_call(uuid)            from public, anon, authenticated;
revoke execute on function public.prune_processed_updates()       from public, anon, authenticated;
-- harden each SECURITY DEFINER body:
alter function public.add_credits(uuid,int,bigint,text) set search_path = public, pg_temp;
alter function public.spend_one_call(uuid)              set search_path = public, pg_temp;
alter function public.prune_processed_updates()         set search_path = public, pg_temp;
```
Only the service role (server-side `supabaseAdmin`) should call these. **Caveat to confirm:** if a `revoke` was applied manually in the Supabase dashboard (outside the repo), exposure may already be closed — verify with `curl <url>/rest/v1/rpc/add_credits` using the anon key, or check function grants in the dashboard. The migration is correct either way.

---

## HIGH

### H-1 · Telegram webhook fails open when `TELEGRAM_WEBHOOK_SECRET` is unset
**Where:** `web/app/api/telegram/webhook/route.ts:15-21` + `web/lib/telegram.ts:37`
The secret is only checked `if (expected)`; unset → **any POST is accepted as a genuine Telegram update**. `grammy`'s `webhookCallback(bot, "std/http")` is built with no `secretToken`, so the route conditional is the only gate. `.env.local.example:59` ships the secret **empty**. Telegram private-chat `chat_id` == the user's (non-secret, enumerable) Telegram user id, and `findLink(chatId)` binds purely on it — so an attacker can forge updates as a victim: drain their credits, inject text into their agent's system prompt, create/remove schedule items, and have the bot deliver attacker-authored phishing ("sign this recovery tx at evil.example") under the trusted persona.
**Fix:** fail closed if the secret is unset (503), enforce it in `grammy` (`{ secretToken }`), constant-time compare, mark the env var REQUIRED.

### H-2 · `propose_transfer` auto-executes to an LLM-supplied address below threshold, no per-destination owner consent
**Where:** `web/app/api/agent/chat/route.ts:1034-1063` + `web/app/demo/page.tsx:1269-1287,1538-1623,905-915`
The `propose_transfer` tool accepts an LLM-supplied `toAddress` (validated only by base58 shape + amount>0), emits an `add` action, and once the owner pressed "Lock in & Start" a 700ms dispatch loop fires due items **with no per-item confirm**. A transfer ≤ `approvalThreshold` (Operative default 80 USDC-dev) takes the `payDirect` branch signed by the **agent keypair alone**. The on-chain `recipient_allowlist` defaults to `[]` (empty = allow-all), so `evaluate_policy` does not restrict the destination. **Result:** a hallucinated or prompt-injected `propose_transfer(attacker, 75)` leaves the wallet autonomously, repeatable up to the daily cap. This is the one finding that touches fund movement.
**Fix:** force LLM-supplied destinations through the approval queue regardless of amount, OR require a destination-showing per-item owner confirm before `payDirect`; AND populate the on-chain `recipient_allowlist` so `evaluate_policy` enforces it. Don't treat the schedule-wide "Lock in" as consent for arbitrary destinations.

### H-3 · Prod-shipped `/api/debug/spawn-test-handler` mints 500 credits per call
**Where:** `web/app/api/debug/spawn-test-handler/route.ts` (full file)
Calls `addCreditsFromTopup` with a **self-fabricated** signature → `add_credits` → +500 `balance_calls`, with **zero on-chain verification**, no `requireAuth`, no `NODE_ENV`/`VERCEL_ENV` guard, compiled into the prod build. Fresh random signature per call defeats the replay guard. Same blast radius as C-1 but reachable as a single shared-secret HTTP POST. Gated only by `DEBUG_SECRET` (non-constant-time compare, no rate limit).
**Fix:** delete the route, or hard-gate to non-prod + never call `addCreditsFromTopup` with a fabricated signature from any HTTP-reachable handler + build-time exclusion from prod bundles.

### H-4 · Cross-handler BYOK key USE (unscoped decrypt + unscoped binding)
**Where:** `web/lib/db/byok.ts:31-50`, `web/app/api/agents/route.ts:57,94`, `web/lib/db/agents.ts:50`, `web/lib/telegram.ts:287-339`, `web/app/api/agent/chat/route.ts:670-777`
`getDecryptedByokKey(byokKeyId)` selects by `id` only (no `handler_id` filter). Combined with the IDOR in `POST /api/agents` (body `byokKeyId` written to the agent row with no ownership check), an authenticated attacker can bind **any victim's** encrypted key to their own agent. The Telegram path then decrypts it and forwards the **plaintext** as `x-user-api-key` to a real LLM call. **Impact delta:** the LLM bill lands on the **victim's own provider account** (Groq/OpenAI/Anthropic), and SAW's credit metering is bypassed (BYOK path) — full key-USE compromise, not just quota drain. Plaintext is never returned/logged (verified). Live surface today is Telegram; the worker becomes a second surface when Phase 1.2 ships decryption.
**Fix:** scope `getDecryptedByokKey(byokKeyId, handlerId)` with `.eq("handler_id", …)`; verify `byokKeyId` ownership in `POST /api/agents` (mirror the check already in `DELETE /api/byok`); add a DB composite-FK/RLS guard.

---

## MEDIUM (7)

| ID | Title | Where |
|---|---|---|
| M-1 | Per-tx/daily limits are **mint-agnostic** — agent bypasses caps via token substitution (limit compares raw `usd_value` with no per-mint normalization) | `agent_wallet/lib.rs:75-149`, `policy_registry/check.rs:6-40` |
| M-2 | **IDOR on `byokKeyId`** in `POST /api/agents` (root cause of H-4) — bind a victim's key to own agent | `api/agents/route.ts:57,94`, `db/agents.ts:50` |
| M-3 | Fee route trusts unbounded `swapInputLamports` → fabricated fees inflate the public dashboard (H-6 residual) | `api/agents/[id]/fees/route.ts:57-83` |
| M-4 | **Unauthenticated LLM drain** — `/api/agent/chat` & `/api/agent/scan` fall back to `GROQ_API_KEY` with rate-limit only when a handler is present | `chat:684-735`, `scan:149-216`, `db/llm.ts` |
| M-5 | `agent-wake` marks items `executing` server-side with no dispatch and no status guard — reintroduces stuck-row/double-execute | `worker/src/jobs/agent-wake.ts:94-114` |
| M-6 | Open-proxy + cost amplification on unauthenticated `/api/agent/chat` | `chat:586-646,684-735` |
| M-7 | **TOCTOU credit race** (regr of M-3): check (`balance>0`) and debit (`spendOneCall`) straddle the multi-second tool loop with no atomic reservation → race N requests on 1 credit | `chat:673-683,1279-1287` |

---

## LOW (17) — summary

deny_request missing direct request↔wallet binding (defense-in-depth) · queue.owner dead/unvalidated state · **SDK `evaluatePolicyOffChain` uses pre-L-1 rolling window (divergence we introduced)** · non-constant-time secret compares across cron/admin/internal/debug · `removeScheduledItem` IDOR (global id, LLM-reachable) · telegram `update_id` dedup fails open on non-unique DB error (L-5 nuance) · topup credit grant split across 2 non-atomic statements · RLS is vestigial (everything uses service role; comment misleading) · **plaintext BYOK key in localStorage** (3rd XSS-exfil secret) · **no Content-Security-Policy header** · no pnpm overrides for 70+ transitive advisories · DEBUG_SECRET non-constant-time + sole control · unauth `/api/market/snapshot` open CoinGecko proxy · per-day LLM rate limit is COUNT-then-act (racy) · scan route consumes Groq key with no credit debit · no fetch timeout on CoinGecko/DefiLlama (DoS amplification) · DefiLlama serves stale pools on error into autonomous yield decisions.

## INFO (10) — summary

SDK off-chain policy rolling-window divergence (twin of the LOW) · deny_request CPI confused-deputy hardening · register_policy/register_queue accept any bare Signer as `wallet` · `BN.toNumber()` precision in off-chain evaluator · unauth `/api/agent/build-swap-tx` open Jupiter/RPC proxy · vestigial `x-telegram-voice` header · non-integer `swapInputLamports` → raw 500 · **demo recipient private key also written to localStorage** · `daily-aum-fee` calls a missing RPC `agents_active_today` (job errors) · display-only `Number()` coercion of u64 quotes.

---

## Prior-fix verification (the "7 broken" — all confirmed OPEN-as-documented, none regressed)

| ID | Status |
|---|---|
| C-1..C-3, H-1..H-6 (v1.3) | **Still fixed** — JWKS JWT verify, IDOR joins, topup signer check, internal-auth handler-existence + hard-reject, CSPRNG salt all hold |
| L-1/L-2/L-4 (v1.4) | **Still fixed** on-chain |
| I-1 (approval_threshold ordering) | Open as documented (owner-gated footgun) |
| I-2 (request rent leak) | Open as documented (bounded, no revival risk — monotonic ids) |
| L-8 / B-2 (localStorage keypair/JWT) | Open, **still XSS-gated** — exhaustive re-grep found zero XSS sinks in source; not escalated |

## Regressions (4)

| Of | Sev | What |
|---|---|---|
| M-3 | MED | credit check/debit TOCTOU around the LLM loop (atomic `add_credits` didn't cover the check-then-spend window) |
| L-1-v14 | LOW/INFO | **SDK `policy.ts:67-72` still uses the rolling daily window** — on-chain UTC-day fix not mirrored (debt we introduced) |
| L-5 | LOW | telegram dedup fails open on non-unique DB error |

---

## Coverage note (completeness critic)

Off-chain coverage is broad. **Genuine gaps acknowledged:** (1) authenticated-handler concurrency on credit/rate-limit accounting (now M-7/LOW); (2) shared module caches in `market.ts`/`defillama.ts` reachable unauthenticated (LOWs); (3) the 2735-line client-side dispatcher `demo/page.tsx` as an enforcement-divergence surface (drove H-2). All are off-chain UX/abuse/accounting; on-chain enforcement remains the floor.

---

## Remediation plan (priority order)

1. **C-1** — new migration: `revoke execute … from public, anon, authenticated` on all 3 SECURITY DEFINER functions + `set search_path`. Run on Supabase. *(trivial, highest impact)*
2. **H-3** — delete `/api/debug/spawn-test-handler` (or hard non-prod gate). *(trivial)*
3. **H-4 / M-2** — scope `getDecryptedByokKey(id, handlerId)` + ownership-check `byokKeyId` in `POST /api/agents`.
4. **H-1** — telegram webhook fail-closed + mandatory secret + grammy enforcement.
5. **H-2** — route LLM-supplied transfer destinations through the approval queue and/or per-item owner confirm + populate `recipient_allowlist`. *(architectural — most design work)*
6. **M-4/M-6 + LOW proxies** — add auth/rate-limit to anonymous LLM/market/swap endpoints; fetch timeouts.
7. **SDK `policy.ts`** — mirror the on-chain UTC-day window (close the divergence we introduced).
8. Hardening: CSP header, constant-time secret compares, pnpm overrides, atomic credit reservation.
