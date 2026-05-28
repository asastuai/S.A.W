# SAW v1.4 Security Audit

**Auditor:** Claude (Opus 4.8) — adversarial multi-agent self-audit
**Date:** 2026-05-28
**Scope:** 3 Anchor programs (agent_wallet, policy_registry, approval_queue) + TypeScript SDK (incl. the new chain-neutral provider seam)
**Methodology:** Per-program independent finders (one agent per program + one for the SDK) read every source file and traced data flow against an Anchor/Solana security checklist. Each finding was then handed to a *blind, skeptical second auditor* prompted to **refute** it against the real code and threat model — only findings that survived refutation are reported as confirmed. A full git-history secret scan was run in parallel.

This round complements the v1.3 audit (`security-audit-v1.3.md`). It also **corrects** one v1.3 finding that was marked fixed but shipped half-wired (L-4, below).

---

## Summary

| Severity | New & confirmed | Fixed this round | Open |
|---|---|---|---|
| CRITICAL | 0 | — | 0 |
| HIGH | 0 | — | 0 |
| MEDIUM | 0 | — | 0 |
| LOW | 4 | 4 | 0 |
| INFO | 2 | 0 | 2 (hardening) |

18 raw findings → **8 confirmed, 10 refuted** by the adversarial verifier pass. After verification, zero findings reach medium or above (the verifier downgraded two finder-rated mediums to low). **No fund-loss, policy-escape, or replay/double-spend vector was found.** Custody remains sound: the on-chain policy is the security floor, exactly as designed.

Fixes for L-1, L-2, L-4 landed in commit `7e9f833` and were deployed to **Solana devnet** (`anchor build && anchor deploy`). L-3 (SDK-only) landed in `b9fa066`. Full Anchor suite: **19 passing**, including two new regression tests that prove L-2 and L-4 behave as claimed.

Threat model (unchanged from v1.3): a malicious/compromised **agent** keypair, a malicious **counterparty**, and an arbitrary-account **caller**. The **owner is trusted**.

---

## Correction to v1.3 — L-4 was marked fixed but left half-wired

v1.3 listed L-4 (*emergency_withdraw doesn't zero policy daily_spent*) as fixed in commit `830b272`, whose message states `reset_daily_spent` is *"callable via CPI from agent_wallet's emergency_withdraw."* In reality `830b272` only **created** `reset_daily_spent` in policy_registry — it never **wired the CPI** from `emergency_withdraw`. The `EmergencyWithdraw` accounts struct didn't even carry the policy account, making the CPI structurally impossible. A repo-wide search confirmed `reset_daily_spent` had **no caller anywhere** — dead code, while the audit reported the fix as closed.

**Lesson applied:** every fix this round ships with a regression test that exercises the fixed behavior on-chain, so "fixed" means "tested green," not "code written."

---

## LOW (fixed this round)

### L-4 · `emergency_withdraw` now actually resets `daily_spent`

**Where:** `programs/agent_wallet/src/lib.rs` (`emergency_withdraw` + `EmergencyWithdraw` struct), `programs/agent_wallet/src/cpi.rs`
**Impact:** After an emergency drain, the policy's `daily_spent` still reflected pre-emergency activity. If the owner refunds the wallet and rotates the agent the same day, the new agent is throttled (`ExceedsDailyLimit`) until the window rolls. Fails *safe* (more restrictive), no fund risk, but degrades availability of a recovered wallet — and the documented v1.3 fix wasn't active.
**Fix:** Added a `cpi::reset_daily_spent` builder (mirrors `record_spend`, no amount) and added `policy` + `policy_program` accounts to `EmergencyWithdraw`. `emergency_withdraw` now CPIs `reset_daily_spent` after the transfer, signed by the wallet PDA.
**Test:** `tests/saw.ts` — *"zeroes daily_spent so a same-day refund isn't throttled (L-4)"*: agent spends → `daily_spent = 20M` → emergency_withdraw → `daily_spent = 0`.

### L-2 · Cooldown no longer blocks owner-approved payments

**Where:** `programs/agent_wallet/src/lib.rs` (`approve_and_execute`), `programs/policy_registry/src/check.rs`
**Impact:** `evaluate_policy` returns `Denied(CooldownActive)` before the `RequiresApproval` branch. Since `approve_and_execute` treated any `Denied` as fatal, a malicious agent could keep `last_tx_timestamp` fresh with tiny in-policy `pay_direct` calls and grief the owner's ability to execute a legitimately queued request. Cooldown is meant to rate-limit the **agent**, not the **owner**. Bounded (each grief payment consumes daily_limit; owner can set cooldown=0 or revoke), hence low — but a real nuisance.
**Fix:** `approve_and_execute` now accepts `Denied(DenyReason::CooldownActive)` on the owner-driven path. All hard caps (per-tx, daily, recipient/token allowlists) remain enforced — only the agent cooldown gate is waived when the owner explicitly approves.
**Test:** `tests/saw.ts` — *"owner can approve_and_execute even when agent cooldown is active (L-2)"*.

### L-1 · Daily-limit window anchored to fixed UTC-day boundaries

**Where:** `programs/policy_registry/src/state.rs` (`current_daily_spent`, `maybe_reset_daily`)
**Impact:** The daily window reset on a *rolling* `now - last_reset_timestamp >= 86400` delta, anchored to the first spend after each reset. This let the agent reposition the window by timing its first spend, enabling a ~2x burst across an arbitrary moment.
**Fix:** Reset now compares fixed UTC-day buckets (`ts.div_euclid(86400)`), so the boundary is deterministic (midnight UTC) and not agent-positionable.
**Honest limitation:** A fixed window still permits a single 2x burst straddling midnight (spend D at 23:59, D again at 00:01). Eliminating that entirely needs true sliding-window accounting (per-spend timestamps), which is out of scope for this limit's risk level. Documented in the code comment.

### L-3 · `fetchPendingRequests` returns only actionable requests

**Where:** `sdk/src/wallet-handle.ts` (inherited by `sdk/src/providers/solana.ts`)
**Impact:** The method filtered request accounts by wallet only (memcmp offset 8), returning approved/denied/expired rows too — a consumer UI could render a false approval queue. Read-only, no fund risk (on-chain `approve_and_execute` requires `status==Pending && now<=expires_at`), but misleading.
**Fix:** Filter the mapped set to `status === Pending && now <= expiresAt`, matching the on-chain executable set. Landed in `b9fa066`.

---

## INFO (hardening — open, owner-gated, non-exploitable)

### I-1 · No ordering validation among per_tx / daily / approval_threshold

**Where:** `programs/policy_registry/src/lib.rs` (`validate_params`)
Setting `approval_threshold = u64::MAX` makes `evaluate_policy` never return `RequiresApproval`, silently disabling the approval queue. Only the **trusted owner** can set this (`set_policy` requires owner Signer + `require_keys_eq`), and all hard caps still apply first, so no agent/attacker gains anything. It's a config footgun, not a vulnerability. Optional hardening: reject `approval_threshold > per_tx_limit` in `validate_params`, or emit effective thresholds in `PolicySet` so the UI can flag a wide-open config.

### I-2 · Request accounts are never closed (rent leak)

**Where:** `programs/approval_queue/src/lib.rs`
Terminal-state (approved/denied/expired) request accounts are never closed; rent paid by `payer` is uncollected and on-chain state grows. Bounded by `MAX_PENDING_PER_WALLET = 10`, and **not** a re-init/revival risk (request PDA seeds use a monotonic `id`, never reused — this is also what keeps the replay guard sound). Optional hardening: a permissioned close instruction for terminal requests that refunds rent.

---

## Positive verification

**Approval flow is safe against double-spend and over-spend.** `approve_and_execute` re-runs `evaluate_policy` against the live policy and CPIs `record_spend` atomically in the same transaction; `mark_approved` flips status to Approved and the instruction requires `status == Pending`, so a request cannot execute twice. Queuing up to 10 individually-within-limit requests cannot exceed `daily_limit` in aggregate. Confirmed by the adversarial verifier.

---

## Refuted findings (10) — why they don't hold

All ten fell to the same correct pattern: **the owner is trusted**, the agent/attacker cannot reach the path, and Anchor constraints already prevent the substitution. Highlights:

- *InitializeWallet binds arbitrary agent* — owner is a required Signer; only the trusted owner sets the agent. Misconfig yields a dead wallet, not an exploit.
- *reset_daily_spent has no owner gate (latent bypass)* — wallet-PDA signer can only be produced via `invoke_signed` from agent_wallet; not forgeable by the agent. (Now reachable only through the L-4 CPI.)
- *register_policy accepts arbitrary owner pubkey* — `seeds=[b"policy", wallet.key()]` + `wallet: Signer` prevent registering under a victim's wallet; the self-registration fallback has no victim.
- *Empty allowlist = allow-all* — owner-gated, intentional pause semantics; agent still bounded by per_tx/daily/cooldown/approval.
- *Approval authority collapses to wallet PDA* — `approve_and_execute`/`deny_request` are gated by owner Signer + `require_keys_eq(owner, wallet.owner)`, which a compromised agent can't satisfy.
- *Permissionless create_request queue griefing* — agent-only enqueue, bounded by MAX_PENDING=10, self-funded rent, and `prune_expired_request` self-heals (the v1.3 M-1 fix).
- *SDK BN.toNumber() overflow / memo truncation / salt length / requestId TOCTOU* — all either bounded by on-chain validation (cooldown ≤ 7d, i64 timestamps ~1.7e9), advisory-only, or re-derived/verified on-chain by Anchor `init` + seed constraints.

---

## Secret scan (git history)

Full-history scan (`git grep` over `git rev-list --all`) for Groq / OpenAI / Anthropic / Google / Trigger.dev / Slack / JWT / PEM private-key patterns: **zero hits**. No `.env` file was ever committed; `.gitignore` covers `.env` / `.env.local` / `.env.*.local`; no key material is tracked. The public repo carries no leaked credentials.

---

## Deploy state

- `agent_wallet` upgraded on devnet — sig `4fzFxrUtXEUPtzSYZMyHLbdXgjG1fMuuTnJggd29SwAKyXfXh18d7S2nJBL38JPpU843aLu1ZBqK9eg3inazkFFz`
- `policy_registry` upgraded on devnet — sig `2suo5FbRqHCGKBX6BaTyR5w3fJnzAh9iEFD458huDaJ7nL6ycCvbJXffEbsKWjknEf28JA9nqTzY7GXGUA6sUeCV`
- `approval_queue` unchanged — not redeployed
- SDK `agent_wallet` IDL + types regenerated to match the new `emergency_withdraw` accounts.

---

## Next iteration recommendations

1. (Optional) `anchor idl upgrade` agent_wallet on-chain so explorers fetch the current IDL (the SDK already bundles it).
2. (Optional, I-1) reject `approval_threshold > per_tx_limit` in `validate_params`, or surface effective thresholds for the UI.
3. (Optional, I-2) add a permissioned close instruction for terminal request accounts to reclaim rent.
4. Pre-mainnet: re-run this adversarial pass against the final mainnet build + the external audit (Sec3) when the Solana Foundation grant lands.
