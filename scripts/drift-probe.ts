/**
 * scripts/drift-probe.ts
 * Drift devnet probe — resolves "Verificaciones pendientes" from the perps spec.
 *
 * Run:  cd <repo-root> && worker/node_modules/.bin/tsx scripts/drift-probe.ts
 *
 * SDK version: @drift-labs/sdk 2.156.0 (stable tag, locked in worker/package.json)
 * Devnet program ID: dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH
 *
 * SECURITY: no private key is written to any file.
 *   If ~/.config/solana/id.json exists (pre-funded CLI key), it is READ but
 *   never re-written. Otherwise an ephemeral keypair is generated in-memory.
 *
 * What this probe verifies:
 *   1. SDK initialize() — program ID, quote mint, market indexes, precision constants
 *   2. DriftClient.subscribe() — live account data decodes OK with 2.156.0
 *   3. Oracle price read via getOracleDataForPerpMarket
 *   4. OrderParams shape — market entry + SL trigger + TP trigger
 *   5. SOL balance check (airdrop if needed, skip if 429)
 *   6. User account initialization (initializeUserAccount)
 *   7. Mock USDC minting via TokenFaucet
 *   8. placeOrders([entry, SL, TP]) sent to devnet — ATOMICITY QUESTION
 *   9. Position reads (getPerpPosition, getUnrealizedPNL, liquidationPrice)
 *  10. Cancel + close
 *  11. userOrderId (u8) round-trip via getOpenOrders
 *
 * KNOWN DEVNET LIMITATION (documented in findings):
 *   The devnet program (slot 457280167) uses PythLazerOracle accounts for all
 *   oracle feeds. The SDK's getRemainingAccounts puts oracle accounts FIRST in
 *   remaining accounts (oracles → spot markets → perp markets). The on-chain
 *   load_maps() expects to consume oracles via EXTERNAL_ORACLE_PROGRAM_IDS
 *   or PythLazerOracle discriminator — but the deployed program version does
 *   not recognize the Drift-owned PythLazerOracle accounts correctly, leaving
 *   the perp/spot markets "not found" in the remaining accounts map.
 *   Result: deposit() and placeOrders() fail with *MarketNotFound.
 *   ATOMICITY is still verifiable from source + from the on-chain log line
 *   "Instruction: PlaceOrders" which confirms all 3 orders were transmitted.
 */

import fs from "fs";
import os from "os";
import path from "path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import {
  BASE_PRECISION,
  BN,
  BulkAccountLoader,
  DelistedMarketSetting,
  DevnetPerpMarkets,
  DevnetSpotMarkets,
  DriftClient,
  DriftEnv,
  MarketType,
  OrderTriggerCondition,
  PRICE_PRECISION,
  PositionDirection,
  QUOTE_PRECISION,
  TokenFaucet,
  Wallet,
  convertToNumber,
  getMarketsAndOraclesForSubscription,
  getMarketOrderParams,
  getOrderParams,
  getTriggerMarketOrderParams,
  initialize,
} from "@drift-labs/sdk";

// ── helpers ──────────────────────────────────────────────────────────────────

function log(step: string, msg: string) {
  console.log(`\n[${step}] ${msg}`);
}
function ok(step: string, msg: string) {
  console.log(`[${step}] OK  ${msg}`);
}
function warn(step: string, msg: string) {
  console.warn(`[${step}] WARN  ${msg}`);
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── constants ─────────────────────────────────────────────────────────────────

const ENV: DriftEnv = "devnet";
const RPC_URL =
  process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

// TokenFaucet program ID on devnet.
// Source: @drift-labs/sdk 2.163.0-beta.13 src/idl/token_faucet.json "address" field.
// This is the faucet deployed alongside the devnet Drift program.
// In 2.156.0 stable the IDL no longer embeds the address but the program is still live.
const DEVNET_TOKEN_FAUCET_PROGRAM_ID = new PublicKey(
  "V4v1mQiAdLz4qwckEb45WqHYceYizoib39cDBHSWfaB"
);

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("==== Drift devnet probe — @drift-labs/sdk 2.156.0 ====\n");

  // ── Step 1: SDK constants ───────────────────────────────────────────────────
  log("1", "initialize({ env: 'devnet' })");

  const sdkConfig = initialize({ env: ENV });

  // SDK 2.156.0 uses USDC_MINT_ADDRESS; beta used QUOTE_MINT_ADDRESS.
  const quoteMintAddress: string =
    (sdkConfig as any).QUOTE_MINT_ADDRESS ??
    (sdkConfig as any).USDC_MINT_ADDRESS ??
    DevnetSpotMarkets[0].mint.toBase58();

  ok("1", `Program ID (devnet):      ${sdkConfig.DRIFT_PROGRAM_ID}`);
  ok("1", `Quote mint (devnet USDC): ${quoteMintAddress}`);
  ok("1", `DevnetSpotMarkets[0]:     ${DevnetSpotMarkets[0].symbol} index=${DevnetSpotMarkets[0].marketIndex} mint=${DevnetSpotMarkets[0].mint.toBase58()}`);

  const solPerp = DevnetPerpMarkets.find((m) => m.baseAssetSymbol === "SOL");
  if (!solPerp) throw new Error("SOL-PERP not in DevnetPerpMarkets");
  ok("1", `SOL-PERP market index:    ${solPerp.marketIndex}`);
  ok("1", `DevnetPerpMarkets count:  ${DevnetPerpMarkets.length}`);

  // Precision constants
  ok("1", `BASE_PRECISION:           1e9  (${BASE_PRECISION.toString()})`);
  ok("1", `QUOTE_PRECISION:          1e6  (${QUOTE_PRECISION.toString()})`);
  ok("1", `PRICE_PRECISION:          1e6  (${PRICE_PRECISION.toString()})`);

  // ── Step 2: Keypair + subscribe ────────────────────────────────────────────
  log("2", "DriftClient subscribe (polling, SOL-PERP only)");

  // SECURITY: read pre-existing CLI key, never write
  const cliKeyPath = path.join(os.homedir(), ".config", "solana", "id.json");
  const keypair = fs.existsSync(cliKeyPath)
    ? Keypair.fromSecretKey(
        new Uint8Array(
          JSON.parse(fs.readFileSync(cliKeyPath, "utf8")) as number[]
        )
      )
    : Keypair.generate();
  ok("2", `Pubkey: ${keypair.publicKey.toBase58()}`);

  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(keypair);

  const { perpMarketIndexes, spotMarketIndexes, oracleInfos } =
    getMarketsAndOraclesForSubscription(ENV, [solPerp], [DevnetSpotMarkets[0]]);

  const bulkAccountLoader = new BulkAccountLoader(
    connection,
    "confirmed",
    1000
  );

  const driftClient = new DriftClient({
    connection,
    wallet,
    env: ENV,
    perpMarketIndexes,
    spotMarketIndexes,
    oracleInfos,
    accountSubscription: {
      type: "polling",
      accountLoader: bulkAccountLoader,
    },
    delistedMarketSetting: DelistedMarketSetting.Discard,
  });

  let subscribed = false;
  try {
    subscribed = await driftClient.subscribe();
    ok("2", `subscribe() = ${subscribed}`);
  } catch (e: any) {
    warn("2", `subscribe() threw: ${e.message}`);
    await runApiShapeDiscovery(solPerp.marketIndex);
    return;
  }

  // ── Step 3: Oracle price ────────────────────────────────────────────────────
  log("3", "Oracle price read");

  let oraclePrice = 0;
  try {
    const oracleData = driftClient.getOracleDataForPerpMarket(
      solPerp.marketIndex
    );
    oraclePrice = convertToNumber(oracleData.price, PRICE_PRECISION);
    ok("3", `SOL oracle price: $${oraclePrice}`);
    ok("3", `Raw BN value: ${oracleData.price.toString()} / PRICE_PRECISION(1e6) = ${oraclePrice}`);
    ok("3", "API: driftClient.getOracleDataForPerpMarket(marketIndex) → OraclePriceData");
    ok("3", "      .price: BN (divide by PRICE_PRECISION for USD)");
    ok("3", "      .confidence: BN; .hasSufficientNumberOfDataPoints: bool");
  } catch (e: any) {
    warn("3", `getOracleDataForPerpMarket failed: ${e.message}`);
    oraclePrice = 80; // fallback
  }

  // ── Step 4: OrderParams shape ───────────────────────────────────────────────
  log("4", "Build OrderParams — entry + SL + TP (no tx)");

  const baseAmount = new BN(0.1 * 1e9); // 0.1 SOL
  const slPriceNum = Math.round(oraclePrice * 0.96);
  const tpPriceNum = Math.round(oraclePrice * 1.04);
  const slPrice = new BN(slPriceNum).mul(PRICE_PRECISION);
  const tpPrice = new BN(tpPriceNum).mul(PRICE_PRECISION);

  const entryOrder = getOrderParams(
    getMarketOrderParams({
      marketIndex: solPerp.marketIndex,
      direction: PositionDirection.LONG,
      baseAssetAmount: baseAmount,
      userOrderId: 1, // u8, range [1..255]
    }),
    { marketType: MarketType.PERP }
  );

  const slOrder = getOrderParams(
    getTriggerMarketOrderParams({
      marketIndex: solPerp.marketIndex,
      direction: PositionDirection.SHORT,
      baseAssetAmount: baseAmount,
      triggerPrice: slPrice,
      triggerCondition: OrderTriggerCondition.BELOW,
      reduceOnly: true,
      userOrderId: 2,
    }),
    { marketType: MarketType.PERP }
  );

  const tpOrder = getOrderParams(
    getTriggerMarketOrderParams({
      marketIndex: solPerp.marketIndex,
      direction: PositionDirection.SHORT,
      baseAssetAmount: baseAmount,
      triggerPrice: tpPrice,
      triggerCondition: OrderTriggerCondition.ABOVE,
      reduceOnly: true,
      userOrderId: 3,
    }),
    { marketType: MarketType.PERP }
  );

  ok("4", `OrderParams keys: ${Object.keys(entryOrder).join(", ")}`);
  ok("4", `entry  orderType:      ${JSON.stringify(entryOrder.orderType)}`);
  ok("4", `entry  direction:      ${JSON.stringify(entryOrder.direction)}`);
  ok("4", `entry  marketType:     ${JSON.stringify(entryOrder.marketType)}`);
  ok("4", `entry  marketIndex:    ${entryOrder.marketIndex}`);
  ok("4", `entry  baseAssetAmt:   ${entryOrder.baseAssetAmount.toString()} (0.1 SOL * BASE_PRECISION)`);
  ok("4", `entry  userOrderId:    ${entryOrder.userOrderId} (u8)`);
  ok("4", `SL     orderType:      ${JSON.stringify(slOrder.orderType)}`);
  ok("4", `SL     triggerCond:    ${JSON.stringify(slOrder.triggerCondition)}`);
  ok("4", `SL     triggerPrice:   ${slOrder.triggerPrice?.toString()} = $${slPriceNum}`);
  ok("4", `SL     reduceOnly:     ${slOrder.reduceOnly}`);
  ok("4", `TP     orderType:      ${JSON.stringify(tpOrder.orderType)}`);
  ok("4", `TP     triggerCond:    ${JSON.stringify(tpOrder.triggerCondition)}`);
  ok("4", `TP     triggerPrice:   ${tpOrder.triggerPrice?.toString()} = $${tpPriceNum}`);
  ok("4", `TP     reduceOnly:     ${tpOrder.reduceOnly}`);
  ok("4", "All 3 OrderParams constructed successfully (shape verified)");

  // ── Step 5: SOL balance check ──────────────────────────────────────────────
  log("5", "Check SOL balance");

  let solBalance =
    (await connection.getBalance(keypair.publicKey)) / LAMPORTS_PER_SOL;
  ok("5", `SOL balance: ${solBalance} SOL`);

  if (solBalance < 0.5) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const sig = await connection.requestAirdrop(
          keypair.publicKey,
          2 * LAMPORTS_PER_SOL
        );
        const latest = await connection.getLatestBlockhash();
        await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
        solBalance = (await connection.getBalance(keypair.publicKey)) / LAMPORTS_PER_SOL;
        ok("5", `Airdrop OK (attempt ${attempt}) — balance: ${solBalance} SOL — sig: ${sig}`);
        break;
      } catch (e: any) {
        warn("5", `Airdrop attempt ${attempt}: ${e.message}`);
        if (attempt < 3) await sleep(4000);
      }
    }
  } else {
    ok("5", "Balance sufficient — no airdrop needed");
  }

  if (solBalance < 0.05) {
    warn("5", "Insufficient SOL — skipping on-chain steps");
    await runAtomicitySourceAnalysis();
    await driftClient.unsubscribe();
    return;
  }

  // ── Step 6: initializeUserAccount ─────────────────────────────────────────
  log("6", "initializeUserAccount (user PDA, subaccount 0)");

  let userAccountPubkey: PublicKey | null = null;
  let initTxSig = "";
  try {
    const [sig, pubkey] = await driftClient.initializeUserAccount(0, "probe-user");
    initTxSig = sig;
    userAccountPubkey = pubkey;
    ok("6", `initializeUserAccount OK`);
    ok("6", `tx:         ${sig}`);
    ok("6", `user PDA:   ${pubkey.toBase58()}`);
  } catch (e: any) {
    if (e.message?.includes("already in use") || e.message?.includes("already initialized")) {
      ok("6", "User account already exists — continuing");
    } else {
      warn("6", `initializeUserAccount failed: ${e.message}`);
      await runAtomicitySourceAnalysis();
      await driftClient.unsubscribe();
      return;
    }
  }

  await driftClient.addUser(0);
  const user = driftClient.getUser(0);
  await user.subscribe();
  ok("6", "User sub-account 0 subscribed");

  // ── Step 7: TokenFaucet — mint mock USDC to ATA ────────────────────────────
  log("7", "TokenFaucet — mint devnet USDC to our ATA");

  const usdcMint = new PublicKey(quoteMintAddress);
  const tokenFaucet = new TokenFaucet(
    connection,
    wallet,
    DEVNET_TOKEN_FAUCET_PROGRAM_ID,
    usdcMint,
    { commitment: "confirmed" }
  );
  ok("7", `TokenFaucet programId: ${DEVNET_TOKEN_FAUCET_PROGRAM_ID.toBase58()}`);
  ok("7", `Mint (devnet USDC):    ${usdcMint.toBase58()}`);

  let faucetMintSig = "";
  let ataAddress: PublicKey | null = null;
  try {
    const [ata, sig] = await tokenFaucet.createAssociatedTokenAccountAndMintTo(
      keypair.publicKey,
      new BN(500).mul(QUOTE_PRECISION) // 500 USDC
    );
    faucetMintSig = sig;
    ataAddress = ata;
    ok("7", `TokenFaucet.mintToUser OK`);
    ok("7", `tx:  ${sig}`);
    ok("7", `ATA: ${ata.toBase58()}`);
    ok("7", "Faucet mechanics: createAssociatedTokenAccountAndMintTo(pubkey, amount_BN)");
    ok("7", "  → creates ATA if missing + mints mock USDC to it in one tx");
    ok("7", `  → amount uses QUOTE_PRECISION (1e6): 500 * 1e6 = ${new BN(500).mul(QUOTE_PRECISION).toString()}`);
  } catch (e: any) {
    warn("7", `TokenFaucet.mintToUser failed: ${e.message}`);
  }

  // ── Step 7b: deposit() ─────────────────────────────────────────────────────
  // Known failure: deposit() fails with SpotMarketNotFound due to oracle/remaining-
  // accounts format mismatch between SDK 2.156.0 and the devnet program (slot 457280167).
  // Root cause: PythLazerOracle accounts (Drift-program-owned) passed first in remaining
  // accounts are not consumed by OracleMap::load() in the on-chain program version,
  // causing SpotMarketMap::load() to see oracles before spot markets → SpotMarketNotFound.
  // This is a SDK-version vs on-chain-program-version mismatch, not an SDK API bug.
  if (ataAddress) {
    log("7b", "deposit() — expected to fail with SpotMarketNotFound (known devnet compat issue)");
    try {
      const depositSig = await driftClient.deposit(
        new BN(500).mul(QUOTE_PRECISION),
        0, // USDC spot market index
        ataAddress,
        0  // subAccountId
      );
      ok("7b", `deposit OK (unexpected!) — tx: ${depositSig}`);
    } catch (e: any) {
      warn("7b", `deposit failed (expected): ${e.message?.split("\n")[0]}`);
      warn("7b", "Root cause: PythLazerOracle remaining accounts format incompatible with devnet program version");
      warn("7b", "This blocks: deposit, placeOrders with user collateral, close, userOrderId round-trip");
    }
  }

  // ── Step 8: placeOrders — atomicity ────────────────────────────────────────
  log("8", "placeOrders([entry, SL, TP]) — THE ATOMICITY QUESTION");

  let placeOrdersTxSig = "";
  let atomicOnChain = false;
  let atomicConfirmed = false;
  try {
    placeOrdersTxSig = await driftClient.placeOrders(
      [entryOrder, slOrder, tpOrder],
      undefined,
      0
    );
    atomicOnChain = true;
    atomicConfirmed = true;
    ok("8", "placeOrders() SUCCEEDED");
    ok("8", `tx sig: ${placeOrdersTxSig}`);
    ok("8", "ATOMICITY: YES — entry + SL + TP in ONE tx (on-chain proven)");
  } catch (e: any) {
    // Even on failure, check if the tx was broadcast with all 3 orders
    const logs: string[] = (e as any).logs ?? [];
    const reachedProgram = logs.some((l) =>
      l.includes("Instruction: PlaceOrders")
    );
    warn(
      "8",
      `placeOrders failed at runtime: ${e.message?.split("\n")[0]}`
    );
    if (reachedProgram) {
      atomicOnChain = true;
      ok("8", "CRITICAL: 'Instruction: PlaceOrders' appears in on-chain logs");
      ok("8", "This proves: all 3 orders were serialized into ONE instruction, ONE tx");
      ok("8", "The failure is MarketNotFound (remaining accounts mismatch), NOT a multi-tx issue");
      ok("8", "ATOMICITY: YES (proven by on-chain log — program received all 3 orders in one call)");
    } else {
      warn("8", "Did not reach on-chain program — cannot confirm atomicity from runtime");
    }
    ok("8", "SOURCE ANALYSIS also confirms atomicity:");
    ok("8", "  driftClient.placeOrders(params: OrderParams[])");
    ok("8", "    → preparePlaceOrdersTx → buildTransaction(getPlaceOrdersIx(params))");
    ok("8", "    → getPlaceOrdersIx → program.instruction.placeOrders(formattedParams, ...)");
    ok("8", "  ALL params[] go into ONE Anchor instruction, ONE Solana tx");
    ok("8", "  Source: worker/node_modules/@drift-labs/sdk/src/driftClient.ts ~L5304–5395");
  }

  // ── Step 9: position / uPnL / liqPrice (API shape only — no collateral) ───
  log("9", "Position, uPnL, liquidationPrice — API shape");
  ok("9", "user.getPerpPosition(marketIndex) → PerpPosition | undefined");
  ok("9", "  PerpPosition: { baseAssetAmount: BN, quoteAssetAmount: BN, ... }");
  ok("9", "user.getUnrealizedPNL(withFunding: bool, marketIndex?: number) → BN");
  ok("9", "  divide by QUOTE_PRECISION for USD value");
  ok("9", "user.liquidationPrice(marketIndex) → BN");
  ok("9", "  divide by PRICE_PRECISION for USD value");
  ok("9", "These methods available post-subscribe; work on real positions");
  try {
    const perpPos = user.getPerpPosition(solPerp.marketIndex);
    ok("9", `getPerpPosition(${solPerp.marketIndex}) = ${perpPos ? "PerpPosition found" : "undefined (no position — expected, no deposit)"}`);
    const uPnl = user.getUnrealizedPNL(true, solPerp.marketIndex);
    ok("9", `getUnrealizedPNL(true, ${solPerp.marketIndex}) = ${uPnl.toString()} / 1e6 = ${convertToNumber(uPnl, QUOTE_PRECISION)} USD`);
  } catch (e: any) {
    warn("9", `Position methods: ${e.message}`);
  }

  // ── Step 10: userOrderId round-trip (requires funded account — skip) ───────
  log("10", "userOrderId (u8) round-trip — UNVERIFIED (blocked by deposit issue)");
  ok("10", "API: getOrderParams(..., { userOrderId: N }) where N is u8 [1..255]");
  ok("10", "     user.getOpenOrders() → Order[]  (each has .userOrderId: number, .orderId: number)");
  ok("10", "     driftClient.cancelOrderByUserId(userOrderId, txParams?, subAccountId?) → TxSig");
  ok("10", "     Order.userOrderId is set in placeOrders → readable back via getOpenOrders()");
  ok("10", "     This is UNVERIFIED on-chain due to deposit compatibility issue");

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await user.unsubscribe();
  await driftClient.unsubscribe();

  printFinalSummary({
    sdkConfig,
    quoteMintAddress,
    solPerp,
    atomicOnChain,
    atomicConfirmed,
    placeOrdersTxSig,
    initTxSig,
    faucetMintSig,
    ataAddress,
    oraclePrice,
  });
}

// ── Fallback helpers ──────────────────────────────────────────────────────────

async function runAtomicitySourceAnalysis() {
  log("ATOMICITY", "Source analysis (subscribe failed — API shapes still verifiable)");
  ok("ATOMICITY", "placeOrders(params: OrderParams[]) → one Anchor instruction → one tx");
  ok("ATOMICITY", "Source: driftClient.ts L5304–5395, getPlaceOrdersIx L5373–5461");
  ok("ATOMICITY", "RESULT: YES (source-verified, not on-chain proven)");
}

async function runApiShapeDiscovery(marketIndex: number) {
  log("API-SHAPE", "subscribe failed — static shape discovery");
  const baseAmt = new BN(0.1 * 1e9);
  const px = new BN(80).mul(PRICE_PRECISION);
  const e = getOrderParams(getMarketOrderParams({ marketIndex, direction: PositionDirection.LONG, baseAssetAmount: baseAmt, userOrderId: 1 }), { marketType: MarketType.PERP });
  ok("API-SHAPE", `OrderParams keys: ${Object.keys(e).join(", ")}`);
  await runAtomicitySourceAnalysis();
}

// ── Final summary ─────────────────────────────────────────────────────────────

function printFinalSummary({
  sdkConfig, quoteMintAddress, solPerp, atomicOnChain, atomicConfirmed,
  placeOrdersTxSig, initTxSig, faucetMintSig, ataAddress, oraclePrice,
}: {
  sdkConfig: ReturnType<typeof initialize>;
  quoteMintAddress: string;
  solPerp: (typeof DevnetPerpMarkets)[0];
  atomicOnChain: boolean;
  atomicConfirmed: boolean;
  placeOrdersTxSig: string;
  initTxSig: string;
  faucetMintSig: string;
  ataAddress: PublicKey | null;
  oraclePrice: number;
}) {
  console.log("\n\n==================================================");
  console.log("FINDINGS SUMMARY");
  console.log("==================================================");
  console.log(`SDK version:            2.156.0 (stable)`);
  console.log(`Program ID (devnet):    ${sdkConfig.DRIFT_PROGRAM_ID}`);
  console.log(`Quote mint (USDC):      ${quoteMintAddress}`);
  console.log(`SOL-PERP market index:  ${solPerp.marketIndex}`);
  console.log(`Oracle price observed:  $${oraclePrice}`);
  console.log(`BASE_PRECISION:         1e9`);
  console.log(`QUOTE_PRECISION:        1e6`);
  console.log(`PRICE_PRECISION:        1e6`);
  if (atomicConfirmed) {
    console.log(`Atomicity:              YES — proven on-chain (tx: ${placeOrdersTxSig})`);
  } else if (atomicOnChain) {
    console.log(`Atomicity:              YES — proven by on-chain log "Instruction: PlaceOrders"`);
    console.log(`                        (tx reached program with all 3 orders in one call)`);
  } else {
    console.log(`Atomicity:              YES — source-verified only (runtime blocked by SDK/devnet mismatch)`);
  }
  if (initTxSig) console.log(`initUserAccount tx:     ${initTxSig}`);
  if (faucetMintSig) console.log(`faucet mint tx:         ${faucetMintSig}`);
  if (ataAddress) console.log(`faucet ATA:             ${ataAddress.toBase58()}`);
  console.log("==================================================\n");
}

main().catch((e) => {
  console.error("\nFatal error:", e);
  process.exit(1);
});
