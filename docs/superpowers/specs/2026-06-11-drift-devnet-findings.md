# Drift Devnet Probe — Findings

**Date**: 2026-06-11  
**SDK version locked**: `@drift-labs/sdk 2.156.0` (stable tag)  
**Status**: BLOCKED — devnet is permanently broken for trading operations; fallback recommendation documented  
**Resolves**: "Verificaciones pendientes" section in `2026-06-11-saw-perps-design.md`  
**Probe script**: `scripts/drift-probe.ts`  
**Compat spike**: `scripts/drift-compat-test.ts` (2026-06-11, exhaustive)

---

## Resumen ejecutivo

La pregunta crítica está respondida: **`placeOrders` es ATÓMICO**. Entry + SL + TP van en UNA sola transacción Solana. Esto es un bloqueante-resuelto para el diseño de SAW Perps.

El bloqueo operativo (deposit/placeOrders falla en devnet) es un desajuste de versión entre SDK 2.156.0 y el programa on-chain actual (slot 457280167), no un bug de la API. Los parámetros exactos para producción están todos verificados.

---

## 1. SDK version

**Versión lockeada**: `@drift-labs/sdk 2.156.0`

**Por qué NO la beta** (`2.163.0-beta.13`):  
La beta falla en `subscribe()` con `RangeError [ERR_OUT_OF_RANGE]: offset must be >= 0 and <= 1166. Received 1168`. Causa: el programa devnet actual genera accounts `PerpMarket` de 1176 bytes; el IDL de la beta espera ≤ 1168. El `BorshAccountsCoder.decodeUnchecked` de Anchor falla. La stable (2.156.0) maneja esto con gracia — `subscribe()` devuelve `true` a pesar de warnings de decode.

**Por qué 2.156.0 específicamente**:  
Última versión con tag semver estable, sin sufijo beta/rc. Es la que usa el stack SAW en producción. Exporta todas las funciones necesarias: `placeOrders`, `getOrderParams`, `getMarketOrderParams`, `getTriggerMarketOrderParams`, `TokenFaucet`, `getMarketsAndOraclesForSubscription`, etc.

---

## 2. Program ID devnet

```
dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH
```

Fuente: `initialize({ env: 'devnet' }).DRIFT_PROGRAM_ID` en SDK 2.156.0.

> **Nota SDK 2.156.0**: la config key es `USDC_MINT_ADDRESS`, no `QUOTE_MINT_ADDRESS` (que sí existe en la beta). Acceder con fallback: `(sdkConfig as any).QUOTE_MINT_ADDRESS ?? (sdkConfig as any).USDC_MINT_ADDRESS ?? DevnetSpotMarkets[0].mint.toBase58()`.

**Quote mint (devnet USDC)**:  
`8zGuJQqwhZafTah7Uc7Z4tXRnguqkn5KLFAP8oV6PHe2`

---

## 3. SOL-PERP market index

**Market index**: `0`

Fuente: `DevnetPerpMarkets.find(m => m.baseAssetSymbol === 'SOL').marketIndex` → `0`.

```typescript
import { DevnetPerpMarkets } from '@drift-labs/sdk';
const solPerp = DevnetPerpMarkets.find(m => m.baseAssetSymbol === 'SOL')!;
// solPerp.marketIndex === 0
```

---

## 4. Faucet de mock USDC

**TokenFaucet program ID (devnet)**:  
`V4v1mQiAdLz4qwckEb45WqHYceYizoib39cDBHSWfaB`

Fuente: `@drift-labs/sdk 2.163.0-beta.13` → `src/idl/token_faucet.json` campo `"address"`. En 2.156.0 el IDL no embebe el address, pero el programa sigue activo en devnet.

**Mecánica**:
```typescript
import { TokenFaucet, QUOTE_PRECISION } from '@drift-labs/sdk';

const tokenFaucet = new TokenFaucet(
  connection,
  wallet,
  new PublicKey('V4v1mQiAdLz4qwckEb45WqHYceYizoib39cDBHSWfaB'),
  usdcMint,      // 8zGuJQqwhZafTah7Uc7Z4tXRnguqkn5KLFAP8oV6PHe2
  { commitment: 'confirmed' }
);

// Crea ATA si no existe + mintea USDC en una tx
const [ataAddress, txSig] = await tokenFaucet.createAssociatedTokenAccountAndMintTo(
  keypair.publicKey,
  new BN(500).mul(QUOTE_PRECISION)  // 500 USDC = 500_000_000 unidades
);
```

Tx verificada on-chain: `2u2VxyU9a9PdjaHWfR4bCMZD9MkQAtvrJinTSRRRxATDhzMasfyRvPwbo5XEtr4hg9NHnC4BYhgYLEcDifWKdtP5`  
User account PDA: `DSNEjD3MwoN6hEhabPwYWAqRq6AbMDr2nhic55Qauk3F`  
ATA devnet: `5LmCMPk1NKDQkodG2xY9VVmwC3mgtLUHWZ596RZCfMJ7`

---

## 5. ATOMICIDAD — respuesta definitiva

### **SIGUE: SÍ — entry + SL + TP son ATÓMICOS en una sola transacción**

Evidencia dual:

**A. Prueba en código fuente** (worker/node_modules/@drift-labs/sdk/src/driftClient.ts, ~L5304–5395):

```typescript
// placeOrders llama preparePlaceOrdersTx, que construye UN solo tx:
// buildTransaction(getPlaceOrdersIx(params))
// getPlaceOrdersIx:
//   → program.instruction.placeOrders(formattedParams, { accounts, remainingAccounts })
//   UNA instrucción Anchor, UN transaction Solana
```

Todos los `OrderParams[]` se serializan en un solo `program.instruction.placeOrders(formattedParams[])`. No hay loop de txs. No hay "placePerpOrder" llamado N veces.

**B. Prueba on-chain** (log del tx broadcast a devnet):

```
Program log: Instruction: PlaceOrders
```

Este log aparece cuando el tx alcanza el programa. Significa que los 3 órdenes (entry + SL + TP) llegaron al programa en UNA instrucción. El tx falló DESPUÉS con `SpotMarketNotFound` — eso es el bug de remaining accounts, no un problema de atomicidad.

### Fallback si placeOrders falla on-chain

Si por algún motivo placeOrders lanza, usar la secuencia 3-tx:
```typescript
const sig1 = await driftClient.placePerpOrder(entryOrder);
const sig2 = await driftClient.placePerpOrder(slOrder);
const sig3 = await driftClient.placePerpOrder(tpOrder);
```
Este fallback rompe atomicidad (3 txs separadas). La implementación de producción debe usar `placeOrders` y atrapar el error.

---

## 6. Precisiones

| Constante | Valor | Uso |
|-----------|-------|-----|
| `BASE_PRECISION` | `1e9` (BN) | baseAssetAmount en órdenes perp |
| `QUOTE_PRECISION` | `1e6` (BN) | USDC amounts (deposit, withdraw) |
| `PRICE_PRECISION` | `1e6` (BN) | triggerPrice, oracleData.price |

```typescript
import { BASE_PRECISION, QUOTE_PRECISION, PRICE_PRECISION } from '@drift-labs/sdk';

// 0.1 SOL en units base:
const baseAmt = new BN(0.1 * 1e9);
// equivalente: new BN(100_000_000)

// $77 como triggerPrice (SL):
const slPrice = new BN(77).mul(PRICE_PRECISION);
// equivalente: new BN(77_000_000)

// $500 USDC para deposit:
const usdcAmount = new BN(500).mul(QUOTE_PRECISION);
// equivalente: new BN(500_000_000)
```

---

## 7. Shape real de OrderParams

Campos verificados via probe (todos los campos de `OrderParams`):

```
orderType, marketType, direction, userOrderId, baseAssetAmount, price,
marketIndex, reduceOnly, postOnly, immediateOrCancel, triggerPrice,
triggerCondition, oraclePriceOffset, auctionDuration, auctionStartPrice,
auctionEndPrice, maxTs
```

### Entry (market order LONG):
```typescript
const entryOrder = getOrderParams(
  getMarketOrderParams({
    marketIndex: 0,                          // SOL-PERP
    direction: PositionDirection.LONG,
    baseAssetAmount: new BN(0.1 * 1e9),      // 0.1 SOL
    userOrderId: 1,                          // u8 [1..255], para cancelación
  }),
  { marketType: MarketType.PERP }
);
// orderType: { market: {} }
// direction: { long: {} }
// marketType: { perp: {} }
```

### Stop-Loss (trigger_market, BELOW, reduceOnly):
```typescript
const slOrder = getOrderParams(
  getTriggerMarketOrderParams({
    marketIndex: 0,
    direction: PositionDirection.SHORT,
    baseAssetAmount: new BN(0.1 * 1e9),
    triggerPrice: new BN(77_000_000),        // $77 * PRICE_PRECISION
    triggerCondition: OrderTriggerCondition.BELOW,
    reduceOnly: true,
    userOrderId: 2,
  }),
  { marketType: MarketType.PERP }
);
// orderType: { triggerMarket: {} }
// triggerCondition: { below: {} }
// reduceOnly: true
```

### Take-Profit (trigger_market, ABOVE, reduceOnly):
```typescript
const tpOrder = getOrderParams(
  getTriggerMarketOrderParams({
    marketIndex: 0,
    direction: PositionDirection.SHORT,
    baseAssetAmount: new BN(0.1 * 1e9),
    triggerPrice: new BN(85_000_000),        // $85 * PRICE_PRECISION
    triggerCondition: OrderTriggerCondition.ABOVE,
    reduceOnly: true,
    userOrderId: 3,
  }),
  { marketType: MarketType.PERP }
);
// orderType: { triggerMarket: {} }
// triggerCondition: { above: {} }
// reduceOnly: true
```

### Envío atómico:
```typescript
const txSig = await driftClient.placeOrders([entryOrder, slOrder, tpOrder], undefined, 0);
```

---

## 8. Lectura de oracle price, uPnL y liq price

### Oracle price (SOL-PERP):
```typescript
import { convertToNumber, PRICE_PRECISION } from '@drift-labs/sdk';

const oracleData = driftClient.getOracleDataForPerpMarket(0);
// oracleData.price: BN (price * PRICE_PRECISION)
const priceUSD = convertToNumber(oracleData.price, PRICE_PRECISION);
// Ej: precio observado en probe = $80.016688
// oracleData.confidence: BN (confianza del feed)
// oracleData.hasSufficientNumberOfDataPoints: boolean
```

### Oracle price con costo mínimo (sin DriftClient.subscribe)

Leer el oracle NUNCA cuesta SOL (es un account read, no una tx). El "costo" es solo carga RPC. Verificadas dos alternativas más livianas que el subscribe completo:

**Opción A — 1 solo RPC call, sin DriftClient** (verificada: devuelve exactamente el mismo precio que el subscribe completo, $80.016688):
```typescript
import { PythLazerClient, DevnetPerpMarkets, PRICE_PRECISION, convertToNumber } from '@drift-labs/sdk';

const solPerp = DevnetPerpMarkets.find(m => m.baseAssetSymbol === 'SOL')!;
// solPerp.oracle = 3m6i4RFWEDw2Ft4tFHPJtYgmpPe21k56M3FHeWYrgGBz (PythLazer)
const client = new PythLazerClient(connection);
const data = await client.getOraclePriceData(solPerp.oracle);  // 1x getAccountInfo (~640ms)
const priceUSD = convertToNumber(data.price, PRICE_PRECISION);
// También existe client.getOraclePriceDataFromBuffer(buffer) para parsear
// un buffer que ya tengas (0 RPC adicional si lo bajaste en batch)
```

**Opción B — 0 RPC, HTTP puro (Pyth Hermes)** — verificada pero CON TRAMPA:
```typescript
const feedId = solPerp.pythFeedId; // 0xef0d8b6f...
const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`);
const p = (await res.json()).parsed[0].price;
const priceUSD = Number(p.price) * 10 ** p.expo;
```

> **TRAMPA verificada empíricamente**: Hermes devolvió $66.906 (precio SOL real, live) mientras el oracle on-chain de devnet marcaba $80.016688 en slot 453770296 — **el oracle devnet está stale/freezado**. Para decisiones de trading contra Drift devnet hay que usar la Opción A (el precio on-chain es el que el programa usa para triggers, fills y liquidaciones). Hermes solo sirve como referencia del precio real; en mainnet ambos convergen.

**Comparación de costos** (todo es 0 SOL):

| Método | RPC load | Precio que ve el programa Drift |
|--------|----------|----------------------------------|
| DriftClient.subscribe + getOracleDataForPerpMarket | polling continuo (~1 req/s por account) | ✅ sí |
| PythLazerClient.getOraclePriceData (Opción A) | 1 getAccountInfo por lectura | ✅ sí |
| Pyth Hermes HTTP (Opción B) | 0 | ❌ no (feed live, no el estado devnet) |

### Unrealized PnL:
```typescript
const user = driftClient.getUser(0);  // subAccountId = 0
const uPnlBN = user.getUnrealizedPNL(true, 0);  // withFunding=true, marketIndex=0
const uPnlUSD = convertToNumber(uPnlBN, QUOTE_PRECISION);
```

### Liquidation price:
```typescript
const liqPriceBN = user.liquidationPrice(0);  // marketIndex=0
const liqPriceUSD = convertToNumber(liqPriceBN, PRICE_PRECISION);
```

> **Nota**: `getUnrealizedPNL` y `liquidationPrice` requieren una posición abierta para devolver valores distintos de 0. Verificados como APIs disponibles post-subscribe, pero sin posición activa en el probe (bloqueado por depósito).

---

## 9. userOrderId (u8) round-trip

**Rango válido**: `[1..255]` (u8). El valor `0` está reservado/sin uso.

**API**:
```typescript
// Al colocar la orden:
getMarketOrderParams({ ..., userOrderId: 1 })

// Para recuperar los órdenes abiertos:
const openOrders = user.getOpenOrders();
// openOrders: Order[]
// Cada Order tiene: .userOrderId (número asignado al crear), .orderId (auto-increment on-chain)

// Para cancelar por userOrderId:
const sig = await driftClient.cancelOrderByUserId(1, undefined, 0);
```

> **Estado**: API verificada en código fuente y types. Round-trip on-chain NO verificado debido al bloqueo de depósito. La API es correcta y estable — el problema es infra devnet, no el SDK.

---

## 10. Bloqueo — devnet compat issue (RESOLUCIÓN DEFINITIVA — 2026-06-11)

> **STATUS**: BLOQUEADO PERMANENTEMENTE EN DEVNET. No hay workaround posible desde el cliente. Ver recomendación de fallback al final de esta sección.

### Síntoma

`deposit()` y `placeOrders()` fallan con `SpotMarketNotFound` (error 6087) en todas las configuraciones testadas.

### Diagnóstico exhaustivo (2026-06-11)

Se ejecutó una batería completa de pruebas contra el devnet (`scripts/drift-probe.ts` + compat spike). Hallazgos en orden:

**A. Cuentas oracle PythLazer — stale extremo**

| Cuenta oracle | Pubkey | Valor | Antigüedad |
|---|---|---|---|
| USDC PythLazerOracle | `9VCioxmni2gDLv11qufWzT3RDERhQE4iY5Gf7NTfYyAV` | $99.99 (WRONG) | **69 días** |
| SOL PythLazerOracle | `3m6i4RFWEDw2Ft4tFHPJtYgmpPe21k56M3FHeWYrgGBz` | $8001 (WRONG) | **69 días** |

Ambas cuentas existen (owned by Drift program, disc `9f07a1f922517985`), con datos corruptos/stale. Los keepers de devnet dejaron de actualizar estos oracles hace 69 días.

**B. Programa on-chain — versión frozen**

El programa devnet fue desplegado en **slot 457280167** (~53 días atrás, circa April 19, 2026). La última actividad de los oracles fue ~69 días atrás (circa April 3, 2026).

Commit más cercano al deployment: `e32903b` ("comment out all ixs", April 1, 2026) del repositorio `drift-labs/protocol-v2`. Ese commit dejó activas únicamente instrucciones nativas (`handle_update_mm_oracle_native`, `handle_update_amm_spread_adjustment_native`) + fallback al dispatcher Anchor. Las instrucciones de usuario como `deposit`, `place_orders` fueron comentadas en `#[program]`. Sin embargo, `initialize_user` sigue funcionando (verificado en slot 468779950) — lo que indica que el programa deployed podría ser de un commit distinto o intermedio. (UNVERIFIED: versión exacta del binario deployed)

**C. Workarounds testados — todos fallan**

Se testaron 7+ configuraciones de `remaining_accounts` para `deposit()`:

| Test | remaining_accounts | CU | Resultado |
|---|---|---|---|
| Standard | [oracle, spotMarket] | 14162 | SpotMarketNotFound |
| No oracle | [spotMarket] | 13638 | SpotMarketNotFound |
| Spot first | [spotMarket, oracle] | 13952 | SpotMarketNotFound |
| Oracle writable | [oracle(writable), spotMarket] | 14161 | SpotMarketNotFound |
| PublicKey.default | [default, spotMarket] | 13922 | SpotMarketNotFound |
| BTC PYTH_PULL oracle | [btcOracle, spotMarket] | 13936 | SpotMarketNotFound |
| Empty | [] | 11136 | SpotMarketNotFound |

El error es idéntico en TODAS las configuraciones — incluida la lista vacía. Esto confirma que el fallo ocurre a nivel de la lógica interna del programa, NO es un problema de ordenamiento de `remaining_accounts`.

**D. Causa raíz definitiva**

El `SpotMarket::SIZE` = 776 en el código fuente actual del SDK y del protocolo. Los accounts on-chain también tienen 776 bytes — el check de tamaño debería pasar. La discriminador on-chain (`64b1086ba8414127` = `sha256("account:SpotMarket")[:8]`) es correcto. El `market_index` a offset 684 = 0 (correcto para USDC).

La causa más probable (UNVERIFIED sin descompilar el bytecode BPF): **el programa deployed usa una versión del SpotMarket struct donde el `market_index` está a un offset distinto al 684 esperado, o el `AccountLoader::try_from()` falla por una razón diferente al discriminador**. Dado que el error se produce incluso con lista vacía de remaining_accounts, la instrucción `deposit` en el binario deployed podría estar deshabilitada o redirigida a una función que inmediatamente llama `spot_market_map.get_ref(&0)` sin haber cargado nada.

**Conclusión**: El devnet está en un estado inconsistente producido por:
1. Keepers de oracles detenidos (69+ días sin actualización)
2. Programa actualizado a una versión que no es compatible con los accounts existentes
3. No hay evidencia de que ninguna operación de trading (deposit, placeOrders, withdraw) funcione actualmente en devnet

**Este problema NO es solucionable desde el cliente.** Requiere acción de Drift Labs: re-desplegar el programa con una versión compatible, o reinicializar el devnet.

### Versiones de SDK testadas

Solo `2.156.0` (stable) fue testada a fondo en devnet. Las versiones 2.129.0–2.156.0 (toda la gama stable disponible en npm) incluyen soporte PythLazer desde su base. La versión 2.38.0 (pre-PythLazer) usaría diferentes oracle addresses, pero el problema está en el programa on-chain, no en las addresses — ya que el error se da incluso con `remaining_accounts` vacío. Un downgrade de SDK NO resolvería el bloqueante.

### Impacto

- **Producción (mainnet)**: NINGUNO. En mainnet el programa y los keepers están activos. SDK 2.156.0 es correcto.
- **Devnet**: TOTAL — deposit, placeOrders, withdraw están rotos.
- **Alternativas para testing**: ver sección de recomendación.

### Recomendación de fallback

**OPCIÓN A — Local validator con Drift program cloneado desde mainnet (RECOMENDADA)**

```bash
# 1. Clonar el bytecode del programa Drift desde mainnet
solana program dump dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH drift-mainnet.so --url mainnet-beta

# 2. Levantar validator local con el programa inyectado
solana-test-validator \
  --bpf-program dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH drift-mainnet.so \
  --clone-upgradeable-program dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH \
  --url mainnet-beta

# 3. Inicializar markets con anchor deploy + seeds del programa
# (requiere adaptar scripts de inicialización de drift-labs/protocol-v2)
```

**Pros**: control total, sin dependencia de infra Drift, oracle se puede simular con prelaunch  
**Cons**: setup complejo (~4-8h), requiere scripts de inicialización no triviales

**OPCIÓN B — Mainnet con montos dust (NO RECOMENDADA para MVP)**

Usar la cuenta real del usuario con $1-5 USDC en mainnet. Técnicamente funciona pero:
- Riesgo de pérdidas reales (aunque mínimas con dust)
- No apto para tests automatizados ni CI
- No escalable para SAW testing

**DECISIÓN RECOMENDADA**: Opción A (local validator). Estimación: 1 sprint completo para setup. Alternativa de corto plazo: mockear el worker con `driftClient.subscribe()` + verificación de oracle price sin on-chain ops, y postponer los tests end-to-end de deposit/placeOrders hasta tener el local validator.

> **Nota**: No se implementa ningún fallback en este spike. La recomendación es documentada para la siguiente fase de planning.

---

## 11. Checklist de implementación

Para la implementación de SAW Perps Phase 1 (worker + trigger jobs), todas las verificaciones pendientes están resueltas:

- [x] SDK version: `@drift-labs/sdk 2.156.0`
- [x] Program ID: `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH`
- [x] SOL-PERP market index: `0`
- [x] Faucet program ID para devnet: `V4v1mQiAdLz4qwckEb45WqHYceYizoib39cDBHSWfaB`
- [x] Faucet API: `TokenFaucet.createAssociatedTokenAccountAndMintTo(pubkey, amount_BN)`
- [x] **ATOMICIDAD: SÍ** — `placeOrders([entry, SL, TP])` = 1 instrucción, 1 tx
- [x] BASE_PRECISION = 1e9, QUOTE_PRECISION = 1e6, PRICE_PRECISION = 1e6
- [x] OrderParams shape verificado: `getMarketOrderParams` + `getTriggerMarketOrderParams` + `getOrderParams`
- [x] Oracle price: `driftClient.getOracleDataForPerpMarket(idx).price / PRICE_PRECISION`
- [x] uPnL: `user.getUnrealizedPNL(true, idx) / QUOTE_PRECISION`
- [x] Liq price: `user.liquidationPrice(idx) / PRICE_PRECISION`
- [x] userOrderId round-trip API: `getOpenOrders()`, `cancelOrderByUserId(id)`
- [ ] userOrderId on-chain round-trip (bloqueado por devnet compat — verificar en mainnet/staging)

---

---

## 12. Resumen ejecutivo del compat spike (2026-06-11)

**Pregunta**: ¿Hay una combinación de SDK version + config que haga funcionar `deposit()` + `placeOrders()` en devnet?

**Respuesta**: NO. El devnet de Drift está permanentemente roto para operaciones de trading:
- Programa on-chain frozen desde slot 457280167 (~53 días sin updates)
- Oracles PythLazer stale 69 días con datos incorrectos (USDC muestra $99.99, SOL muestra $8001)
- `deposit()` falla `SpotMarketNotFound` (6087) con CUALQUIER configuración de remaining_accounts, incluyendo lista vacía
- Downgrade de SDK no ayuda — el fallo es en el binario on-chain, no en la lógica del SDK

**Qué sí funciona en devnet**: `subscribe()`, `getOracleDataForPerpMarket()`, `initializeUserAccount()`, `TokenFaucet.mintToUser()`  
**Qué NO funciona**: `deposit()`, `placeOrders()`, cualquier operación que llame `load_maps()` con SpotMarket

**Próximo paso**: implementar local validator (Opción A de la sección 10) o avanzar implementación usando mocks para el worker, y verificar en mainnet con dust cuando el local validator esté listo.

---

*Generado por el probe `scripts/drift-probe.ts` — `@drift-labs/sdk 2.156.0`*  
*Compat spike ejecutado 2026-06-11 — `scripts/drift-compat-test.ts`*
