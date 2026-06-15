/**
 * worker/src/lib/sur-venue.integration.ts
 *
 * Manual integration suite for SurAdapter against SUR localnet.
 * NOT part of CI (vitest). Run manually after bringing up the validator.
 *
 * PREREQUISITES:
 *   1. SUR programs compiled at ~/projects/sur-protocol-solana/target/deploy/
 *   2. Solana CLI + deployer key at ~/.config/solana/id.json (already registered
 *      as operator by the probe -- if not, run sur-adapter-probe.ts first)
 *
 * RUN:
 *   # In WSL -- start validator in the SAME shell session:
 *   DEPLOY=/home/asastu/projects/sur-protocol-solana/target/deploy
 *   solana-test-validator \
 *     --bpf-program "$DEPLOY/perp_vault-keypair.json"    "$DEPLOY/perp_vault.so" \
 *     --bpf-program "$DEPLOY/perp_engine-keypair.json"   "$DEPLOY/perp_engine.so" \
 *     --bpf-program "$DEPLOY/oracle_router-keypair.json" "$DEPLOY/oracle_router.so" \
 *     --reset --quiet &
 *   until curl -sf http://127.0.0.1:8899/health >/dev/null 2>&1; do sleep 1; done
 *
 *   # Then run the probe to set up programs + operators:
 *   cd ~/projects/sur-protocol-solana
 *   npx ts-node scripts/sur-adapter-probe.ts
 *
 *   # Then run this integration suite from the SAW worker:
 *   cd ~/projects/saw/worker
 *   VENUE=sur VENUE_ENV=localnet \
 *   npx tsx src/lib/sur-venue.integration.ts
 *
 * WHAT IT TESTS:
 *   1. makeSurAdapter factory
 *   2. ensureUserInitialized (idempotent)
 *   3. getFloatBalanceUsdc (reads deposit from probe run)
 *   4. ensureDeposited pass + fail
 *   5. pushMarkPrice ($65,000)
 *   6. getOraclePrice -> $65,000
 *   7. hasOpenOrderWithUserOrderId -> false (before open)
 *   8. openPerp (long, 3250 USDC, x2, BTC-USD @ $65k)
 *   9. getPositions (1 long pos, uPnL, liqPrice, SL=null, TP=null)
 *  10. hasOpenOrderWithUserOrderId -> true
 *  11. closePerp (long @ $66k)
 *  12. getPositions -> []
 *  13. closePerp again -> { alreadyClosed: true }
 *  14. pushMarkPrice ($66,000)
 *  15. openPerp (short, 3300 USDC, x2, BTC-USD @ $66k)
 *  16. getPositions (1 short pos, uPnL, liqPrice)
 *  17. closePerp (short @ $65k)
 *  18. getPositions -> []
 *  19. disconnect (no-op)
 *
 * All TX sigs are logged to stdout. Non-zero exit on any failure.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Keypair } from "@solana/web3.js";
import { makeSurAdapter } from "./sur-venue.js";
import type { SurAdapterWithPushPrice } from "./sur-venue.js";

// ── Terminal colours ──────────────────────────────────────────────────────────

const G = "\x1b[32m";
const R = "\x1b[31m";
const Y = "\x1b[33m";
const C = "\x1b[36m";
const B = "\x1b[90m";
const Z = "\x1b[0m";

let passed = 0;
let failed = 0;
const results: string[] = [];

function ok(label: string, detail = ""): void {
  passed++;
  console.log(`  ${G}PASS${Z} ${label}${detail ? `  ${B}${detail}${Z}` : ""}`);
  results.push(`PASS: ${label}`);
}

function fail(label: string, err: unknown): void {
  failed++;
  const msg = (err as Error)?.message ?? String(err);
  console.log(`  ${R}FAIL${Z} ${label}  ${R}${msg}${Z}`);
  results.push(`FAIL: ${label} -- ${msg}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const rpcUrl = process.env["VENUE_RPC_URL"] ?? "http://127.0.0.1:8899";
  console.log(`\n${C}=== SurAdapter Integration Suite -- SUR ===${Z}`);
  console.log(`${B}Date: ${new Date().toISOString()}${Z}`);
  console.log(`${B}RPC: ${rpcUrl}${Z}\n`);

  // Load deployer keypair (registered as SUR engine operator by probe)
  const kpPath = path.join(os.homedir(), ".config", "solana", "id.json");
  let authority: Keypair;
  try {
    const bytes = JSON.parse(fs.readFileSync(kpPath, "utf-8")) as number[];
    authority = Keypair.fromSecretKey(new Uint8Array(bytes));
    console.log(`Operator (deployer): ${authority.publicKey.toBase58()}`);
  } catch (e) {
    console.error(`${R}FATAL: keypair load failed: ${(e as Error).message}${Z}`);
    process.exit(1);
  }

  // ── [1] makeSurAdapter ──────────────────────────────────────────────────────
  console.log(`${Y}[1] makeSurAdapter${Z}`);
  let adapter: SurAdapterWithPushPrice;
  try {
    adapter = makeSurAdapter({
      rpcUrl,
      authority,
      market: "BTC-USD",
    });
    ok("makeSurAdapter");
  } catch (e) {
    fail("makeSurAdapter", e);
    console.error("Cannot continue without adapter.");
    process.exit(1);
  }

  // ── [2] ensureUserInitialized ───────────────────────────────────────────────
  console.log(`\n${Y}[2] ensureUserInitialized${Z}`);
  try {
    await adapter.ensureUserInitialized();
    ok("ensureUserInitialized (first call)");
    await adapter.ensureUserInitialized();
    ok("ensureUserInitialized (idempotent)");
  } catch (e) {
    fail("ensureUserInitialized", e);
  }

  // ── [2b] fundFloat (devnet setup — on localnet the probe funds the float) ────
  // Set SUR_FUND_USDC=5000 on devnet so the open steps have margin. No-op locally.
  const fundAmount = process.env["SUR_FUND_USDC"];
  if (fundAmount) {
    console.log(`\n${Y}[2b] fundFloat(${fundAmount} USDC)${Z}`);
    try {
      const sig = await adapter.fundFloat(Number(fundAmount));
      ok("fundFloat", `txSig=${sig}`);
    } catch (e) {
      fail("fundFloat", e);
    }
  }

  // ── [3] getFloatBalanceUsdc ─────────────────────────────────────────────────
  console.log(`\n${Y}[3] getFloatBalanceUsdc${Z}`);
  let balance = 0;
  try {
    balance = await adapter.getFloatBalanceUsdc();
    ok("getFloatBalanceUsdc", `${balance.toFixed(2)} USDC`);
  } catch (e) {
    fail("getFloatBalanceUsdc", e);
  }

  // ── [4] ensureDeposited ─────────────────────────────────────────────────────
  console.log(`\n${Y}[4] ensureDeposited${Z}`);
  try {
    await adapter.ensureDeposited(1000); // probe deposits 1000 USDC
    ok("ensureDeposited(1000) -- pass");
  } catch (e) {
    fail("ensureDeposited(1000) -- expected pass", e);
  }
  try {
    await adapter.ensureDeposited(999_999_999);
    fail("ensureDeposited(999999999) -- expected throw", new Error("did not throw"));
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("insufficient float")) {
      ok("ensureDeposited(999999999) -- correctly throws", msg);
    } else {
      fail("ensureDeposited(999999999) -- wrong error", e);
    }
  }

  // ── [5] pushMarkPrice ───────────────────────────────────────────────────────
  console.log(`\n${Y}[5] pushMarkPrice($65,000)${Z}`);
  try {
    await adapter.pushMarkPrice(65_000);
    ok("pushMarkPrice(65000)");
  } catch (e) {
    fail("pushMarkPrice(65000)", e);
  }

  // ── [6] getOraclePrice ──────────────────────────────────────────────────────
  console.log(`\n${Y}[6] getOraclePrice${Z}`);
  try {
    const price = await adapter.getOraclePrice("BTC-USD");
    if (Math.abs(price - 65_000) < 1) {
      ok("getOraclePrice -> $65,000", `$${price.toFixed(2)}`);
    } else {
      fail("getOraclePrice wrong price", new Error(`expected $65000, got $${price}`));
    }
  } catch (e) {
    fail("getOraclePrice", e);
  }

  // ── [7] hasOpenOrderWithUserOrderId (before open) ──────────────────────────
  console.log(`\n${Y}[7] hasOpenOrderWithUserOrderId (before open)${Z}`);
  try {
    const has = await adapter.hasOpenOrderWithUserOrderId(42);
    if (!has) {
      ok("hasOpenOrderWithUserOrderId(42) = false");
    } else {
      // Leftover from prior run -- close first
      ok("hasOpenOrderWithUserOrderId(42) = true (leftover, closing)");
      await adapter.closePerp("BTC-USD");
    }
  } catch (e) {
    fail("hasOpenOrderWithUserOrderId (before open)", e);
  }

  // ── [8] openPerp (long) ─────────────────────────────────────────────────────
  console.log(`\n${Y}[8] openPerp LONG (3250 USDC x2 @ $65k)${Z}`);
  let longSig = "";
  try {
    const result = await adapter.openPerp(
      { market: "BTC-USD", side: "long", leverage: 2, marginUsdc: 3250, stopLoss: null, takeProfit: null },
      42,
    );
    longSig = result.txSig;
    ok("openPerp LONG", `txSig=${longSig}`);
    console.log(`    ${C}TX SIG (long open): ${longSig}${Z}`);
  } catch (e) {
    fail("openPerp LONG", e);
  }

  // ── [9] getPositions (after long open) ─────────────────────────────────────
  console.log(`\n${Y}[9] getPositions (expect 1 long)${Z}`);
  if (longSig) {
    try {
      const positions = await adapter.getPositions();
      if (positions.length === 1 && positions[0]!.side === "long") {
        const p = positions[0]!;
        ok(
          "getPositions -> 1 long",
          `entry=$${p.entryPrice.toFixed(2)} mark=$${p.markPrice.toFixed(2)} ` +
          `uPnL=${p.unrealizedPnlUsdc.toFixed(2)} liq=$${p.liqPrice?.toFixed(2) ?? "null"}`,
        );
        if (p.stopLoss === null) ok("  stopLoss = null (GAP-1 confirmed)");
        else fail("  stopLoss should be null", new Error(`got ${p.stopLoss}`));
        if (p.takeProfit === null) ok("  takeProfit = null (GAP-1 confirmed)");
        else fail("  takeProfit should be null", new Error(`got ${p.takeProfit}`));
      } else {
        fail(`getPositions -> expected 1 long, got ${positions.length}`, new Error("wrong"));
      }
    } catch (e) {
      fail("getPositions (after long open)", e);
    }
  }

  // ── [10] hasOpenOrderWithUserOrderId (after long open) ─────────────────────
  console.log(`\n${Y}[10] hasOpenOrderWithUserOrderId (after open -> true)${Z}`);
  if (longSig) {
    try {
      const has = await adapter.hasOpenOrderWithUserOrderId(42);
      if (has) ok("hasOpenOrderWithUserOrderId(42) = true");
      else fail("hasOpenOrderWithUserOrderId(42) = false (expected true)", new Error("wrong"));
    } catch (e) {
      fail("hasOpenOrderWithUserOrderId (after open)", e);
    }
  }

  // ── [11] pushMarkPrice + closePerp (long) ───────────────────────────────────
  console.log(`\n${Y}[11] pushMarkPrice($66,000) + closePerp LONG${Z}`);
  let longCloseSig = "";
  if (longSig) {
    try {
      await adapter.pushMarkPrice(66_000);
      ok("pushMarkPrice(66000) before close");
      const result = await adapter.closePerp("BTC-USD");
      if ("txSig" in result) {
        longCloseSig = result.txSig;
        ok("closePerp LONG", `txSig=${longCloseSig}`);
        console.log(`    ${C}TX SIG (long close): ${longCloseSig}${Z}`);
      } else {
        fail("closePerp LONG returned alreadyClosed (expected txSig)", new Error("wrong"));
      }
    } catch (e) {
      fail("closePerp LONG", e);
    }
  }

  // ── [12] getPositions (after long close) ───────────────────────────────────
  console.log(`\n${Y}[12] getPositions (expect [])${Z}`);
  if (longCloseSig) {
    try {
      const positions = await adapter.getPositions();
      if (positions.length === 0) ok("getPositions -> [] (long closed)");
      else fail(`getPositions -> expected 0, got ${positions.length}`, new Error("wrong"));
    } catch (e) {
      fail("getPositions (after long close)", e);
    }
  }

  // ── [13] closePerp again -> alreadyClosed ──────────────────────────────────
  console.log(`\n${Y}[13] closePerp again (expect alreadyClosed)${Z}`);
  if (longCloseSig) {
    try {
      const result = await adapter.closePerp("BTC-USD");
      if ("alreadyClosed" in result) ok("closePerp second call -> { alreadyClosed: true }");
      else fail("closePerp returned txSig (expected alreadyClosed)", new Error("wrong"));
    } catch (e) {
      fail("closePerp second call", e);
    }
  }

  // ── [14] pushMarkPrice + openPerp (short) ──────────────────────────────────
  console.log(`\n${Y}[14] pushMarkPrice($66,000) + openPerp SHORT (3300 USDC x2)${Z}`);
  let shortSig = "";
  try {
    await adapter.pushMarkPrice(66_000);
    ok("pushMarkPrice(66000) before short open");
    const result = await adapter.openPerp(
      { market: "BTC-USD", side: "short", leverage: 2, marginUsdc: 3300, stopLoss: null, takeProfit: null },
      43,
    );
    shortSig = result.txSig;
    ok("openPerp SHORT", `txSig=${shortSig}`);
    console.log(`    ${C}TX SIG (short open): ${shortSig}${Z}`);
  } catch (e) {
    fail("openPerp SHORT", e);
  }

  // ── [15] getPositions (after short open) ───────────────────────────────────
  console.log(`\n${Y}[15] getPositions (expect 1 short)${Z}`);
  if (shortSig) {
    try {
      const positions = await adapter.getPositions();
      if (positions.length === 1 && positions[0]!.side === "short") {
        const p = positions[0]!;
        ok(
          "getPositions -> 1 short",
          `entry=$${p.entryPrice.toFixed(2)} mark=$${p.markPrice.toFixed(2)} ` +
          `uPnL=${p.unrealizedPnlUsdc.toFixed(2)} liq=$${p.liqPrice?.toFixed(2) ?? "null"}`,
        );
        if (p.stopLoss === null) ok("  stopLoss = null (GAP-1 confirmed)");
        if (p.takeProfit === null) ok("  takeProfit = null (GAP-1 confirmed)");
      } else {
        fail(`getPositions -> expected 1 short, got ${positions.length}`, new Error("wrong"));
      }
    } catch (e) {
      fail("getPositions (after short open)", e);
    }
  }

  // ── [16] pushMarkPrice + closePerp (short) ─────────────────────────────────
  console.log(`\n${Y}[16] pushMarkPrice($65,000) + closePerp SHORT${Z}`);
  let shortCloseSig = "";
  if (shortSig) {
    try {
      await adapter.pushMarkPrice(65_000);
      ok("pushMarkPrice(65000) before short close");
      const result = await adapter.closePerp("BTC-USD");
      if ("txSig" in result) {
        shortCloseSig = result.txSig;
        ok("closePerp SHORT", `txSig=${shortCloseSig}`);
        console.log(`    ${C}TX SIG (short close): ${shortCloseSig}${Z}`);
      } else {
        fail("closePerp SHORT returned alreadyClosed (expected txSig)", new Error("wrong"));
      }
    } catch (e) {
      fail("closePerp SHORT", e);
    }
  }

  // ── [17] getPositions (after short close) ──────────────────────────────────
  console.log(`\n${Y}[17] getPositions (expect [])${Z}`);
  if (shortCloseSig) {
    try {
      const positions = await adapter.getPositions();
      if (positions.length === 0) ok("getPositions -> [] (short closed)");
      else fail(`getPositions -> expected 0, got ${positions.length}`, new Error("wrong"));
    } catch (e) {
      fail("getPositions (after short close)", e);
    }
  }

  // ── [18] disconnect ─────────────────────────────────────────────────────────
  console.log(`\n${Y}[18] disconnect${Z}`);
  try {
    await adapter.disconnect();
    ok("disconnect (no-op)");
  } catch (e) {
    fail("disconnect", e);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${C}=== SUMMARY ===${Z}`);
  const status = failed === 0 ? `${G}DONE${Z}` : `${R}DONE_WITH_CONCERNS${Z}`;
  console.log(`Status: ${status}  (${passed} passed, ${failed} failed)\n`);

  console.log(`${C}TX SIGS:${Z}`);
  if (longSig)      console.log(`  long  open : ${longSig}`);
  if (longCloseSig) console.log(`  long  close: ${longCloseSig}`);
  if (shortSig)     console.log(`  short open : ${shortSig}`);
  if (shortCloseSig)console.log(`  short close: ${shortCloseSig}`);

  console.log(`\n${B}Results:${Z}`);
  for (const r of results) console.log(`  ${r}`);

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Integration suite fatal:", e);
  process.exit(1);
});
