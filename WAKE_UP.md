# Wake-up brief — last updated 2026-05-21

## TL;DR

**P0, P1, and v1.1 multi-provider all closed end-to-end in production.**
Demo lives at https://saw-gilt.vercel.app and is fully wired:
- Privy sign-in → handler row in Supabase
- Briefing chat + schedule persisted to DB
- Cron at cron-job.org fires `/api/cron/wake-due-agents` every 5min
- SWAP items execute a real on-chain SOL transfer on devnet (visible on explorer.solana.com)
- 4 LLM providers active (Groq, Gemini Flash-Lite, DeepSeek V3, Grok 3 mini)
- Public dashboard at /dashboard with live stats from Supabase

## Repo state

`https://github.com/asastuai/S.A.W` — all commits up to `b294e63` pushed.
Locally there are 1-2 commits ahead from this autonomous block (settings presets, sign-in gate polish, dashboard live data). Push when you provide a fresh classic PAT.

## Files of interest (since last brief)

| Area | Files |
|---|---|
| Auth + Handler upsert | `web/components/sign-in-gate.tsx`, `web/lib/use-handler.ts`, `web/app/api/handler/me/route.ts` |
| Briefing DB sync | `web/app/api/agents/[id]/{state,chat,schedule,opportunities,fees,wakes}/route.ts` |
| Cron endpoint | `web/app/api/cron/wake-due-agents/route.ts` |
| Provider abstraction | `web/lib/providers/{types,groq,gemini,openai-compat,index}.ts` |
| UX widgets | `web/components/{sleeping-badge,agent-settings-modal,wakes-feed,fee-summary,provider-badge}.tsx` |
| Public dashboard | `web/app/dashboard/page.tsx`, `web/app/api/dashboard/route.ts` |

## What works in production right now

1. Sign in (Privy + Phantom)
2. Connect any of 4 LLM providers (auto-detected by key prefix)
3. Pick Greedie + 3 setup signatures
4. Chat with Greedie ("swap 0.05 SOL for USDC right now")
5. Greedie creates schedule items (real-time persisted to DB)
6. Items fire → execute → real SOL transfer signed by agent autonomously
7. fee_ledger records 55bps platform fee per swap
8. Cron runs every 5min via cron-job.org and updates next_wake_at + audit rows
9. Settings modal: quick profile presets (Aggressive 15m / Balanced 1h / Chill 4h)
10. Sleeping badge live countdown
11. Wakes feed shows last 10 wakes
12. Fee summary widget shows cumulative + 24h slice
13. Provider badge auto-detects LLM
14. Public /dashboard pulls live aggregate from DB

## What's NOT done (deferred to P1.5+)

- **Server-side signing** for autonomous swap execution. Today swap signs from browser; agent keypair lives in setup local. Privy delegated wallets unlock server-side dispatch — that's P1.5.
- **Email / Google / X login**. Privy is in wallet-only mode v1.0. Embedded wallet signing path also needs Privy delegated wallets.
- **Real Jupiter swap on mainnet**. Today the swap leg is a real SOL transfer to treasury; the "receive USDC" is mocked. Real Jupiter integration lands when SAW moves to mainnet (post-audit, post-funding).
- **Trigger.dev**. CLI auth blocked. The custom `/api/cron/wake-due-agents` + cron-job.org replaces it for v1.

## Open small bugs

- Some early test items in DB have `status='executing'` from before the swap-fee plumbing landed. They're orphans. Can be cleaned with `delete from scheduled_items where status='executing' and created_at < ...` in Supabase SQL Editor.
- Gemini Flash 2.5 (NOT lite) has only 20 RPD free tier — we default to `gemini-2.5-flash-lite` which has 1500 RPD. Don't downgrade without re-checking pricing.

## Next stops

- Setup cron-job.org → already done (running)
- Validate `agent_wakes` table is filling — check Supabase Table Editor
- Validate `fee_ledger` is filling with each completed swap
- Eventual P2 = mainnet + real Jupiter (gated on funding)

## Tokens / keys housekeeping

- All env in `.env.local` + Vercel production env
- `CRON_SECRET` value lives in cron-job.org headers — if it ever leaks, rotate by:
  1. Generate new with `openssl rand -base64 32`
  2. Update `web/.env.local` + Vercel + cron-job.org header
- BYOK encryption key `SAW_BYOK_ENC_KEY` is set-and-forget. Losing it = users have to re-add their BYOK keys.

## Push pending

Local commits ahead of origin (need classic PAT to push):
```
$ git log origin/main..HEAD --oneline
8bcab34 feat(dashboard): live aggregate stats from Supabase
b294e63 feat(ui): sign-in gate gets a Step I/II/III strip below the CTA
```
(Plus whatever else this session adds.)
