# SAW — Perps: trading apalancado bajo policy (spec)

**Date:** 2026-06-11
**Author:** Juan Cruz Maisú + Claude (Opus 4.8)
**Status:** Approved — pending implementation plan

## Intent

Extender SAW para que el agente pueda **tradear perps en vivo con leverage,
por orden en lenguaje natural**, de forma autónoma (sin la pestaña del
handler abierta), bajo policy enforcement:

> "Abrime un long de SOL x4 con 300 USDC de margin si baja hasta 64"

El agente parsea el intent, lo valida contra policy, lo encola con trigger
condicional, y cuando el precio dispara, ejecuta la posición en el venue —
con stop-loss/take-profit como failsafes nativos del venue.

## Decisiones resueltas (forks cerrados con Juan, 2026-06-11)

| Fork | Decisión | Por qué |
|---|---|---|
| Venue | **Drift Protocol** (Solana-native, wallet-signed) | El agente firma con su keypair bajo policy; tiene devnet; cero API keys; narrativa Solana/SendAI intacta. En Solana la wallet ES la credencial — no hay API keys que guardar ni robar. |
| Objetivo v1 | **Devnet end-to-end** | Demo completa con collateral de prueba. Cero riesgo, máximo valor de pitch. Mainnet después, flag-gated (mismo patrón que Jupiter spot). |
| Scope v1 | **Ciclo completo** | Abrir (market + condicional) + cerrar + SL/TP adjuntos. Un agente que abre y no cierra es media historia; con leverage sin stop es mala señal. |
| Enforcement | **Híbrido en fases (C)** | Fase 1: policy espejada off-chain (patrón `policy.ts` UTC-day existente). Fase 2: gate on-chain vía CPI agent_wallet → Drift. Diseñado desde día 1 para migrar sin retrabajo. |

## Qué ya existe (no se construye de nuevo)

- **Triggers condicionales**: `Trigger` type `below`/`above`/`dip` + deadline
  (`web/lib/schedule.ts`), con render humano via `describeTrigger`.
- **Runtime autónomo**: worker `agent_wake` (Trigger.dev) — cron per-agent,
  snapshot de mercado, evaluación de triggers, ejecución de los que disparan.
- **Market data**: CoinGecko snapshots con cache 30s (`web/lib/market.ts`).
- **Intent NL → acción**: persona greedie ya parsea buy/sell/swap →
  `propose_swap` con triggers.
- **Approval flow**: status `awaiting-approval` + approval_queue on-chain.
- **Patrón descriptor**: `ScheduleItem.jupiterSwap` — el perps usa el mismo
  molde (`perpOrder`).

## Arquitectura

```
"Abrime un long de SOL x4 con 300 USDC si baja hasta 64"
        │
        ▼
CHAT (LLM + tools) ── nuevo tool: propose_perp_open
  → { market: SOL-PERP, side: long, leverage: 4, marginUsdc: 300,
      trigger: {kind: below, asset: SOL, price: 64},
      stopLoss?: 58, takeProfit?: 75 }
        │
        ▼
POLICY CHECK (pre-queue, feedback inmediato)
  maxLeverage · maxMarginPerTx · dailyMarginBudget · allowedMarkets
  · maxOpenPositions · requireStopLoss · approvalThresholdMargin
  Fase 1: SDK/DB (espejo off-chain) · Fase 2: policy_registry on-chain
  → excede threshold → awaiting-approval (humano aprueba)
        │
        ▼
SCHEDULE (infra existente)
  ScheduleItem + descriptor nuevo perpOrder (hermano de jupiterSwap)
  UI ya muestra "SOL ≤ $64" via describeTrigger
        │
        ▼ (worker agent_wake: precio cruza el trigger)
EXECUTION (nuevo: Drift adapter)
  re-check policy → ensure-deposited (idempotente) →
  market order + SL/TP reduce-only NATIVOS de Drift (atómicos con la entrada)
```

### Decisión clave: entradas vs salidas viven en lugares distintos

- **Entradas condicionales** → triggers de SAW (worker). La entrada es donde
  corre policy + approval humano — es la historia de SAW.
- **SL/TP** → órdenes trigger nativas de Drift, colocadas atómicamente con la
  entrada, reduce-only. La seguridad de una posición apalancada no puede
  depender del uptime de nuestro worker: los keepers de Drift las ejecutan
  aunque SAW esté caído.

Línea de pitch: *"las entradas pasan por policy; los exits son failsafes y
viven en el venue"*.

## Componentes nuevos

1. **Drift adapter** — `web/lib/drift.ts` + `worker/src/lib/drift.ts`.
   Subaccount mgmt, deposit/withdraw, open/close, posiciones, órdenes trigger
   nativas. Único punto del codebase que habla con Drift. Recibe una
   **abstracción de authority** (Fase 1: keypair del agente firma; Fase 2:
   PDA firma) — un parámetro, no un rewrite.
2. **Tools nuevos del agente** — `propose_perp_open` / `propose_perp_close`
   en `web/app/api/agent/chat/route.ts`, junto a `propose_swap`. Solo persona
   **greedie** en v1.
3. **`perpOrder` en ScheduleItem** — descriptor con
   `{ market, side, leverage, marginUsdc, stopLoss?, takeProfit?,
   clientOrderId }`. Mismo patrón que `jupiterSwap`.
4. **PerpPolicy** — módulo único de evaluación con la misma interfaz que
   tendrá `evaluate_policy` on-chain (patrón espejo). Struct diseñado ya con
   layout fixed-size = futuro layout de PolicyAccount.

## PerpPolicy — parámetros

| Param | Ejemplo | Qué frena |
|---|---|---|
| `maxLeverage` | 5x | "abrime un x20" → denied |
| `maxMarginPerTx` | 500 USDC | margin por orden |
| `dailyMarginBudget` | 1.000 USDC | suma de margins por día UTC (espejo `policy.ts`) |
| `allowedMarkets` | SOL/BTC/ETH-PERP | mercados ilíquidos/raros |
| `maxOpenPositions` | 3 | exposición concurrente |
| `requireStopLoss` | true | la policy OBLIGA stop en cada entrada |
| `approvalThresholdMargin` | 200 USDC | arriba → awaiting-approval |

**Orden de evaluación** (calcado del diseño H-2): market gate → leverage →
margin per-tx → daily budget → posiciones abiertas → threshold → approval.

**Se re-evalúa al momento del disparo**, no solo al encolar — el budget
diario pudo consumirse entre encolar y disparar.

`requireStopLoss` es el diferenciador de pitch: ninguna wallet puede decir
"mi policy fuerza al agente a nunca abrir sin stop".

## Precios: quién dispara vs quién ejecuta

- **Trigger** evalúa con el snapshot existente (CoinGecko, cache 30s) —
  consistencia con el sistema actual.
- **Ejecución** ocurre al precio del oracle de Drift (Pyth).
- **Guard anti-gap**: si al disparar el oracle se desvió >1.5% más allá del
  precio del trigger (gap violento, feed colgado), el item pasa a `skipped`
  con razón visible, en vez de entrar tarde y mal.

## Collateral (Fase 1)

El agente tiene un **trading float** chico en su propia ATA (USDC-dev
fondeado explícitamente por el handler), separado del tesoro del PDA.
Propiedad de seguridad: aunque la policy off-chain fallara por completo, la
pérdida máxima = el float depositado. Hard bound físico.

Fase 2: la authority del subaccount migra al PDA y los deposits pasan por
policy on-chain.

## Manejo de errores

| Falla | Comportamiento |
|---|---|
| Float insuficiente al disparar | `failed` + razón; el agente sugiere fondear en chat |
| Drift rechaza orden (margin req, mercado pausado) | `failed` + errorMsg. **Sin retry automático** — con leverage un retry sorpresa es un bug. El agente puede re-proponer |
| Doble disparo / retry del worker | `clientOrderId` determinístico = id del ScheduleItem → idempotente |
| Deposit ok pero orden falla | Float queda en subaccount, visible en UI; próximo intento lo reusa (ensure-deposited idempotente) |
| Worker caído | Entradas no disparan (fail-safe). SL/TP viven en Drift → posición protegida |
| Cierre cuando el SL ya disparó | No-op limpio → `skipped` ("position already closed") |
| Cierre manual | Cancela SL/TP huérfanos en Drift junto con el reduce-only close |
| Deadline vencido | `skipped` (semántica existente) |
| Feed de precios caído | Triggers no evalúan ese tick; SL/TP no se afectan |

## UI

1. **Panel "Positions"** (nuevo, junto al schedule): market, side, leverage,
   margin, entrada, mark price, uPnL en vivo, niveles SL/TP, **precio de
   liquidación estimado**.
2. **Sección "Venues"**: card de Drift — toggle enable, balance del trading
   float, fondear/retirar, address del subaccount. No hay API keys: la
   wallet del agente es la credencial (punto de venta, no limitación).
3. **Echo estructurado antes de encolar** — momento UX de seguridad:

   ```
   LONG SOL-PERP ×4 · margin 300 USDC
   entrada: SOL ≤ $64.00 · SL $58.00 · liq est. ~$49.60
   policy: ✓ leverage ✓ margin ✓ budget ⚠ excede threshold → requiere aprobación
   ```

   Lo que entendió, lo que cuesta si sale mal, y qué dice la policy — antes
   de que exista la orden.
4. **Personas**: tools de perps solo en greedie en v1.

## Testing

- **Unit**: fixtures NL es/en → TradeIntent esperado (el parsing es el
  corazón); matriz de policy (cada cap deniega lo suyo); math de triggers
  (extiende tests existentes); idempotencia de `clientOrderId`.
- **Integración vs Drift devnet**: subaccount → deposit → open+SL/TP atómico
  → close+cancel huérfanos → leer posiciones. Suite separada (devnet flaky,
  no bloquea CI).
- **E2E Playwright** (`web/tests/`): orden NL → trigger visible en schedule →
  mock de precio cruza → posición en panel.
- **Anchor tests**: Fase 2 (on-chain).

## Fase 2 — gate on-chain sin retrabajo

Decisiones de día 1 que abaratan la migración:

1. Drift adapter parametrizado por **authority** (keypair → PDA).
2. PerpPolicy struct con **layout fixed-size** = futuro PolicyAccount.
3. Evaluación de policy en **un solo módulo**, misma interfaz que
   `evaluate_policy` on-chain.
4. Subaccount parametrizado por authority desde el día 1.

Trabajo de Fase 2: extender PolicyAccount (+perp params), nuevas ix
`open_perp_position`/`close_perp_position` en agent_wallet con CPI a Drift
vía PDA authority, routing a approval_queue, anchor tests, deploy devnet +
IDL. En devnet los accounts se recrean por `spawnAgent` → layout change
gratis.

## Fuera de scope (YAGNI explícito)

- Multi-venue (Hyperliquid, CEX adapters) — Drift only en v1.
- Modificar posición (add margin, partial close, mover stops, flip).
- Mainnet (flag-gated, post-funding — mismo patrón que Jupiter spot).
- Estrategias autónomas del agente (grid, DCA apalancado) — v1 es
  order-taking con NL, no strategy-running.
- Más personas que greedie.

## Verificaciones pendientes para el plan de implementación

- Estado actual del SDK TypeScript de Drift y sus program IDs en devnet
  (verificar versión/API al momento de implementar, no asumir).
- Mercados perp disponibles en Drift devnet y mecánica del faucet de
  collateral de prueba.
- Si las órdenes trigger nativas de Drift permiten colocación atómica con la
  market order de entrada en una sola tx (si no: colocación secuencial con
  rollback manual documentado).
