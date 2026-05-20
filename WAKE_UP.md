# Wake-up brief — 2026-05-20

Hey, te dejé esto antes de seguir dormido vos. Lectura: ~3 min.

## TL;DR

Mientras dormías construí toda la estructura "esqueleto" de v1 sin tocar nada irreversible. **6 commits locales sin pushear** (necesitamos PAT nuevo). El build de web compila limpio con todas las deps nuevas integradas. Tests de fee math pasan 10/10.

## Commits locales (último → primero)

```
HEAD  scaffold(p0-p4): API routes + dashboard stub
      docs: wake-up brief for Juan with action items and status
      scaffold(p0-p2): db access layer, providers, jupiter, privy, sentry, docs
      scaffold(p0): worker package + 3 jobs + tested fee math
      scaffold(p0): db schema + supabase/posthog/byok-crypto stubs + env example
      docs: bump swap fee to 55 bps (cheaper than Phantom, not suspicious)
      docs: v1 roadmap — degen-first, cron-based, BYOK + 3 on-chain fees
      ... (los 4 fixes anteriores ya pusheados)
```

## API routes nuevos (todos gated por Privy JWT, gracefully no-op sin keys)

- `GET  /api/handler/me` — upsert + return current handler
- `POST /api/byok` — encrypt + store BYOK key
- `GET  /api/byok` — list keys (metadata only, no plaintext)
- `DELETE /api/byok?id=` — remove key
- `GET  /api/agents` — list handler agents
- `POST /api/agents` — create agent after on-chain provision
- `POST /api/agent/wake` — admin-token-gated manual wake (Trigger.dev stub)

Auth helper en `web/lib/auth.ts`: `extractPrivyClaims`, `requireAuth`, `AuthError`. Decode-only por ahora; signature verification con `@privy-io/server-auth` aterriza en P0.5.

## Dashboard stub
- `/dashboard` página pública con grid de stats placeholders
- Linkea al ROADMAP en GitHub
- Va a tomar datos de `agent_wakes` + `scheduled_items` + `opportunities` cuando DB esté live (P4)

## Lo que quedó hecho (todo reversible)

### Infraestructura
- `db/migrations/0001_init.sql` — schema completo: 9 tablas, RLS bound to Privy JWT
- `web/lib/db/*` — access layer typed (handlers, agents, schedule, opportunities, chat, byok, fees, llm)
- `web/lib/supabase.ts` — clientes browser + admin
- `web/lib/byok-crypto.ts` — AES-GCM encrypt/decrypt para BYOK keys
- `web/lib/treasury.ts` — fee receiver address config
- `web/lib/jupiter.ts` — wrapper con modo mock devnet + real mainnet
- `web/lib/fees.ts` + `worker/src/lib/fees.ts` — math idéntica en ambos
- `web/lib/providers/{types,groq,index}.ts` — abstracción multi-provider, Groq adapter activo
- `web/components/privy-provider.tsx` — wraps app (no-op hasta que pongas APP_ID)
- `web/sentry.{client,server,edge}.config.ts` — listos para activar con DSN

### Worker (Trigger.dev)
- `worker/` package nuevo en pnpm workspace
- `worker/trigger.config.ts`
- `worker/src/jobs/agent-wake.ts` — wake cycle completo con TODOs marcados para SDK + LLM call
- `worker/src/jobs/weekly-performance-fee.ts` — Sunday 23:59 UTC cron
- `worker/src/jobs/daily-aum-fee.ts` — daily 23:55 UTC cron
- `worker/src/lib/fees.ts` — pure functions, 10 tests passing (`node --test`)
- `worker/src/lib/market.ts` — server-side CoinGecko fetcher con 60s shared cache

### UX
- `web/components/mascot.tsx` — nueva pose `sleeping` (z·z·Z animado)
- `web/public/manifest.webmanifest` — PWA install metadata

### Docs
- `ROADMAP.md` — 10 secciones, públicas
- `docs/architecture.md` — mermaid diagram + módulo + invariantes
- `docs/security-model.md` — threat model + key mgmt + audit roadmap
- `docs/fee-model.md` — 3 fees + math + anti-circumvention

## Lo que vos tenés que hacer (en orden, ~25 min total)

### 1. PAT nuevo de GitHub (2 min)
- https://github.com/settings/tokens?type=beta
- Fine-grained, **Contents: Read & Write**, repo `asastuai/S.A.W`
- Pegámelo cuando vuelvas

### 2. Crear 5 cuentas SaaS (paralelo, ~15 min)

| Servicio | URL | Qué pasarme |
|---|---|---|
| **Supabase** | https://supabase.com/dashboard → New project `saw`, plan Free, región `us-east-1` | URL + `anon key` + `service_role key` |
| **Privy** | https://dashboard.privy.io → Create app `SAW` | App ID + App Secret |
| **Trigger.dev** | https://cloud.trigger.dev → New project `saw-agents` | Project Ref + dev key + prod key |
| **Sentry** | https://sentry.io/signup/ → New Next.js project `saw-web` | DSN |
| **PostHog** | https://us.posthog.com/signup → New project `saw` | API key + host (`https://us.i.posthog.com`) |

### 3. Generar treasury keypair devnet (1 min, te paso comando)
```
solana-keygen new -o ~/saw-treasury-devnet.json --no-bip39-passphrase
solana-keygen pubkey ~/saw-treasury-devnet.json
```
Pasame la pubkey. La privada se queda en tu máquina, no la mandes acá.

### 4. Generar BYOK encryption key (10 segundos)
```
openssl rand -base64 32
```
Pasame el resultado — va en `SAW_BYOK_ENC_KEY`.

## Cuando me pases todo eso, ejecuto en una pasada

1. Push los 6 commits a GitHub
2. Pegamos los keys en `web/.env.local` y armamos `worker/.env`
3. Corro `db/migrations/0001_init.sql` en Supabase
4. Verifico conexión Supabase + ping Posthog + DSN Sentry
5. Setup auth bridge Privy → Supabase JWT
6. Deploy worker primer job a Trigger.dev
7. Smoke test full: handler signup → agent create → cron wake mockeado
8. Deploy a Vercel con todas las env vars

## Preguntas abiertas para vos

1. **Treasury en v1 devnet**: ¿single keypair tuyo o ya queremos Squads multisig desde día 1? Mi voto: keypair simple ahora, multisig pre-mainnet.

2. **`SAW_LLM_RATE_LIMIT_PER_DAY`**: defaulteé a 500 calls/día/handler. Si el cron es cada 1h = 24 wakes + ~5 calls cada uno = ~120/día. Margen amplio. ¿OK o ajustamos?

3. **Treasury env var en producción**: ¿la metemos en Vercel para preview/production de una? ¿O preferís toggle manual?

4. **Domain custom**: ¿`saw.app`, `saw.sh`, `secret-agent-wallet.com`, o seguimos con `saw-gilt.vercel.app`?

## Cosas que NO toqué (a propósito)

- Vercel project settings
- DNS / domain
- El código del demo actual (`app/demo/page.tsx`) — sigue con localStorage, sigue funcionando. La migración a DB es task #39, va cuando tengamos Supabase live.
- Anchor programs (no hubo nada que tocar)
- SDK (no hubo nada que tocar)

## Estado del repo

```
saw/
├── ROADMAP.md                      [NEW] 372 lines, public manifesto
├── WAKE_UP.md                      [NEW] este archivo
├── db/migrations/0001_init.sql     [NEW]
├── docs/
│   ├── architecture.md             [NEW]
│   ├── security-model.md           [NEW]
│   └── fee-model.md                [NEW]
├── worker/                         [NEW package]
├── web/                            [extended]
│   ├── components/privy-provider.tsx    [NEW]
│   ├── components/mascot.tsx            [modified: + sleeping pose]
│   ├── lib/db/                          [NEW]
│   ├── lib/providers/                   [NEW]
│   ├── lib/{fees,jupiter,treasury,supabase,posthog,byok-crypto}.ts  [NEW]
│   ├── sentry.{client,server,edge}.config.ts  [NEW]
│   └── public/manifest.webmanifest      [NEW]
└── (everything else unchanged)
```

Cuando arranques el día, leé esto, hacé los 4 pasos, y me decís. En una sesión tenemos P0 completo + arrancamos P1.

— Claude
