# SAW — Path to Real

> Executive plan to close the six remaining "gated" vision notes.
> Grounded in the current codebase. Last updated 2026-06-04.

---

## 0. The reframe (read this first)

The six items still marked "gated" are **not six independent builds**. They
collapse into **four tracks** behind **three real-world unlocks**, plus one
research track. And one of the six should be **cut, not built**.

| # | Surface item | Real track | Blocker |
|---|---|---|---|
| 3 | Closed-tab web push | **Track 1 — Web Push** | none (free, scaffolded) |
| 1 | Native Phantom push + biometric | **CUT** → folds into Track 1 | not worth a native app |
| 4 | Server-side autonomous cron dispatch | **Track 2 — Server signing** | none (self-managed) or Privy |
| 2 | Gasless onboarding (session signers) | **Track 2 +** relayer | server signing + a funded fee-payer |
| 5 | Real Jupiter mainnet swaps | **Track 3 — Mainnet** | money: audit + funding |
| 6 | Confidential transfers | **Track 4 — Research** | Token-2022 CT + program redeploy |

**Critical path:** Track 1 and the *funding conversations* for Track 3 start
now, in parallel, with zero dollars. Track 2 is the biggest free product
unlock (the agent acts while you sleep). Track 3 is the long pole, gated by
money, not engineering. Track 4 is R&D you flag, not a sprint.

### Dependency map

```
Web Push infra ──────────> [#3] closed-tab push ──(replaces)──> [#1] native push
Server-side signing ─────> [#4] autonomous cron ──(+relayer)──> [#2] gasless
Funding + Audit ─────────> mainnet deploy ───────────────────> [#5] real swaps
Token-2022 CT research ──────────────────────────────────────> [#6] private amounts
```

---

## Track 1 — Notifications that reach you (Web Push + PWA)

**Closes #3. Retires #1. Do this first.**

> **STATUS (2026-06-04): BUILT.** All plumbing shipped — `web-push` dep,
> `lib/push.ts` (send), `lib/push-client.ts` (subscribe), `/api/push/{subscribe,unsubscribe}`,
> the `BellToggle` wiring, and the cron "trigger ready" push (deduped). It is
> live-but-dormant pending **two manual steps**: (1) generate VAPID keys and
> set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in Vercel + local
> env; (2) run `db/migrations/0013_push_subscriptions.sql` in Supabase. Until
> then every send is a safe no-op.

Cheapest, highest UX leverage, and already half-scaffolded: `web/public/sw.js`
has the `push` event handler + a hardened URL allowlist, and foreground alerts
already ship via `web/lib/notify.ts`. The only gap is the subscription +
server-send plumbing.

**Goal:** the agent reaches you with the tab closed — opportunity spotted,
approval needed, execution done.

### Steps

1. **Generate VAPID keys.** `npx web-push generate-vapid-keys`. Put
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` in `.env.local` and
   Vercel env. *Done when:* keys in env, never in git.
2. **`push_subscriptions` table** (`db/migrations/0013_push_subscriptions.sql`):
   `handler_id, endpoint (unique), p256dh, auth, created_at`. RLS + revoke
   grants like the other tables (see migration 0011). *Done when:* Juan runs it
   in the SQL editor.
3. **Client subscribe.** In `BellToggle` (or `pwa-register.tsx`), after
   Notification permission is granted, call
   `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
   and POST the subscription to `/api/push/subscribe`. *Done when:* opting in
   writes one row.
4. **Subscribe/unsubscribe routes** (`/api/push/subscribe`, `/api/push/unsubscribe`),
   Privy-JWT authed, ownership-checked, idempotent upsert/delete. *Done when:*
   double-subscribe is a no-op; unsubscribe removes the row.
5. **Server send helper** `web/lib/push.ts` using the `web-push` npm lib:
   `sendPush(handlerId, {title, body, url})` loads the handler's subs, sends
   each, and prunes `404/410` (expired). *Done when:* a manual send pops an OS
   notification with the tab closed.
6. **Wire events.** Call `sendPush` from the cron wake (opportunity proposed,
   trigger about to fire) and the approval-needed / execution-done paths. The
   `sw.js` handler already renders `showNotification` + the click-to-`/demo`
   allowlist. *Done when:* a real opportunity fires a closed-tab push.
7. **Retire #1.** Update the demo's "native Phantom push" vision note to
   "installed PWA + web push" — now true.

**Infra/cost:** $0 (`web-push` is free, VAPID self-generated).
**Effort:** ~2–4 days.
**Risk:** iOS needs the PWA installed to the home screen (Safari 16.4+). Document it; desktop + Android work immediately.

---

## Track 2 — The agent that acts while you sleep (server-side signing)

**Closes #4. Foundation for #2. The biggest free product unlock.**

Today the agent keypair lives **only** in browser `localStorage`, so the cron
(`web/app/api/cron/wake-due-agents/route.ts`) is observation-only — it counts
fired triggers but cannot sign. To execute server-side, the server needs a way
to sign as the agent. Two paths:

### Path A — Self-managed encrypted key (faster, free, a security decision)

Store the agent secret key **encrypted at rest**, reusing the BYOK encryption
that already exists: `web/lib/byok-crypto.ts` (AES-256-GCM, `SAW_BYOK_ENC_KEY`).
The cron loads + decrypts + signs `pay_direct` as the agent.

**Security framing (be explicit):** the agent key is **low-privilege by
design** — policy-bounded, rotatable, revocable. A server compromise of it
*cannot drain funds*; that is the entire SAW thesis. It still crosses the "no
private keys server-side" line, so make it an **opt-in, owner-consented**
decision ("let SAW act while my tab is closed"), encrypted, with rotation and
the existing revoke / emergency-withdraw as the kill switch.

### Path B — Privy delegated wallets (cleaner, dependency + cost)

The agent becomes a Privy delegated wallet; the server requests a delegated
signature; the raw key never leaves Privy. **First verify** Privy
delegated-wallet availability + pricing — do not assume it's free.

### Steps (Path A)

1. **Encrypted-key column** on `agents` (`db/migrations/0014_agent_server_key.sql`):
   `agent_enc_key`, `agent_enc_nonce`, `autonomous_enabled bool default false`.
   *Done when:* Juan runs it.
2. **Opt-in storage.** A settings toggle "act while my tab is closed" encrypts
   the agent secret (`encryptApiKey` pattern) and stores it; toggling off
   deletes it. *Done when:* opt-in stores, opt-out wipes.
3. **Shared wake routine.** Extract the per-agent "fire" branch the browser uses
   (`dispatchItem`) into a server-callable function; in the cron, replace the
   `firedCount++` observation with **build + sign + send** `pay_direct` using
   the decrypted key. *Done when:* a due trigger executes on-chain from the
   server with a real signature.
4. **Promote `/api/agent/wake`** from the Trigger.dev stub (returns 202) to call
   that same routine for one agent. *Done when:* an admin wake executes.
5. **Record sig + fee per wake.** Add `sig`, `fee_lamports` to `agent_wakes`
   (migration); the Wake-history note already promises this "when dispatch
   lands". *Done when:* the feed shows the tx + fee.
6. **Safety rails.** Respect active-hours + on-chain caps; a revoked agent's
   wake is a no-op. *Done when:* revoke freezes the autonomous path too.

**Then #2 — gasless.** Once the server can sign, add a **funded fee-payer
(relayer) wallet** that pre-pays the user's setup gas, and session-key auth so
the first signature becomes optional. = server signing + a funded relayer +
(optionally) a small program change for session authorities.

**Infra/cost:** Path A $0; Path B = Privy pricing. Relayer = a funded SOL
wallet you top up.
**Effort:** Path A ~4–6 days; Path B ~1–1.5 wk. Gasless +3–5 days after.
**Risk:** key custody (Path A) — mitigated by encryption + rotation + revoke + the policy ceiling.

---

## Track 3 — Real money (mainnet)

**Closes #5. The long pole. Gated by money, not engineering.**

The Jupiter integration **already exists** behind `NEXT_PUBLIC_JUPITER_ENABLED`
(`web/lib/jupiter.ts`: mainnet quote + swap + 55bps `platformFeeBps`;
`buildSwapTransaction` throws on devnet). The gate is an external audit and the
funding to pay for it. **Start the non-engineering parts now, in parallel.**

### Steps

1. **Funding.** Pursue the tracks ROADMAP already names: futarchy.io (primary),
   Solana Foundation grant (parallel). *Done when:* runway to pay an audit.
2. **External audit** of the three Anchor programs (OtterSec / Halborn /
   Zellic). Getting quotes is free — do it now. *Done when:* audit clean,
   findings remediated.
3. **Mainnet deploy** of the three programs + publish IDLs. *Done when:* program
   IDs live on mainnet.
4. **Mainnet RPC** (Helius paid tier). *Done when:* prod RPC swapped.
5. **Flip the flag.** `NEXT_PUBLIC_JUPITER_ENABLED=true` lights up the existing
   mainnet branch. Add the pre-flight slippage + route/fee preview before
   execution. *Done when:* a real swap executes and the fee is collected.
6. **Legal.** Entity, ToS, privacy, compliance review before public mainnet.
   *Done when:* counsel sign-off.

**Infra/cost:** audit $$$ (tens of thousands), mainnet RPC $, legal $.
**Effort:** engineering ~1 wk once funded; the calendar is dominated by audit (weeks) + funding.

---

## Track 4 — Private amounts (confidential transfers) — RESEARCH

**Closes #6. Months / R&D / possibly a partnership. Flag it, don't sprint it.**

The tension: the policy reads the amount on-chain to enforce the cap; a
confidential amount can't be read in cleartext. The README already calls this
"likely an integration, not a from-scratch build."

### Steps

1. **Spike** a Token-2022 Confidential Transfer mint on devnet; measure exactly
   what the program can and can't read.
2. **Pick the enforcement model:** (a) viewing-key reveal-to-program, (b) a ZK
   range proof that `amount ≤ cap` without revealing the amount, or (c) MPC
   over the encrypted amount (e.g. Arcium).
3. **Scope the proof** if going ZK/MPC: `amount ≤ per_tx_cap` and
   `daily_spent + amount ≤ daily_cap` without revealing `amount`.
4. **Program redeploy** with the CT-aware `evaluate_policy`.

**Likely path:** a partnership (e.g. a privacy/MPC primitive) rather than
building the crypto yourself. Lowest near-term ROI.

---

## CUT — Native Phantom mobile app + biometric (#1)

**Recommendation: do not build a native app.** Highest cost, lowest marginal
value.

- "It reaches me with the app closed" → **Track 1 (web push)** on an installed PWA.
- Biometric approval → **WebAuthn / passkeys** in the browser, no native app.
- Phantom's own mobile app already handles the signing UX via deep links /
  mobile wallet adapter.

Reframe the note from "native Phantom push" to "installed PWA + web push +
passkey approval" — which Track 1 delivers.

---

## Recommended sequence

| Order | Do | Why | $ |
|---|---|---|---|
| 1 (now) | **Track 1 — Web Push** | free, scaffolded, "it's alive when I'm away" | $0 |
| 1 (now, parallel) | **Track 3 funding/audit conversations** | the long pole; start the clock | $0 to ask |
| 2 | **Track 2 — Server signing (Path A)** | the autonomy story, free | $0 |
| 3 | **#2 gasless** (after Track 2) | frictionless onboarding | relayer top-up |
| 4 (when funded) | **Track 3 — mainnet** | real money | audit $$$ |
| ongoing | **Track 4 — CT research** | privacy, long horizon | R&D |
| — | **Cut #1 native app** | web push + passkeys cover it | — |

**Bottom line:** two of the six (web push, autonomous dispatch) are free and
buildable now and deliver the biggest "this is a real product" jump. One (#1)
should be cut. The remaining three are genuinely money- or research-gated, and
the engineering for mainnet swaps is *already written* — only the audit and
funding stand between devnet and real.

---

*Juan Cruz Maisú ♥*
