# SAW Perps Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El agente SAW abre/cierra posiciones perp en Drift devnet por orden en lenguaje natural, con entradas condicionales ejecutadas autónomamente por el worker bajo PerpPolicy off-chain, y SL/TP como órdenes nativas de Drift.

**Architecture:** Se extiende el path DB-agent (tabla `agents` + worker `agent_wake`), NO el demo localStorage. Nuevo descriptor perp en `scheduled_items`, módulo puro `perp-policy`, adapter Drift parametrizado por authority (keypair hoy, PDA en Fase 2), trading key cifrada AES-GCM server-side (patrón `byok_keys`), y el primer dispatch on-chain real del worker (cumpliendo la nota M-5: claim atómico con guard optimista).

**Tech Stack:** Next.js 14 (web), Trigger.dev v3 (worker), Supabase (Postgres), `@drift-labs/sdk` (a lockear en Task 1), `@solana/web3.js` v1, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-11-saw-perps-design.md`

---

## Reglas duras (de la spec — el executor NO las negocia)

1. **Sin retry automático** en órdenes perp. Falla → `failed` + `error_message`. Punto.
2. **Claim atómico** antes de ejecutar: `update ... set status='executing' where id=X and status='queued'` — si 0 rows, otro wake lo tomó (nota M-5 en `agent-wake.ts`).
3. **Policy se re-evalúa al disparo**, no solo al encolar.
4. **SL/TP son órdenes nativas de Drift** (trigger_market, reduceOnly), colocadas en la MISMA tx que la entrada si el spike (Task 1) confirma atomicidad; si no, secuencial entrada→SL→TP documentando el gap.
5. **Guard anti-gap**: si el oracle de Drift se desvió >1.5% más allá del precio del trigger al disparar → `skipped`, no entrar tarde.
6. **`requireStopLoss=true` por default** — orden sin SL se rechaza en pre-check Y en dispatch.
7. Devnet only: todo gated por `DRIFT_ENABLED=true` + `DRIFT_ENV=devnet`.

## File Structure

```
CREATE:
  scripts/drift-probe.ts                      — spike devnet (Task 1)
  db/migrations/0014_perps.sql                — schema perp + trading keys (Task 2)
  worker/src/lib/perp-policy.ts               — módulo puro de policy (Task 3)
  worker/src/lib/perp-policy.test.ts
  web/lib/perp-policy.ts                      — copia espejo (patrón market.ts/fees.ts)
  web/lib/perp-policy.test.ts                 — re-exporta suite (import de fixtures compartidos)
  worker/src/lib/drift.ts                     — adapter Drift (Task 4)
  worker/src/lib/drift.integration.ts         — suite manual vs devnet (NO CI)
  web/lib/drift-read.ts                       — cliente read-only posiciones (Task 8)
  web/app/api/agents/[id]/venue/route.ts      — enable venue + trading key (Task 8)
  web/app/api/agents/[id]/positions/route.ts  — GET posiciones (Task 8)
  web/components/positions-panel.tsx          — panel Positions (Task 9)
  web/components/venue-card.tsx               — card Venues/Drift (Task 9)
  web/tests/e2e/perps.spec.ts                 — e2e Playwright (Task 9)

MODIFY:
  web/lib/db/types.ts                         — ActionType + cols perp (Task 5)
  web/lib/db/schedule.ts                      — createScheduledItem perp (Task 5)
  web/app/api/agents/[id]/schedule/route.ts   — validación perp (Task 5)
  web/app/api/agent/chat/route.ts             — tools propose_perp_* (Task 6)
  worker/src/jobs/agent-wake.ts               — dispatch leg perp (Task 7)
  worker/package.json                         — +@drift-labs/sdk +vitest (Tasks 1,4)
  web/app/agent/[id]/page.tsx                 — montar paneles (Task 9)
  docs/architecture.md                        — sección perps (Task 10)
```

**Convención del repo:** commits multilínea via `.commitmsg.txt` + `git commit -F .commitmsg.txt && rm .commitmsg.txt`. Tests unit: `vitest run`. El repo vive en WSL `~/projects/saw`.

---

### Task 1: Spike — Drift devnet probe (gate del resto del plan)

Resuelve las "Verificaciones pendientes" de la spec. **Nada de código productivo hasta cerrar esto.**

**Files:**
- Create: `scripts/drift-probe.ts`
- Modify: `worker/package.json` (dep `@drift-labs/sdk`)
- Create: `docs/superpowers/specs/2026-06-11-drift-devnet-findings.md`

- [ ] **Step 1: Instalar SDK y crear el probe**

```bash
cd ~/projects/saw/worker && pnpm add @drift-labs/sdk
```

```typescript
// scripts/drift-probe.ts — corre con: npx tsx scripts/drift-probe.ts
// Prueba en Drift devnet, con un keypair descartable:
//  1. initialize({env:'devnet'}) + DriftClient + subscribe
//  2. airdrop SOL devnet al keypair + mock-USDC via TokenFaucet
//  3. initializeUserAccount(0) (subaccount)
//  4. deposit de mock USDC al subaccount
//  5. placeOrders([market LONG SOL-PERP chico, trigger_market SL reduceOnly,
//     trigger_market TP reduceOnly]) EN UNA SOLA TX → ¿atómico? anotar
//  6. leer posición (getPerpPosition), uPnL, liquidationPrice
//  7. close reduce-only + cancelar trigger orders huérfanas
//  8. userOrderId (u8): setearlo y releerlo de getOpenOrders
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  DriftClient, Wallet, initialize, OrderType, PositionDirection,
  OrderTriggerCondition, BN, PerpMarkets, TokenFaucet,
} from "@drift-labs/sdk";

async function main() {
  const conn = new Connection(process.env.DRIFT_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
  const kp = Keypair.generate();
  console.log("probe keypair:", kp.publicKey.toBase58());
  await conn.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
  // ... (el executor completa cada paso 2-8 contra la API REAL del SDK,
  //      logueando resultado y tx signatures; este archivo es desechable
  //      y documenta la verdad del SDK al día de ejecución)
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Correr el probe y documentar hallazgos**

Run: `cd ~/projects/saw && npx tsx scripts/drift-probe.ts`
Expected: cada paso loguea OK con tx signature, o se documenta el desvío.

Escribir `docs/superpowers/specs/2026-06-11-drift-devnet-findings.md` con: versión exacta del SDK lockeada, program ID devnet, market index de SOL-PERP, mecánica del faucet, **¿placeOrders atómico con entrada+SL+TP? (sí/no + fallback)**, precisiones (BASE/QUOTE_PRECISION), shape real de OrderParams, cómo leer oracle price, uPnL y liq price.

- [ ] **Step 3: Commit**

```bash
git add scripts/drift-probe.ts worker/package.json pnpm-lock.yaml docs/superpowers/specs/2026-06-11-drift-devnet-findings.md
git commit -m "spike: Drift devnet probe — SDK locked, atomicity findings"
```

**⚠️ Si el spike revela que la API difiere de los snippets de este plan (probable — el plan se escribió con conocimiento a enero 2026), el executor ADAPTA los snippets de Tasks 4 y 7 a la API real, manteniendo las FIRMAS de funciones del adapter idénticas.**

---

### Task 1b (ADDENDUM 2026-06-11): Localnet Drift — el entorno que reemplaza a devnet

**Contexto del pivot:** el spike (Task 1, commits 84b1ff2 + 1b33a74) probó que Drift devnet
está roto on-chain: programa congelado ~19-abr con las ixs user-facing deshabilitadas
(`SpotMarketNotFound` incluso con remaining_accounts vacío), oráculos 69 días stale.
Decisión de Juan: **local validator con el programa real de Drift mainnet clonado.**
SDK lockeado: `@drift-labs/sdk@2.156.0` (en sync con mainnet).

**Files:**
- Create: `scripts/localnet-drift/setup.sh` — dump + arranque del validator
- Create: `scripts/localnet-drift/init-markets.ts` — inicialización de state/markets/oráculo
- Create: `scripts/localnet-drift/README.md` — cómo levantar el entorno en 1 comando
- Modify: `docs/superpowers/specs/2026-06-11-drift-devnet-findings.md` — sección "localnet" con lo verificado

- [ ] **Step 1:** `solana program dump dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH drift.so --url mainnet-beta` + identificar accounts a clonar (state account de Drift, spot market USDC, perp market SOL-PERP, oráculo Pyth SOL) — preferir `--clone` de accounts mainnet sobre re-inicializar admin-side cuando sea viable.
- [ ] **Step 2:** `solana-test-validator --bpf-program dRifty... drift.so --clone <accounts> --url mainnet-beta` + script de arranque reproducible.
- [ ] **Step 3:** mock USDC mint local + fondeo del keypair de prueba (mint authority local — acá NO hay faucet; documentar el flujo).
- [ ] **Step 4:** re-correr `scripts/drift-probe.ts` apuntando a `http://127.0.0.1:8899` → deposit + placeOrders([entry, SL, TP]) atómico VERDE con tx signatures locales.
- [ ] **Step 5:** documentar en findings + commit `feat(localnet): Drift mainnet-clone validator para e2e local`.

**Nota para Tasks 4 y 7:** donde el plan dice "devnet" leer "localnet Drift" — `DRIFT_ENV=localnet`, `DRIFT_RPC_URL=http://127.0.0.1:8899`. El guard `isDriftEnabled()` acepta `devnet|localnet` (nunca mainnet sin flag explícito). Los oracle reads usan el oráculo clonado/mockeado local.

---

### Task 1c (ADDENDUM #2, 2026-06-11): PIVOT DE VENUE — Drift → Adrena (dev) / Jupiter Perps (prod)

**Task 1b queda CERRADA con descubrimiento mayor:** el localnet-clone falló porque
`dRiftyHA` ya no contiene las ixs de trading. Research posterior (fuentes primarias):
**Drift sufrió un exploit de ~$285-295M el 1-abril-2026 y está suspendido** — mainnet
shim, devnet congelado, relaunch sin fecha. Decisión de Juan: **Adrena devnet para v1,
Jupiter Perps mainnet para producción**, venue abstraído.

**Renombres que aplican a Tasks 4 y 7** (mismas firmas, nuevo naming):
- `worker/src/lib/drift.ts` → `worker/src/lib/venue.ts` — interfaz `VenueAdapter`
  (idéntica a la ex-`DriftAdapter`) + `makeAdrenaAdapter(...)`
- `isDriftEnabled()` → `isVenueEnabled()`; envs `VENUE=adrena`, `VENUE_ENV=devnet`,
  `VENUE_RPC_URL` (defaults seguros: apagado)
- `web/lib/drift-read.ts` → `web/lib/venue-read.ts`
- El mercado v1 sigue siendo el perp de SOL (naming del market según SDK de Adrena)

**Spike nuevo (gates Tasks 4 y 7 — reemplaza los findings Drift-specific):**

**Files:**
- Create: `scripts/adrena-probe.ts`
- Create: `docs/superpowers/specs/2026-06-11-adrena-devnet-findings.md`
- Modify: `worker/package.json` (dep SDK de Adrena; remover `@drift-labs/sdk` si no
  quedó ningún consumidor)

- [ ] **Step 1:** instalar SDK (`adrena-sdk-ts` o el paquete oficial de AdrenaFoundation
  — verificar en npm/GitHub cuál está mantenido), program devnet
  (mainnet: `13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet`; derivar/confirmar el de devnet).
- [ ] **Step 2:** probe contra Adrena devnet con keypair descartable (in-memory, NUNCA
  a disco): collateral de prueba (faucet/mint devnet — documentar mecánica), abrir
  long SOL chico con leverage, **verificar mecánica de SL/TP**: ¿órdenes trigger
  nativas del protocolo (keeper-ejecutadas) adjuntables al abrir? ¿en la misma tx
  (atómico) o tx separada? Si NO hay SL/TP nativo → documentar el fallback y SU
  IMPACTO en la regla de la spec "exits viven en el venue" (decisión a escalar).
- [ ] **Step 3:** leer posición/PnL/liq price, cerrar, cancelar triggers huérfanos.
  Documentar TODO en findings (precisiones, shape de params, oracle reads).
- [ ] **Step 4:** commit `spike: Adrena devnet probe — venue pivot findings`.

---

### Task 2: Migración DB 0014 — perp en scheduled_items + trading keys + perp_policy

**Files:**
- Create: `db/migrations/0014_perps.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- 0014_perps.sql — perps Phase 1 (spec 2026-06-11)
-- ── scheduled_items: nuevos action types + descriptor perp ──
alter table scheduled_items drop constraint if exists scheduled_items_action_type_check;
alter table scheduled_items add constraint scheduled_items_action_type_check
  check (action_type in ('pay', 'swap', 'perp-open', 'perp-close'));

alter table scheduled_items
  add column if not exists perp_market        text,     -- "SOL-PERP"
  add column if not exists perp_side          text check (perp_side in ('long','short')),
  add column if not exists perp_leverage      numeric,  -- 4 = x4
  add column if not exists perp_margin_usdc   numeric,  -- unidades humanas (300 = 300 USDC)
  add column if not exists perp_stop_loss     numeric,  -- precio, null si no
  add column if not exists perp_take_profit   numeric,
  add column if not exists perp_user_order_id smallint; -- u8 derivado del uuid (idempotencia Drift)

-- ── perp policy por agente (Fase 1 off-chain; Fase 2 migra on-chain) ──
alter table agents add column if not exists perp_policy jsonb not null default
  '{"maxLeverage":5,"maxMarginPerTx":500,"dailyMarginBudget":1000,"allowedMarkets":["SOL-PERP"],"maxOpenPositions":3,"requireStopLoss":true,"approvalThresholdMargin":200}';

-- ── trading key del agente (devnet float) — mismo patrón AES-GCM que byok_keys ──
create table if not exists agent_trading_keys (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null unique references agents(id) on delete cascade,
  pubkey      text not null,
  ciphertext  text not null,  -- base64 AES-GCM del secretKey (64 bytes base58)
  iv          text not null,  -- base64 IV
  created_at  timestamptz not null default now()
);
alter table agent_trading_keys enable row level security;
-- Sin policies: solo service-role accede (igual que el fix C-1 de la auditoría v1.5 —
-- NUNCA grants a anon/authenticated sobre esta tabla).
```

- [ ] **Step 2: 🚦 GATE MANUAL — Juan corre la migración**

Claude no tiene acceso DDL a Supabase (solo REST + service key). **Pedirle a Juan que pegue `0014_perps.sql` en el SQL Editor de Supabase y confirme.** Verificar después via REST: `scheduled_items` acepta `action_type='perp-open'` en un insert de prueba (y borrarlo).

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0014_perps.sql
git commit -m "db: migration 0014 — perp scheduled items, agent perp_policy, trading keys"
```

---

### Task 3: PerpPolicy — módulo puro + tests (TDD)

**Files:**
- Create: `worker/src/lib/perp-policy.ts`, `worker/src/lib/perp-policy.test.ts`
- Create: `web/lib/perp-policy.ts`, `web/lib/perp-policy.test.ts` (copias espejo — patrón existente `market.ts`/`fees.ts` duplicados entre web y worker)
- Modify: `worker/package.json` (devDep `vitest`, script `"test": "vitest run"`)

- [ ] **Step 1: Escribir los tests que fallan**

```typescript
// worker/src/lib/perp-policy.test.ts
import { describe, it, expect } from "vitest";
import { evaluatePerpPolicy, DEFAULT_PERP_POLICY, type PerpIntent } from "./perp-policy";

const intent = (over: Partial<PerpIntent> = {}): PerpIntent => ({
  market: "SOL-PERP", side: "long", leverage: 4, marginUsdc: 300,
  stopLoss: 58, takeProfit: null, ...over,
});
const ctx = { dailyMarginUsedUsdc: 0, openPositions: 0 };

describe("evaluatePerpPolicy — orden de evaluación de la spec", () => {
  it("deniega mercado no listado (gate 1)", () => {
    const v = evaluatePerpPolicy(intent({ market: "DOGE-PERP" }), DEFAULT_PERP_POLICY, ctx);
    expect(v).toEqual({ verdict: "denied", reason: "market DOGE-PERP not in allowedMarkets" });
  });
  it("deniega leverage excedido (gate 2)", () => {
    expect(evaluatePerpPolicy(intent({ leverage: 20 }), DEFAULT_PERP_POLICY, ctx).verdict).toBe("denied");
  });
  it("deniega margin per-tx excedido (gate 3)", () => {
    expect(evaluatePerpPolicy(intent({ marginUsdc: 600 }), DEFAULT_PERP_POLICY, ctx).verdict).toBe("denied");
  });
  it("deniega budget diario agotado (gate 4)", () => {
    const v = evaluatePerpPolicy(intent({ marginUsdc: 150 }), DEFAULT_PERP_POLICY,
      { ...ctx, dailyMarginUsedUsdc: 900 });
    expect(v.verdict).toBe("denied"); // 900+150 > 1000
  });
  it("deniega maxOpenPositions (gate 5)", () => {
    expect(evaluatePerpPolicy(intent(), DEFAULT_PERP_POLICY, { ...ctx, openPositions: 3 }).verdict).toBe("denied");
  });
  it("deniega sin stop-loss cuando requireStopLoss (gate 6)", () => {
    expect(evaluatePerpPolicy(intent({ stopLoss: null }), DEFAULT_PERP_POLICY, ctx).verdict).toBe("denied");
  });
  it("requiere aprobación arriba del threshold (gate 7)", () => {
    expect(evaluatePerpPolicy(intent({ marginUsdc: 300 }), DEFAULT_PERP_POLICY, ctx).verdict)
      .toBe("requires-approval"); // 300 > 200
  });
  it("permite orden dentro de todos los caps", () => {
    expect(evaluatePerpPolicy(intent({ marginUsdc: 100 }), DEFAULT_PERP_POLICY, ctx).verdict).toBe("allowed");
  });
  it("el orden importa: leverage malo + margin malo reporta leverage (gate 2 antes que 3)", () => {
    const v = evaluatePerpPolicy(intent({ leverage: 20, marginUsdc: 600 }), DEFAULT_PERP_POLICY, ctx);
    expect(v.reason).toContain("leverage");
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd ~/projects/saw/worker && pnpm vitest run src/lib/perp-policy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar el módulo**

```typescript
// worker/src/lib/perp-policy.ts
// Módulo PURO (sin IO) — misma interfaz que tendrá evaluate_policy on-chain
// en Fase 2 (patrón espejo, igual que sdk/src/policy.ts con UTC-day).
// El struct PerpPolicyParams se diseña fixed-size: futuro layout PolicyAccount.

export type PerpPolicyParams = {
  maxLeverage: number;
  maxMarginPerTx: number;        // USDC, unidades humanas
  dailyMarginBudget: number;     // USDC por día UTC
  allowedMarkets: string[];
  maxOpenPositions: number;
  requireStopLoss: boolean;
  approvalThresholdMargin: number;
};

export const DEFAULT_PERP_POLICY: PerpPolicyParams = {
  maxLeverage: 5, maxMarginPerTx: 500, dailyMarginBudget: 1000,
  allowedMarkets: ["SOL-PERP"], maxOpenPositions: 3,
  requireStopLoss: true, approvalThresholdMargin: 200,
};

export type PerpIntent = {
  market: string;
  side: "long" | "short";
  leverage: number;
  marginUsdc: number;
  stopLoss: number | null;
  takeProfit: number | null;
};

export type PolicyContext = {
  dailyMarginUsedUsdc: number;   // sum(perp_margin_usdc) done hoy UTC — lo trae el caller
  openPositions: number;
};

export type PolicyVerdict =
  | { verdict: "allowed" }
  | { verdict: "denied"; reason: string }
  | { verdict: "requires-approval"; reason: string };

// Orden de evaluación calcado del diseño H-2 (spec §PerpPolicy):
// market → leverage → margin/tx → budget diario → posiciones → stop → threshold
export function evaluatePerpPolicy(
  intent: PerpIntent, policy: PerpPolicyParams, ctx: PolicyContext
): PolicyVerdict {
  if (!policy.allowedMarkets.includes(intent.market))
    return { verdict: "denied", reason: `market ${intent.market} not in allowedMarkets` };
  if (intent.leverage > policy.maxLeverage)
    return { verdict: "denied", reason: `leverage x${intent.leverage} exceeds max x${policy.maxLeverage}` };
  if (intent.marginUsdc > policy.maxMarginPerTx)
    return { verdict: "denied", reason: `margin ${intent.marginUsdc} exceeds per-tx cap ${policy.maxMarginPerTx}` };
  if (ctx.dailyMarginUsedUsdc + intent.marginUsdc > policy.dailyMarginBudget)
    return { verdict: "denied", reason: `daily margin budget exhausted (${ctx.dailyMarginUsedUsdc}/${policy.dailyMarginBudget} used)` };
  if (ctx.openPositions >= policy.maxOpenPositions)
    return { verdict: "denied", reason: `maxOpenPositions (${policy.maxOpenPositions}) reached` };
  if (policy.requireStopLoss && intent.stopLoss == null)
    return { verdict: "denied", reason: "policy requires a stop-loss on every entry" };
  if (intent.marginUsdc > policy.approvalThresholdMargin)
    return { verdict: "requires-approval", reason: `margin ${intent.marginUsdc} > approval threshold ${policy.approvalThresholdMargin}` };
  return { verdict: "allowed" };
}

// Helper para derivar el userOrderId (u8 1..255) del uuid del item —
// idempotencia en Drift (spec §errores: clientOrderId determinístico).
export function deriveUserOrderId(itemUuid: string): number {
  let h = 0;
  for (const c of itemUuid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 255) + 1;
}
```

- [ ] **Step 4: Correr tests — pasan; copiar espejo a web**

Run: `pnpm vitest run src/lib/perp-policy.test.ts` → Expected: 9 passed.
Copiar `perp-policy.ts` y `perp-policy.test.ts` idénticos a `web/lib/` (ajustar import del test a `./perp-policy`). Run: `cd ~/projects/saw/web && pnpm vitest run lib/perp-policy.test.ts` → Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add worker/src/lib/perp-policy.* web/lib/perp-policy.* worker/package.json
git commit -m "feat(perps): PerpPolicy pure module — 7-gate evaluation, mirrored web/worker"
```

---

### Task 4: Drift adapter (worker)

**Files:**
- Create: `worker/src/lib/drift.ts`
- Create: `worker/src/lib/drift.integration.ts` (manual, NO CI)

- [ ] **Step 1: Definir la interfaz del adapter (estable — Fase 2 solo cambia authority)**

```typescript
// worker/src/lib/drift.ts
// Único módulo del codebase que habla con Drift (spec §Componentes).
// `authority` es una abstracción: hoy Keypair del trading float; en Fase 2,
// un signer PDA via agent_wallet CPI. NADA fuera de este módulo conoce Drift.
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { PerpIntent } from "./perp-policy";

export type PerpPosition = {
  market: string; side: "long" | "short";
  baseSize: number; entryPrice: number; markPrice: number;
  unrealizedPnlUsdc: number; liqPrice: number | null;
  stopLoss: number | null; takeProfit: number | null;
};

export type OpenResult = { txSig: string; userOrderId: number };

export interface DriftAdapter {
  ensureUserInitialized(): Promise<void>;
  ensureDeposited(marginUsdc: number): Promise<void>; // idempotente (spec §errores)
  getOraclePrice(market: string): Promise<number>;
  hasOpenOrderWithUserOrderId(userOrderId: number): Promise<boolean>; // guard doble-disparo
  openPerp(intent: PerpIntent, userOrderId: number): Promise<OpenResult>;
  closePerp(market: string): Promise<{ txSig: string } | { alreadyClosed: true }>;
  getPositions(): Promise<PerpPosition[]>;
  getFloatBalanceUsdc(): Promise<number>;
  disconnect(): Promise<void>;
}

export function isDriftEnabled(): boolean {
  return process.env.DRIFT_ENABLED === "true" && process.env.DRIFT_ENV === "devnet";
}

export async function makeDriftAdapter(input: {
  connection: Connection;
  authority: Keypair;       // Fase 2: interfaz Signer PDA
  subAccountId?: number;    // default 0
}): Promise<DriftAdapter> {
  // Implementación contra la API REAL verificada en Task 1
  // (docs/superpowers/specs/2026-06-11-drift-devnet-findings.md).
  // openPerp: si el spike confirmó atomicidad → driftClient.placeOrders([
  //   entrada MARKET (direction long/short, baseAssetAmount =
  //     marginUsdc*leverage/oraclePrice en BASE_PRECISION, userOrderId),
  //   SL TRIGGER_MARKET reduceOnly (triggerCondition BELOW para long / ABOVE para short),
  //   TP TRIGGER_MARKET reduceOnly (condición opuesta) si takeProfit != null
  // ]) en UNA tx. Si NO es atómico → secuencial entrada→SL→TP, y si SL falla
  // tras entrada exitosa: cerrar la entrada inmediatamente (reduce-only) y
  // reportar failed — NUNCA dejar posición sin stop con requireStopLoss.
  // closePerp: market order reduceOnly por el size total + cancelar TODAS las
  //   trigger orders abiertas de ese market (huérfanas — spec §errores).
  //   Sin posición → { alreadyClosed: true }.
  throw new Error("implement against Task 1 findings");
}
```

- [ ] **Step 2: Implementar contra los findings del spike** (el executor reemplaza el throw con la implementación real; las firmas de arriba NO cambian).

- [ ] **Step 3: Suite de integración manual**

```typescript
// worker/src/lib/drift.integration.ts — correr manual: npx tsx src/lib/drift.integration.ts
// NO entra en CI (devnet flaky — spec §Testing). Flujo completo:
// adapter → ensureUserInitialized → ensureDeposited(50) → openPerp(long SOL x2,
// margin 20, SL -10%) → getPositions (1 posición, SL visible) →
// hasOpenOrderWithUserOrderId(id)=false tras fill → closePerp → getPositions []
// → closePerp de nuevo → { alreadyClosed: true }. Logs con tx sigs.
```

Run: `cd ~/projects/saw/worker && npx tsx src/lib/drift.integration.ts`
Expected: las 7 fases loguean OK con tx signatures devnet.

- [ ] **Step 4: Commit**

```bash
git add worker/src/lib/drift.ts worker/src/lib/drift.integration.ts
git commit -m "feat(perps): Drift adapter — authority-parametrized, atomic entry+SL/TP, idempotent deposit"
```

---

### Task 5: Persistencia — tipos DB, createScheduledItem, validación del route

**Files:**
- Modify: `web/lib/db/types.ts:20` (`ActionType`), tipo `ScheduledItem` (~línea 82)
- Modify: `web/lib/db/schedule.ts` (`createScheduledItem`)
- Modify: `web/app/api/agents/[id]/schedule/route.ts:12` (`ALLOWED_ACTIONS`) + validación POST

- [ ] **Step 1: Tests que fallan** (en `web/lib/db/schedule.perp.test.ts`, mockear supabase con `vi.mock`): `createScheduledItem` con `actionType:'perp-open'` y `perp:{market,side,leverage,marginUsdc,stopLoss,takeProfit,userOrderId}` inserta las columnas `perp_*` correctas; sin bloque `perp` las deja null.

- [ ] **Step 2: Implementar**

```typescript
// web/lib/db/types.ts
export type ActionType = "pay" | "swap" | "perp-open" | "perp-close";
// agregar al tipo ScheduledItem (snake_case como las demás cols):
//   perp_market: string | null; perp_side: "long" | "short" | null;
//   perp_leverage: number | null; perp_margin_usdc: number | null;
//   perp_stop_loss: number | null; perp_take_profit: number | null;
//   perp_user_order_id: number | null;
// y al tipo Agent: perp_policy: PerpPolicyParams (import de @/lib/perp-policy)
```

```typescript
// web/lib/db/schedule.ts — createScheduledItem: agregar al input
//   perp?: { market: string; side: "long"|"short"; leverage: number;
//            marginUsdc: number; stopLoss: number|null; takeProfit: number|null;
//            userOrderId: number };
// y al .insert({...}):
//   perp_market: input.perp?.market ?? null,
//   perp_side: input.perp?.side ?? null,
//   perp_leverage: input.perp?.leverage ?? null,
//   perp_margin_usdc: input.perp?.marginUsdc ?? null,
//   perp_stop_loss: input.perp?.stopLoss ?? null,
//   perp_take_profit: input.perp?.takeProfit ?? null,
//   perp_user_order_id: input.perp?.userOrderId ?? null,
```

```typescript
// web/app/api/agents/[id]/schedule/route.ts
const ALLOWED_ACTIONS: ActionType[] = ["pay", "swap", "perp-open", "perp-close"];
// En POST, si actionType empieza con "perp":
//  - perp-open exige body.perp completo (market/side/leverage/marginUsdc números válidos,
//    leverage 1..20, marginUsdc > 0) → 400 si falta
//  - server-side re-check: evaluatePerpPolicy(intent, agent.perp_policy, ctx).
//    ctx: implementar en web/lib/db/schedule.ts los helpers espejo (web NO importa
//    de worker — mismo patrón duplicado que market.ts):
//      sumMarginExecutedTodayUTC(agentId)  — sum(perp_margin_usdc) de perp-open
//        'done' con executed_at >= 00:00 UTC de hoy
//      countOpenPerpPositions(agentId)     — items perp-open 'done' sin un
//        perp-close 'done' posterior del mismo market
//    denied → 422 con reason. requires-approval → status 'awaiting-approval' (NO 'queued').
//  - derivar userOrderId server-side: deriveUserOrderId(id) — nunca confiar en el cliente.
//
// CONVENCIONES para columnas legacy NOT NULL en items perp (no adivinar):
//  - amount (bigint) = marginUsdc * 1e6 (base units USDC, consistente con DEMO_DECIMALS)
//  - scheduledFor    = Date.now() cuando hay trigger de precio (igual que los
//    dip/threshold items existentes: el trigger manda, no la hora)
//  - vendor          = null; asset = "SOL"; reason = body.reason
```

- [ ] **Step 3: Tests pasan** — `cd web && pnpm vitest run lib/db/schedule.perp.test.ts` → PASS.

- [ ] **Step 4: Commit** — `git commit -m "feat(perps): perp scheduled items — db types, persistence, route validation + server-side policy"`

---

### Task 6: Tools del agente — propose_perp_open / propose_perp_close + echo

**Files:**
- Modify: `web/app/api/agent/chat/route.ts` (tool defs ~línea 548 junto a `propose_swap`; case handlers ~línea 1164; system prompt de greedie ~línea 113)
- Create: `web/lib/perp-echo.ts` + `web/lib/perp-echo.test.ts`

- [ ] **Step 1: TDD del echo builder (es el contrato UX de la spec §UI.3)**

```typescript
// web/lib/perp-echo.test.ts
import { describe, it, expect } from "vitest";
import { buildPerpEcho } from "./perp-echo";

it("arma el echo estructurado de la spec", () => {
  const echo = buildPerpEcho({
    intent: { market: "SOL-PERP", side: "long", leverage: 4, marginUsdc: 300, stopLoss: 58, takeProfit: null },
    trigger: { kind: "below", asset: "SOL", price: 64 },
    estLiqPrice: 49.6,
    verdict: { verdict: "requires-approval", reason: "margin 300 > approval threshold 200" },
  });
  expect(echo).toContain("LONG SOL-PERP ×4 · margin 300 USDC");
  expect(echo).toContain("entrada: SOL ≤ $64.00");
  expect(echo).toContain("SL $58.00");
  expect(echo).toContain("liq est. ~$49.60");
  expect(echo).toContain("requiere tu aprobación");
});
it("liq estimada: entry/(1 + 1/lev) para long aproximado se muestra con ~", () => {
  // buildPerpEcho NO calcula liq — la recibe (viene del adapter o estimación
  // entry*(1 - 1/leverage) si Drift aún no da el dato). Solo formatea.
  const echo = buildPerpEcho({
    intent: { market: "SOL-PERP", side: "short", leverage: 2, marginUsdc: 100, stopLoss: 70, takeProfit: 55 },
    trigger: { kind: "time" }, estLiqPrice: null,
    verdict: { verdict: "allowed" },
  });
  expect(echo).toContain("SHORT SOL-PERP ×2");
  expect(echo).toContain("liq est. —");
});
```

- [ ] **Step 2: Implementar `buildPerpEcho`** (formatea exactamente el bloque de la spec: línea 1 orden, línea 2 entrada/SL/TP/liq, línea 3 policy ✓/⚠ con verdict). Tests PASS.

- [ ] **Step 3: Tool definitions + handlers en chat route**

```typescript
// Agregar a baseToolList (junto a propose_swap, ~línea 548):
{
  type: "function",
  function: {
    name: "propose_perp_open",
    description:
      "Open a leveraged perp position on Drift (devnet). Use for any 'long/short X with leverage' intent. Supports conditional entry via trigger (below/above/dip) and attaching stop-loss / take-profit. ALWAYS call get_market_price for the asset first.",
    parameters: {
      type: "object",
      properties: {
        market: { type: "string", enum: ["SOL-PERP"] },
        side: { type: "string", enum: ["long", "short"] },
        leverage: { type: "number", description: "1-20, policy caps apply" },
        marginUsdc: { type: "number", description: "collateral to commit, in USDC" },
        stopLoss: { type: "number", description: "trigger price for protective stop. Required by policy unless told otherwise." },
        takeProfit: { type: "number" },
        trigger: { type: "object", description: "conditional entry; omit for immediate",
          properties: { kind: { type: "string", enum: ["below", "above", "dip"] },
            price: { type: "number" }, basisPrice: { type: "number" },
            dropPct: { type: "number" }, deadlineMs: { type: "number" } } },
        reason: { type: "string", description: "one-line rationale shown to the handler" },
      },
      required: ["market", "side", "leverage", "marginUsdc", "reason"],
    },
  },
},
{
  type: "function",
  function: {
    name: "propose_perp_close",
    description: "Close an open perp position (reduce-only) and cancel its attached SL/TP orders.",
    parameters: { type: "object",
      properties: { market: { type: "string", enum: ["SOL-PERP"] },
        reason: { type: "string" } },
      required: ["market", "reason"] },
  },
},
```

Case handlers (~línea 1164, espejo del case `propose_swap`): validar args → `evaluatePerpPolicy` con policy del body (extender `RequestBody.persona.policy` con `perpPolicy`) → `denied`: el tool result devuelve el reason al LLM (que se lo explica al user, NO encola) → `allowed`/`requires-approval`: push de `ActionAdd` extendido con `perpOrder` + status objetivo, y tool result = `buildPerpEcho(...)`. Extender el type `ActionAdd.item` con `perpOrder?: { market; side; leverage; marginUsdc; stopLoss; takeProfit }`.

**Gate por persona (spec §UI.4 — "solo greedie en v1"):** donde el route arma `tools` desde `baseToolList` (~línea 746), filtrar: si `persona.id !== "greedie"`, excluir `propose_perp_open` y `propose_perp_close` de la lista. No alcanza con el prompt — el tool no debe EXISTIR para los otros personas. Test unit: lista de tools para conservador no contiene `propose_perp_open`.

System prompt de greedie: agregar bloque "PERPS WORKFLOW" tras el de swaps (~línea 121): siempre `get_market_price` primero; mapear "abrime un long de SOL x4 con 300 si baja a 64" → `propose_perp_open({market:"SOL-PERP", side:"long", leverage:4, marginUsdc:300, stopLoss:<sugerir si falta>, trigger:{kind:"below", price:64}})`; si el user no dio stop y la policy lo exige, PROPONER uno (-8 a -12% del entry para x3-x5) y decirlo en la respuesta; nunca inventar leverage no pedido.

- [ ] **Step 4: Test manual del route** — `pnpm vitest run` (suite completa web) → PASS; smoke con `curl` al chat route con `newMessage: "abrime un long de sol x4 con 300 usdc si baja hasta 64"` y verificar en la respuesta: action `add` con `perpOrder` + echo en el texto.

- [ ] **Step 5: Commit** — `git commit -m "feat(perps): propose_perp_open/close agent tools, policy pre-check, structured echo"`

---

### Task 7: Worker dispatch — el primer leg autónomo on-chain

**Files:**
- Modify: `worker/src/jobs/agent-wake.ts` (bloque "trigger fired — dispatch deferred", líneas ~95-115)
- Create: `worker/src/lib/dispatch-perp.ts` + `worker/src/lib/dispatch-perp.test.ts`
- Create: `worker/src/lib/trading-key.ts` (decrypt — espejo de `web/lib/byok-crypto.ts`)

- [ ] **Step 1: TDD de la lógica de dispatch (separada del job para testearla pura)**

```typescript
// worker/src/lib/dispatch-perp.test.ts — mockear DriftAdapter y supabase client.
// Casos (spec §errores, tabla completa):
// 1. claim atómico: update devuelve 0 rows → return "claimed-elsewhere", NO ejecuta
// 2. policy re-check deniega al disparo (budget consumido) → status 'denied' + error_message
// 3. oracle gap >1.5% más allá del trigger → 'skipped' + razón
// 4. hasOpenOrderWithUserOrderId true → 'skipped' (double-fire guard)
// 5. float insuficiente (ensureDeposited lanza) → 'failed' + "insufficient float", SIN retry
// 6. openPerp lanza (Drift rechaza) → 'failed' + error_message, SIN retry
// 7. happy path → 'done' + tx_signature + executed_at
// 8. perp-close sin posición → 'skipped' "position already closed"
// 9. requireStopLoss + item sin perp_stop_loss → 'denied' (defensa en profundidad)
```

- [ ] **Step 2: Implementar `dispatchPerpItem`**

```typescript
// worker/src/lib/dispatch-perp.ts
// El claim atómico implementa EXACTAMENTE la nota M-5 de agent-wake.ts:
// status transition junto con el envío, guard optimista .eq(status,'queued').
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DriftAdapter } from "./drift";
import { evaluatePerpPolicy, deriveUserOrderId, type PerpPolicyParams } from "./perp-policy";

const ORACLE_GAP_PCT = 1.5; // spec §precios

export async function dispatchPerpItem(input: {
  db: SupabaseClient; adapter: DriftAdapter;
  item: any /* row scheduled_items */; policy: PerpPolicyParams;
  dailyMarginUsedUsdc: number; openPositions: number;
}): Promise<{ outcome: string }> {
  const { db, adapter, item } = input;
  // 1. CLAIM ATÓMICO (M-5)
  const { data: claimed } = await db.from("scheduled_items")
    .update({ status: "executing" })
    .eq("id", item.id).eq("status", "queued")
    .select("id");
  if (!claimed?.length) return { outcome: "claimed-elsewhere" };

  const fail = async (status: string, msg: string) => {
    await db.from("scheduled_items")
      .update({ status, error_message: msg }).eq("id", item.id);
    return { outcome: status };
  };

  try {
    if (item.action_type === "perp-close") {
      const res = await adapter.closePerp(item.perp_market);
      if ("alreadyClosed" in res) return await fail("skipped", "position already closed");
      await db.from("scheduled_items").update({
        status: "done", tx_signature: res.txSig, executed_at: new Date().toISOString(),
      }).eq("id", item.id);
      return { outcome: "done" };
    }

    // perp-open
    const intent = {
      market: item.perp_market, side: item.perp_side,
      leverage: Number(item.perp_leverage), marginUsdc: Number(item.perp_margin_usdc),
      stopLoss: item.perp_stop_loss != null ? Number(item.perp_stop_loss) : null,
      takeProfit: item.perp_take_profit != null ? Number(item.perp_take_profit) : null,
    };
    // 2. RE-CHECK de policy al disparo (spec: el budget pudo consumirse)
    const v = evaluatePerpPolicy(intent, input.policy,
      { dailyMarginUsedUsdc: input.dailyMarginUsedUsdc, openPositions: input.openPositions });
    if (v.verdict !== "allowed") return await fail("denied", `policy at fire time: ${"reason" in v ? v.reason : ""}`);
    // 3. GUARD anti-gap del oracle
    const oracle = await adapter.getOraclePrice(intent.market);
    const trigPrice = Number(item.trigger_target_price ?? oracle);
    if (Math.abs(oracle - trigPrice) / trigPrice > ORACLE_GAP_PCT / 100 &&
        beyondTrigger(item, oracle, trigPrice))
      return await fail("skipped", `oracle gap: trigger $${trigPrice} vs oracle $${oracle.toFixed(2)} (> ${ORACLE_GAP_PCT}%)`);
    // 4. GUARD doble disparo (idempotencia)
    const uoid = item.perp_user_order_id ?? deriveUserOrderId(item.id);
    if (await adapter.hasOpenOrderWithUserOrderId(uoid))
      return await fail("skipped", "duplicate: order with same userOrderId already open");
    // 5. Collateral idempotente + ejecución. SIN retry (spec: retry sorpresa = bug).
    await adapter.ensureDeposited(intent.marginUsdc);
    const res = await adapter.openPerp(intent, uoid);
    await db.from("scheduled_items").update({
      status: "done", tx_signature: res.txSig, executed_at: new Date().toISOString(),
    }).eq("id", item.id);
    return { outcome: "done" };
  } catch (e: any) {
    return await fail("failed", e?.message ?? String(e));
  }
}

// gap "más allá" del trigger: para below, oracle MUY por debajo del target;
// para above, muy por encima (entrar tarde y mal — spec §precios)
function beyondTrigger(item: any, oracle: number, trig: number): boolean {
  if (item.trigger_kind === "below" || item.trigger_kind === "dip") return oracle < trig;
  if (item.trigger_kind === "above") return oracle > trig;
  return false;
}
```

- [ ] **Step 3: trading-key.ts** — `loadTradingKeypair(db, agentId)`: lee `agent_trading_keys`, descifra con el MISMO master key env que `web/lib/byok-crypto.ts` (mirar nombre exacto de la env var ahí; AES-GCM, base64 ciphertext+iv) → `Keypair.fromSecretKey`. Sin key → null (venue no habilitado).

- [ ] **Step 4: Wiring en agent-wake.ts** — reemplazar el bloque deferred (~líneas 95-115) SOLO para items perp:

```typescript
// dentro del for (const item of pending ?? []) — tras shouldFire(...):
if (item.action_type === "perp-open" || item.action_type === "perp-close") {
  if (!isDriftEnabled()) { logger.log("drift disabled, skip", { itemId: item.id }); continue; }
  const kp = await loadTradingKeypair(db, a.id);
  if (!kp) { logger.log("no trading key, skip", { itemId: item.id }); continue; }
  const adapter = await makeDriftAdapter({ connection: driftConnection(), authority: kp });
  try {
    const policy = (a as any).perp_policy ?? DEFAULT_PERP_POLICY;
    const dailyUsed = await sumMarginExecutedTodayUTC(db, a.id);
    const positions = await adapter.getPositions();
    const r = await dispatchPerpItem({ db, adapter, item, policy,
      dailyMarginUsedUsdc: dailyUsed, openPositions: positions.length });
    if (r.outcome === "done") executed++;
    outcome = "perp-dispatched";
  } finally { await adapter.disconnect(); }
  continue; // pay/swap dispatch sigue deferred (Phase 1.1) — fuera de scope
}
// shouldFire NO cambia: los items perp usan las mismas columnas trigger_*
```

`sumMarginExecutedTodayUTC` (en dispatch-perp.ts): `select perp_margin_usdc from scheduled_items where agent_id=X and action_type='perp-open' and status='done' and executed_at >= <00:00 UTC de hoy>` → sumar en TS (consistente con el espejo UTC-day de `sdk/src/policy.ts`).

- [ ] **Step 5: Tests + commit**

Run: `cd worker && pnpm vitest run` → Expected: dispatch-perp 9 casos + perp-policy 9 PASS.

```bash
git add worker/src/lib/dispatch-perp.* worker/src/lib/trading-key.ts worker/src/jobs/agent-wake.ts
git commit -m "feat(perps): autonomous worker dispatch — atomic claim (M-5), fire-time policy, oracle gap + dup guards"
```

---

### Task 8: Venue enable — trading key + posiciones (API)

**Files:**
- Create: `web/app/api/agents/[id]/venue/route.ts`
- Create: `web/app/api/agents/[id]/positions/route.ts`
- Create: `web/lib/drift-read.ts`

- [ ] **Step 1: venue route (POST=enable, GET=status)** — auth con `requireAuth` + ownership via `getOwnedAgentOr404` (mismo patrón exacto del schedule route). POST: si ya hay row en `agent_trading_keys` → 409; si no, `Keypair.generate()` server-side, cifrar `bs58(secretKey)` con `encryptApiKey` de `web/lib/byok-crypto.ts`, insert `{agent_id, pubkey, ciphertext, iv}`, responder `{ pubkey }` (el secret NUNCA sale del server — regla de seguridad global). GET: `{ enabled, pubkey, floatBalanceUsdc }`.

- [ ] **Step 2: positions route (GET)** — `web/lib/drift-read.ts`: DriftClient read-only (wallet dummy) que deriva el user account del `pubkey` guardado y lee posiciones/uPnL/liq sin secret. Respuesta: `PerpPosition[]` del shape del adapter (Task 4) + items `awaiting-approval`/`queued` perp del schedule (la UI los pinta juntos).

- [ ] **Step 3: Smoke + commit** — `curl` POST venue → pubkey; GET positions → `[]`.
`git commit -m "feat(perps): venue enable endpoint (encrypted trading key) + positions read API"`

---

### Task 9: UI — Positions panel, Venue card, e2e

**Files:**
- Create: `web/components/positions-panel.tsx`, `web/components/venue-card.tsx`
- Modify: `web/app/agent/[id]/page.tsx` (montar ambos en la grilla de TerminalPanel existente)
- Create: `web/tests/e2e/perps.spec.ts`

- [ ] **Step 1: Componentes** — estética Operator Console existente (`TerminalPanel`, `Readout`, tokens noir — NO inventar estilos nuevos). `positions-panel.tsx`: client component, poll de `/api/agents/[id]/positions` cada 15s; por posición: `market · SIDE ×lev · margin · entry · mark · uPnL (verde/rojo) · SL/TP · liq est.`; entradas condicionales pendientes con su trigger label (`describeTrigger` ya existe) y badge `awaiting-approval` cuando aplica. `venue-card.tsx`: estado del venue (GET), botón enable (POST, muestra pubkey), balance float, link al faucet devnet de Drift para fondear.

- [ ] **Step 2: e2e Playwright**

```typescript
// web/tests/e2e/perps.spec.ts — mocks de red (page.route) para /api/agents/*/positions
// y /api/agent/chat (fixture con action perpOrder + echo):
// 1. agent page renderiza venue card "disabled" → click enable → pubkey visible
// 2. chat: tipear "abrime un long de sol x4 con 300 usdc si baja hasta 64" →
//    el echo estructurado aparece en la conversación (LONG SOL-PERP ×4 ...)
// 3. schedule muestra el item con trigger "SOL ≤ $64.00"
// 4. positions fixture con 1 posición → panel muestra LONG ×4, uPnL, liq
```

Run: `cd web && pnpm test:e2e -- perps.spec.ts` → Expected: 4 passed.

- [ ] **Step 3: Commit** — `git commit -m "feat(perps): positions panel + venue card (operator console skin), e2e"`

---

### Task 10: Env, docs y verificación final

**Files:**
- Modify: `docs/architecture.md` (sección "Perps — Phase 1"), `web/.env.example` si existe
- Verify: suite completa

- [ ] **Step 1: Envs** — documentar: `DRIFT_ENABLED`, `DRIFT_ENV=devnet`, `DRIFT_RPC_URL` (web + worker + Trigger.dev dashboard + Vercel). Defaults seguros: deshabilitado.

- [ ] **Step 2: Docs** — `architecture.md`: diagrama del flujo NL→policy→schedule→worker→Drift (condensar de la spec), tabla de envs, y nota explícita: "pay/swap autonomous dispatch sigue deferred (Phase 1.1); perps fue el primer leg".

- [ ] **Step 3: Verificación completa (evidencia antes de declarar éxito)**

```bash
cd ~/projects/saw/web && pnpm vitest run && pnpm lint && pnpm build
cd ~/projects/saw/worker && pnpm vitest run && npx tsc --noEmit
cd ~/projects/saw/web && pnpm test:e2e
```

Expected: todo verde. Después, UNA pasada real end-to-end en devnet: agente con venue enabled + item perp-open con trigger `below` apenas arriba del precio actual (dispara en el próximo wake) → verificar posición real en Drift devnet + SL visible + status `done` + tx_signature en DB.

- [ ] **Step 4: Commit final** — `git commit -m "docs(perps): architecture + env reference, phase 1 complete"`

---

## Fuera de scope (NO implementar — spec §YAGNI)

Multi-venue, modificar posición (add margin/partial close/mover stops), mainnet, estrategias autónomas, personas ≠ greedie, superficie Telegram para perps, dispatch autónomo de pay/swap (sigue Phase 1.1).

## Orden y dependencias

Task 1 (spike) → Task 2 (migración, GATE Juan) → Task 3 (policy) → Task 4 (adapter, depende de 1) → Task 5 (persistencia, depende de 2+3) → Task 6 (tools, depende de 3+5) → Task 7 (worker, depende de 2,3,4,5) → Task 8 (venue, depende de 2) → Task 9 (UI, depende de 6+8) → Task 10 (cierre).
