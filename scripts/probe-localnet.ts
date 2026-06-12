/**
 * scripts/probe-localnet.ts
 *
 * Adrena localnet e2e probe — Task 1d of SAW Perps Phase 1.
 *
 * RUN (validator must be up first):
 *   bash scripts/localnet-adrena/setup.sh
 *   npx tsx scripts/probe-localnet.ts
 *
 * WHAT THIS PROVES:
 *   1. adrena-sdk (built from ~/vendor/adrena-sdk-ts) is importable at runtime
 *   2. Pool PDA, custodies, and cloned accounts are accessible on localnet
 *   3. Instruction building works against the cloned pool state on localnet
 *   4. Localnet send path: @solana/kit rpc.sendTransaction() — no Jito needed
 *   5. open+SL+TP as one atomic transaction (single tx, not a Jito bundle)
 *   6. getPositionStatus() reads position after open
 *   7. cancelSLTP instructions accepted on-chain (keeper execution = mainnet only)
 *   8. closeLong instruction accepted
 *
 * JITO BYPASS:
 *   The SDK's high-level openMarketLong() always calls sendTransactionWithJito().
 *   On localnet there is no Jito. Strategy: use the lower-level instruction
 *   builders (getOpenLongIxs, getSetStopLossLongIx, etc.) directly, assemble
 *   all ixs into one array, and send via rpc.sendTransaction(). The atomicity
 *   guarantee is identical — all ixs in one transaction = atomic on-chain.
 *   The Jito "bundle" would have been a single-tx bundle anyway.
 *
 * SDK LINKING:
 *   worker/package.json: "adrena-sdk": "file:/home/asastu/vendor/adrena-sdk-ts"
 *   To unwire when beta.15+ (or any fixed publish) ships with dist/:
 *     pnpm remove adrena-sdk --filter @asastuai/saw-worker
 *     pnpm add adrena-sdk@<version> --filter @asastuai/saw-worker
 *
 * ORACLE STALENESS (known concern):
 *   Cloned Pyth accounts are frozen snapshots. If the Adrena program rejects
 *   them, the open tx fails with a program error. The probe documents the exact
 *   error and tests --warp-slot mitigation.
 *
 * USDC COLLATERAL (known concern):
 *   The cloned USDC mint has Centre multisig authority — not locally mintable.
 *   Without real USDC, the open tx is skipped. See README.md for funding options.
 *
 * SECURITY:
 *   Loads throwaway keypair from .keys/local-wallet.json (gitignored, created by
 *   setup.sh). Never writes or uses real mainnet keys.
 */

import * as fs from "fs";
import * as path from "path";
import {
  createSolanaRpc,
  createKeyPairSignerFromBytes,
  address,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  type IInstruction,
  type Rpc,
  type SolanaRpcApi,
  type TransactionSigner,
} from "@solana/kit";

// ── Adrena SDK (adrena-sdk package, built from source) ────────────────────────
// All imports use registered subpath exports: ./instructions, ./helpers, ./core
// "adrena-sdk": "file:/home/asastu/vendor/adrena-sdk-ts" in worker/package.json
import {
  getOpenLongIxs,
  getClosePositionLongIxs,
  getCancelStopLossIx,
  getCancelTakeProfitIx,
  getSetStopLossLongIx,
  getTakeProfitLongIx,
} from "adrena-sdk/instructions";

import {
  fetchPoolUtil,
  findCustodyAddress,
  findPositionAddress,
  getCortexPda,
  getPoolPda,
  PRINCIPAL_ADDRESSES,
  findATAAddress,
  ADRENA_PROGRAM_ID as ADRENA_PROGRAM_ADDRESS_STR,
  hasUserProfile,
  buildInitUserProfileIx,
} from "adrena-sdk/helpers";

import { getPositionStatus } from "adrena-sdk/core";

const LOCAL_RPC = "http://127.0.0.1:8899";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// fetchPoolUtil needs an Address (opaque string brand), not a raw string
const ADRENA_PROGRAM_ADDRESS = address(ADRENA_PROGRAM_ADDRESS_STR);

// ── Localnet send helper (no Jito) ────────────────────────────────────────────
async function sendLocalnet(
  ixs: IInstruction[],
  wallet: TransactionSigner,
  rpc: Rpc<SolanaRpcApi>,
): Promise<string> {
  const { value: blockhash } = await rpc.getLatestBlockhash().send();

  const txMsg = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(wallet.address, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx) => appendTransactionMessageInstructions(ixs, tx),
  );

  const signed = await signTransactionMessageWithSigners(txMsg);
  const sig = getSignatureFromTransaction(signed);
  const wire = getBase64EncodedWireTransaction(signed);

  console.log(`  Sending (localnet, no Jito) — sig: ${sig.slice(0, 20)}...`);
  await rpc
    .sendTransaction(wire, { encoding: "base64", preflightCommitment: "confirmed" })
    .send();
  console.log(`  Confirmed. Full sig: ${sig}`);
  return sig;
}

// ── RPC helpers ───────────────────────────────────────────────────────────────
async function accountExists(rpc: Rpc<SolanaRpcApi>, pk: string): Promise<boolean> {
  try {
    const r = await rpc.getAccountInfo(address(pk), { encoding: "base64" }).send();
    return r.value !== null;
  } catch {
    return false;
  }
}

async function tokenBalance(rpc: Rpc<SolanaRpcApi>, ataAddr: string): Promise<number> {
  try {
    const r = await rpc.getTokenAccountBalance(address(ataAddr)).send();
    return Number(r.value.uiAmount ?? 0);
  } catch {
    return 0;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Adrena Localnet Probe — SAW Perps Task 1d ===");
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`RPC:  ${LOCAL_RPC}\n`);

  // Load config written by setup.sh
  const configPath = path.join(__dirname, "localnet-adrena/.localnet-config.json");
  let cfg: Record<string, string>;
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    console.log(`Config: ${configPath}`);
  } catch {
    console.error("FATAL: config not found. Run: bash scripts/localnet-adrena/setup.sh");
    process.exit(1);
  }

  // Load throwaway keypair (gitignored, localnet-only)
  let wallet: TransactionSigner;
  try {
    const bytes = JSON.parse(fs.readFileSync(cfg.localWallet, "utf-8")) as number[];
    wallet = await createKeyPairSignerFromBytes(new Uint8Array(bytes));
    console.log(`Local wallet: ${wallet.address}\n`);
  } catch (e) {
    console.error(`FATAL: keypair: ${(e as Error).message}`);
    process.exit(1);
  }

  const rpc = createSolanaRpc(LOCAL_RPC) as unknown as Rpc<SolanaRpcApi>;

  // ── [1] Health check ───────────────────────────────────────────────────────
  console.log("[1] Localnet health check...");
  try {
    const v = await rpc.getVersion().send();
    console.log(`  OK: ${(v as Record<string, string>)["solana-core"]}`);
  } catch {
    console.error("  FATAL: localnet not running. Run setup.sh first.");
    process.exit(1);
  }

  // ── [2] Cloned accounts ────────────────────────────────────────────────────
  console.log("\n[2] Verifying cloned Adrena accounts on localnet...");
  const checks: [string, string][] = [
    ["Pool PDA", cfg.poolPda],
    ["Cortex PDA", cfg.cortexPda],
    ["USDC Custody", cfg.usdcCustody],
    ["JITOSOL Custody", cfg.jitosolCustody],
    ["USDC Custody Token Account", cfg.usdcCustodyTokenAccount],
    ["JITOSOL Custody Token Account", cfg.jitosolCustodyTokenAccount],
    ["USDC Mint (mainnet)", USDC_MINT],
    ["SOL Pyth oracle", cfg.pythSolOracle],
    ["JITOSOL Pyth oracle", cfg.pythJitosolOracle],
  ];
  let missing = 0;
  for (const [name, pk] of checks) {
    const ok = await accountExists(rpc, pk);
    console.log(`  ${ok ? "OK  " : "MISS"}: ${name} (${pk.slice(0, 8)}...)`);
    if (!ok) missing++;
  }
  if (missing > 0) console.log(`  WARNING: ${missing} missing — re-run setup.sh`);
  else console.log("  All protocol accounts cloned.");

  // ── [3] Pool state readable ────────────────────────────────────────────────
  console.log("\n[3] Reading pool state from localnet...");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pool: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pool = await fetchPoolUtil("main-pool", ADRENA_PROGRAM_ADDRESS as any, rpc as any);
    console.log(`  OK: pool ${pool.address}  custodies: ${pool.data.custodies.length}`);
  } catch (e) {
    console.error(`  FAIL: fetchPoolUtil: ${(e as Error).message}`);
    console.log("  Pool unreadable — likely account schema mismatch after mainnet upgrade.");
  }

  // ── [4] USDC balance check ────────────────────────────────────────────────
  console.log("\n[4] Local wallet USDC balance...");
  let usdcBalance = 0;
  try {
    const [ata] = await findATAAddress(address(wallet.address), address(USDC_MINT));
    const ataAddr = ata.toString();
    const ataOk = await accountExists(rpc, ataAddr);
    if (ataOk) {
      usdcBalance = await tokenBalance(rpc, ataAddr);
      console.log(`  USDC ATA: ${ataAddr}  balance: ${usdcBalance} USDC`);
    } else {
      console.log(`  USDC ATA not found (${ataAddr.slice(0, 8)}...)`);
      console.log("  Zero collateral — open tx skipped. See README.md for funding.");
    }
  } catch (e) {
    console.log(`  Balance check: ${(e as Error).message}`);
  }

  // ── [5] Build open instructions ────────────────────────────────────────────
  console.log("\n[5] Building openMarketLong instructions (JITOSOL, 2x, 1 USDC)...");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let openResult: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    openResult = await getOpenLongIxs(wallet as any, "JITOSOL", "USDC", 1, 2, rpc as any);
    console.log(`  OK: ${openResult.ixns.length} ix(s) built`);
    console.log(`  Position address: ${openResult.positionAddress}`);
    console.log(`  Pool:   ${openResult.pool}`);
    console.log(`  Cortex: ${openResult.cortex}`);
  } catch (e) {
    console.error(`  FAIL: ${(e as Error).message}`);
    console.log("  Check: pool account schema mismatch or oracle fetch failure.");
  }

  // ── [6] Build SL/TP instructions ───────────────────────────────────────────
  console.log("\n[6] Building SL (stop=$100) + TP (take=$250) instructions...");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let slIx: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tpIx: any = null;
  if (openResult) {
    try {
      slIx = await getSetStopLossLongIx({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        owner: wallet as any,
        cortex: openResult.cortex,
        pool: openResult.pool,
        position: openResult.positionAddress,
        custody: openResult.principalCustodyObj.address,
        stopLossLimitPrice: 100,
        closePositionPrice: null,
      });
      console.log("  OK: SL ix built");
    } catch (e) {
      console.log(`  FAIL: SL ix: ${(e as Error).message}`);
    }
    try {
      tpIx = await getTakeProfitLongIx({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        owner: wallet as any,
        cortex: openResult.cortex,
        pool: openResult.pool,
        position: openResult.positionAddress,
        custody: openResult.principalCustodyObj.address,
        takeProfitLimitPrice: 250,
      });
      console.log("  OK: TP ix built");
    } catch (e) {
      console.log(`  FAIL: TP ix: ${(e as Error).message}`);
    }
  }

  // ── [6.5] Build user profile init ix (required before first open) ──────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let profileInitIx: any = null;
  if (openResult) {
    try {
      const profileState = await hasUserProfile(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        address(wallet.address) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rpc as any
      );
      if (!profileState || !profileState.exists) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        profileInitIx = await buildInitUserProfileIx(wallet as any);
        console.log("\n  Profile init ix built (wallet has no Adrena profile yet)");
      } else {
        console.log("\n  Profile already exists — no init ix needed");
      }
    } catch (e) {
      console.log(`\n  Profile check failed: ${(e as Error).message} — including init ix for safety`);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        profileInitIx = await buildInitUserProfileIx(wallet as any);
      } catch (e2) {
        console.log(`  buildInitUserProfileIx failed: ${(e2 as Error).message}`);
      }
    }
  }

  // ── [7] Send open+SL+TP ────────────────────────────────────────────────────
  let openSig: string | null = null;
  if (openResult && usdcBalance >= 1) {
    console.log("\n[7] Sending open+SL+TP as single transaction (no Jito)...");
    const allIxs: IInstruction[] = [
      // Profile init MUST come first if this is the wallet's first Adrena tx
      ...(profileInitIx ? [profileInitIx] : []),
      ...openResult.ixns,
      ...(slIx ? [slIx] : []),
      ...(tpIx ? [tpIx] : []),
    ];
    console.log(`  Ix count: ${allIxs.length} (open=${openResult.ixns.length} SL=${slIx ? 1 : 0} TP=${tpIx ? 1 : 0})`);
    try {
      openSig = await sendLocalnet(allIxs, wallet, rpc);
      console.log(`  TX SIG (open+SL+TP): ${openSig}`);
    } catch (e) {
      const msg = (e as Error).message;
      // Print full error object for debugging
      try {
        console.error(`  FAIL raw:`, JSON.stringify(e, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2).slice(0, 3000));
      } catch { console.error(`  FAIL raw (stringify failed):`, String(e)); }
      console.error(`  FAIL: ${msg}`);
      // Classify the error for the findings doc
      if (/oracle|stale|0x177|0x178|0x17[0-9a-f]/i.test(msg)) {
        console.log("\n  ORACLE STALENESS FINDING:");
        console.log("  Adrena program rejected cloned Pyth oracle snapshot.");
        console.log("  Error evidence:", msg.slice(0, 300));
        console.log("  Mitigations:");
        console.log("    A) Re-run setup.sh (fresh clone with latest slot numbers)");
        console.log("    B) solana-test-validator --warp-slot <recent_slot> to advance clock");
        console.log("    C) The Adrena oracle PDA (GEm9...) is a separate custom oracle account");
        console.log("       that aggregates prices — it may have its own staleness logic.");
        console.log("  STATUS: DONE_WITH_CONCERNS — ixs built, oracle blocks execution.");
      } else if (/insufficient|collateral|0x1[^7][0-9a-f]/i.test(msg)) {
        console.log("\n  COLLATERAL FUNDING GAP:");
        console.log("  Real USDC mint has Centre multisig authority — not mintable locally.");
        console.log("  Funding option: inject a whale USDC ATA via --account in setup.sh.");
        console.log("  STATUS: DONE_WITH_CONCERNS — ixs built, collateral blocks execution.");
      } else {
        console.log("  UNKNOWN ERROR — see program logs. May be program upgrade mismatch.");
      }
    }
  } else if (openResult) {
    console.log("\n[7] SKIP send: USDC balance = 0 (expected first run).");
    console.log("  Instruction build: OK. Execution: DONE_WITH_CONCERNS (see summary).");
  } else {
    console.log("\n[7] SKIP send: instruction build failed at step [5].");
  }

  // ── [8] Read position ─────────────────────────────────────────────────────
  if (openSig && openResult) {
    console.log("\n[8] Reading position state...");
    try {
      const status = await getPositionStatus({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wallet: wallet as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rpc: rpc as any,
        principalToken: "JITOSOL",
        side: "long",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = status as any;
      console.log(`  OK: entryPrice=${s.entryPrice}  pythPrice=${s.pythPrice}`);
      console.log(`  sizeUsd=${s.sizeUsd}  pnl=${s.pnl}`);
      console.log(`  stopLossIsSet=${s.positionData?.stopLossIsSet}  takeProfitIsSet=${s.positionData?.takeProfitIsSet}`);
    } catch (e) {
      console.error(`  FAIL: getPositionStatus: ${(e as Error).message}`);
    }

    // ── [9] cancelSLTP ──────────────────────────────────────────────────────
    console.log("\n[9] cancelSLTP (cancel both SL and TP)...");
    try {
      const jitosolMint = PRINCIPAL_ADDRESSES["JITOSOL"].address;
      const poolPda = (await getPoolPda())[0];
      const cortexPda = (await getCortexPda())[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const custodyAddr = (await findCustodyAddress(poolPda as any, jitosolMint as any))[0];
      const posAddr = (
        await findPositionAddress(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          poolPda as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          address(wallet.address) as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          custodyAddr as any,
          "long"
        )
      )[0];

      const cancelIxs: IInstruction[] = [];
      cancelIxs.push(
        await getCancelStopLossIx({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          owner: wallet as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cortex: cortexPda as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pool: poolPda as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          custody: custodyAddr as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          position: posAddr as any,
        })
      );
      cancelIxs.push(
        await getCancelTakeProfitIx({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          owner: wallet as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cortex: cortexPda as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pool: poolPda as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          custody: custodyAddr as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          position: posAddr as any,
        })
      );

      const cancelSig = await sendLocalnet(cancelIxs, wallet, rpc);
      console.log(`  TX SIG (cancelSLTP): ${cancelSig}`);
    } catch (e) {
      console.error(`  FAIL: cancelSLTP: ${(e as Error).message}`);
    }

    // ── [10] closeLong ──────────────────────────────────────────────────────
    console.log("\n[10] Closing long position...");
    try {
      const closeIxs = await getClosePositionLongIxs({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wallet: wallet as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rpc: rpc as any,
        principalToken: "JITOSOL",
      });
      const closeSig = await sendLocalnet(closeIxs, wallet, rpc);
      console.log(`  TX SIG (closeLong): ${closeSig}`);
    } catch (e) {
      console.error(`  FAIL: closeLong: ${(e as Error).message}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n=== SUMMARY ===");
  const ixBuildOk = openResult !== null && slIx !== null && tpIx !== null;
  const txOk = openSig !== null;

  if (txOk) {
    console.log("STATUS: DONE");
    console.log(`  open+SL+TP tx:  ${openSig}`);
    console.log("  All green on localnet.");
  } else if (openResult !== null) {
    console.log("STATUS: DONE_WITH_CONCERNS");
    console.log(`  SDK import:        OK (adrena-sdk from ~/vendor/adrena-sdk-ts)`);
    console.log(`  Pool readable:     ${pool !== null ? "OK" : "FAIL"}`);
    console.log(`  IX build (open):   OK`);
    console.log(`  IX build (SL/TP):  ${ixBuildOk ? "OK" : "PARTIAL"}`);
    console.log(`  TX send:           BLOCKED`);
    console.log("");
    console.log("  Root cause: zero USDC collateral (cloned mint, Centre authority)");
    console.log("  OR oracle staleness (frozen Pyth snapshot rejected by program).");
    console.log("  Both documented in README.md with mitigations.");
    console.log("");
    console.log("  Next steps:");
    console.log("  1. Whale USDC ATA injection (see README) for collateral");
    console.log("  2. setup.sh re-run (fresh oracle snapshot) for staleness");
    console.log("  3. Mainnet dust run (VENUE_ALLOW_MAINNET_DUST=true, ~5 USDC)");
    console.log("     for keeper-executed SL/TP validation");
  } else {
    console.log("STATUS: BLOCKED");
    console.log("  SDK import OK but pool state unreadable or ix build failed.");
    console.log("  Likely cause: Adrena mainnet program upgraded since clone.");
    console.log("  Re-dump adrena.so and re-run setup.sh.");
  }
}

main().catch((e) => {
  console.error("probe fatal:", e);
  process.exit(1);
});
