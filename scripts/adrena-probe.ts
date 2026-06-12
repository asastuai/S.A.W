/**
 * scripts/adrena-probe.ts
 *
 * Adrena devnet spike — throwaway probe that documents the SDK truth.
 * Task 1c of SAW Perps Phase 1 (see docs/superpowers/plans/2026-06-11-saw-perps-phase1.md).
 *
 * RUN: cd ~/projects/saw && npx tsx scripts/adrena-probe.ts
 *
 * WHAT THIS PROVES (or fails to prove):
 *  1. SDK import surface (adrena-sdk-ts 1.0.0-beta.14)
 *  2. Devnet: program deployed + pool state existence
 *  3. createKitClient() with custom devnet RPC
 *  4. openMarketLong() with stopLossPrice → single tx (Jito bundle) — atomicity verified
 *  5. getPositionStatus() → entry/mark/PnL/SL fields
 *  6. closeLong() + cancelSLTP()
 *  7. Position type layout (from codama-generated) — no liq price field
 *
 * GOTCHAS DISCOVERED (see findings doc for full details):
 *  - adrena-sdk-ts 1.0.0-beta.14 published WITHOUT compiled JS (dist/src has .d.ts only,
 *    no .js runtime). The package is importable only when tsx resolves .ts source from
 *    the SDK's node_modules-side TS. At runtime this FAILS with ERR_MODULE_NOT_FOUND.
 *  - PrincipalToken = 'JITOSOL' | 'WBTC' | 'BONK' — NO bare 'SOL'. SOL exposure is
 *    via JITOSOL (Jito liquid-staked SOL), which tracks SOL price.
 *  - Devnet: program binary deployed (executable), but ZERO pool state (0 matching
 *    PDAs). The on-chain pool infrastructure for Adrena does not exist on devnet.
 *  - @solana/kit v2 (used by the Adrena SDK) is INCOMPATIBLE with @solana/web3.js v1
 *    (used by the rest of the SAW worker). They must coexist as separate sub-deps;
 *    the adapter module boundary must keep them isolated.
 *
 * STATUS: BLOCKED — probe cannot execute devnet transactions.
 * See docs/superpowers/specs/2026-06-11-adrena-devnet-findings.md for full analysis.
 */

// ─── SECTION 1: Type-level surface verification ────────────────────────────
// These imports verify the SDK type declarations are accessible. They will
// fail at RUNTIME because dist/src/*.js does not exist in beta.14.
// The types themselves are correct and document the real API shape.

// @ts-ignore — expected to fail at runtime (broken npm publish, types only)
import type { OpenMarketLongParams } from "adrena-sdk-ts/core";
// @ts-ignore
import type { GetPositionStatusParams } from "adrena-sdk-ts/core";

// Real imports from @solana/kit (what the SDK uses internally):
// These work because @solana/kit is a real dependency.
import { generateKeyPair, createKeyPairSignerFromBytes } from "@solana/kit";

// ─── SECTION 2: On-chain state probes via raw RPC ──────────────────────────
// Since the SDK runtime is broken, we probe devnet state directly via JSON-RPC.

const DEVNET_RPC = "https://api.devnet.solana.com";
const ADRENA_PROGRAM_ID = "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet";
// Mainnet pool PDA derived from seed "main-pool" (canonical per adrena-abi pools_manifest.json)
const MAINNET_POOL_PDA = "4bQRutgDJs6vuh6ZcWaPVXiQaBzbHketjbCDjL4oRN34";

async function rpcRequest(url: string, method: string, params: unknown[]): Promise<unknown> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await resp.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result;
}

async function probeDevnetState(): Promise<void> {
  console.log("\n=== PROBE 1: Program binary on devnet ===");
  const programInfo = await rpcRequest(DEVNET_RPC, "getAccountInfo", [
    ADRENA_PROGRAM_ID,
    { encoding: "base64" },
  ]) as { value: { executable: boolean; lamports: number } | null };
  if (programInfo.value) {
    console.log("  RESULT: program EXISTS on devnet");
    console.log("  executable:", programInfo.value.executable);
    console.log("  lamports:", programInfo.value.lamports);
    // executable=true confirms it is a deployed program (not just any account)
  } else {
    console.log("  RESULT: program NOT FOUND on devnet");
  }

  console.log("\n=== PROBE 2: Pool PDA state on devnet ===");
  const poolInfo = await rpcRequest(DEVNET_RPC, "getAccountInfo", [
    MAINNET_POOL_PDA,
    { encoding: "base64" },
  ]) as { value: null | { lamports: number; data: [string, string] } };
  if (poolInfo.value) {
    const dataLen = Buffer.from(poolInfo.value.data[0], "base64").length;
    console.log("  RESULT: pool PDA EXISTS on devnet (unexpected!)");
    console.log("  lamports:", poolInfo.value.lamports, "data bytes:", dataLen);
  } else {
    console.log("  RESULT: pool PDA DOES NOT EXIST on devnet");
    console.log("  => Adrena pool/custody infrastructure NOT deployed on devnet.");
    console.log("  => Trading is NOT possible against devnet.");
  }

  console.log("\n=== PROBE 3: All Adrena-owned accounts on devnet ===");
  const allAccounts = await rpcRequest(DEVNET_RPC, "getProgramAccounts", [
    ADRENA_PROGRAM_ID,
    { encoding: "base64", withContext: true },
  ]) as { value: Array<{ pubkey: string; account: { lamports: number; data: [string, string] } }> };
  const accounts = allAccounts.value;
  console.log(`  RESULT: ${accounts.length} accounts owned by Adrena on devnet`);
  // Mainnet has ~6887 accounts (positions, pools, custodies, user profiles…)
  // Devnet having only 7 tiny accounts confirms the pool state was never initialized
  for (const a of accounts) {
    const dataLen = Buffer.from(a.account.data[0], "base64").length;
    console.log(`    ${a.pubkey}  dataLen=${dataLen}  lamports=${a.account.lamports}`);
  }
  if (accounts.length < 20) {
    console.log("  => Pool/custody/oracle accounts missing (mainnet has ~6887).");
    console.log("  => DEVNET IS UNUSABLE FOR ADRENA TRADING.");
  }
}

// ─── SECTION 3: SDK surface documentation (no runtime execution) ────────────
// Documents what WOULD be the API if the package compiled correctly.
// This is the contract for the VenueAdapter implementation in Task 4.

function documentSdkApi(): void {
  console.log("\n=== SDK API SURFACE (from type declarations in beta.14) ===");

  console.log("\n  openMarketLong(params: OpenMarketLongParams): Promise<{txSignature, positionAddress}>");
  console.log("  params shape:");
  console.log("    wallet: TransactionSigner           // @solana/kit v2 signer");
  console.log("    rpc: Rpc<SolanaRpcApi>              // @solana/kit v2 RPC");
  console.log("    principalToken: 'JITOSOL'|'WBTC'|'BONK'  // NO bare 'SOL'");
  console.log("    collateralToken: 'USDC'|'JITOSOL'|'BONK'|'WBTC'");
  console.log("    collateralAmount: number            // in token units (e.g. 10 = 10 USDC)");
  console.log("    leverage: number                    // e.g. 3 = 3x");
  console.log("    stopLossPrice?: number              // USD price; OPTIONAL in type but required by policy");
  console.log("    takeProfitPrice?: number            // USD price; optional");

  console.log("\n  SL/TP ATOMICITY (verified from source: src/core/openMarketLong.ts):");
  console.log("    All instructions assembled in one array:");
  console.log("      1. [optional] initUserProfile ix");
  console.log("      2. getOpenLongIxs() — the actual open-position ix");
  console.log("      3. [if stopLossPrice] getSetStopLossLongIx() — uses SAME positionAddress");
  console.log("      4. [if takeProfitPrice] getTakeProfitLongIx() — uses SAME positionAddress");
  console.log("    Then: sendTransactionWithJito(ixns, …, [ADRENA_LOOKUP_TABLE_ADDRESS])");
  console.log("    => ATOMIC: entry + SL + TP in ONE Jito bundle. Same positionAddress derived");
  console.log("       client-side before sending, so SL/TP reference the correct position.");

  console.log("\n  closeLong(params: ClosePositionLongParams): Promise<{txSignature, positionAddress}>");
  console.log("  cancelSLTP(wallet, rpc, principalToken, side, cancelSL, cancelTP)");

  console.log("\n  getPositionStatus(params): Promise<{");
  console.log("    positionData: Position,   // raw on-chain account");
  console.log("    entryPrice: number,       // in USD (human-readable, already normalized)");
  console.log("    pythPrice: number,        // current oracle price (= mark price)");
  console.log("    sizeUsd: number,          // position size in USD");
  console.log("    pnl: number,              // after exit fee + interest");
  console.log("    preFeePnl: number,");
  console.log("    exitFee: number,");
  console.log("    totalInterest: string,");
  console.log("    assetAmount: number,");
  console.log("    openTime: Date, updateTime: Date");
  console.log("  }>  NOTE: NO liquidationPrice field — must calculate client-side.");

  console.log("\n  Position account fields (codama-generated, from on-chain IDL):");
  console.log("    price: bigint             // entry price (scaled by 10^PRICE_DECIMALS=10)");
  console.log("    sizeUsd: bigint");
  console.log("    collateralUsd: bigint");
  console.log("    stopLossIsSet: number     // 0 or 1");
  console.log("    stopLossLimitPrice: bigint");
  console.log("    stopLossClosePositionPrice: bigint");
  console.log("    takeProfitIsSet: number");
  console.log("    takeProfitLimitPrice: bigint");
  console.log("    liquidationFeeUsd: bigint // fee to pay at liquidation, NOT the trigger price");
  console.log("    => liquidationPrice: NOT a stored field. Must be derived:");
  console.log("       liqPrice ≈ entryPrice × (1 - (collateralUsd - maintenanceMargin) / sizeUsd)");
  console.log("       for long. The protocol does not expose it directly in the Position struct.");

  console.log("\n  PRECISION CONSTANTS:");
  console.log("    PRICE_DECIMALS = 10  (prices stored as price × 10^10)");
  console.log("    USD_DECIMALS = 6     (USD amounts stored × 10^6)");
  console.log("    SOL_DECIMALS = 9");
  console.log("    BPS = 10000");
  console.log("    leverage input is a raw number (e.g. 3), SDK multiplies by BPS internally");

  console.log("\n  JITOSOL vs SOL:");
  console.log("    principalToken='JITOSOL' gives SOL-correlated exposure.");
  console.log("    The oracle for JITOSOL uses Pyth SOL/USD feed.");
  console.log("    For SAW perps 'SOL-PERP' market, the actual token is JITOSOL.");
  console.log("    The VenueAdapter must translate 'SOL-PERP' → principalToken='JITOSOL'.");
}

// ─── SECTION 4: SDK runtime status ──────────────────────────────────────────
async function probeRuntimeImport(): Promise<void> {
  console.log("\n=== PROBE 4: SDK runtime import status ===");
  try {
    // Dynamic import — will fail because dist/src/*.js does not exist in beta.14
    const sdk = await import("adrena-sdk-ts");
    console.log("  RESULT: import SUCCEEDED (unexpected)");
    console.log("  exports:", Object.keys(sdk).slice(0, 10));
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    console.log("  RESULT: import FAILED (expected for beta.14)");
    console.log("  code:", e.code);
    console.log("  message:", e.message?.split("\n")[0]);
    console.log("  => adrena-sdk-ts@beta.14 ships type declarations but NO compiled JS.");
    console.log("  => The package.json exports point to dist/src/index.js which does not exist.");
    console.log("  => This is a broken npm publish. The SDK is usable for type annotations only.");
    console.log("  => Runtime usage requires building from GitHub source or waiting for a fixed publish.");
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("=== Adrena Devnet Probe — SAW Perps Task 1c ===");
  console.log("SDK: adrena-sdk-ts 1.0.0-beta.14");
  console.log("Date:", new Date().toISOString());
  console.log("Goal: document SDK truth and devnet state for VenueAdapter design");

  await probeDevnetState();
  documentSdkApi();
  await probeRuntimeImport();

  console.log("\n=== SUMMARY ===");
  console.log("STATUS: BLOCKED");
  console.log("PRIMARY BLOCKER: Adrena devnet has zero pool/custody state.");
  console.log("  Program binary deployed, but no initialized pools = no trading.");
  console.log("SECONDARY BLOCKER: adrena-sdk-ts@1.0.0-beta.14 has no compiled JS.");
  console.log("  Types are correct and document the real API shape.");
  console.log("  Runtime requires building from source.");
  console.log("KEY FINDING (architecture-altering):");
  console.log("  SL/TP IS ATOMIC with position open — single Jito bundle.");
  console.log("  This satisfies spec rule: 'exits live on the venue, survive our worker being down'.");
  console.log("  Once live (from GitHub source or mainnet), the spec holds.");
  console.log("See: docs/superpowers/specs/2026-06-11-adrena-devnet-findings.md");
}

main().catch((e) => {
  console.error("probe fatal:", e);
  process.exit(1);
});
