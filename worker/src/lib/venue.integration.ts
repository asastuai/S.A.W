/**
 * worker/src/lib/venue.integration.ts
 *
 * Manual integration suite for VenueAdapter over Adrena localnet.
 * NOT part of CI (vitest). Run manually:
 *
 *   # Start localnet first:
 *   bash scripts/localnet-adrena/setup.sh
 *
 *   # Then run this suite:
 *   cd worker
 *   VENUE=adrena VENUE_ENV=localnet VENUE_RPC_URL=http://127.0.0.1:8899 \
 *   pnpm exec tsx src/lib/venue.integration.ts
 *
 * WHAT IT TESTS:
 *   1. makeAdrenaAdapter factory
 *   2. ensureUserInitialized (idempotent)
 *   3. getFloatBalanceUsdc
 *   4. ensureDeposited (pass + fail)
 *   5. getOraclePrice("SOL-PERP")
 *   6. hasOpenOrderWithUserOrderId (before open → false)
 *   7. openPerp (long, 10 USDC, x3, SL=50, TP=120) → tx sig
 *   8. getPositions → 1 position, SL/TP visible
 *   9. hasOpenOrderWithUserOrderId (after open → true)
 *  10. wait 35s for PositionTooYoung guard
 *  11. closePerp → tx sig
 *  12. getPositions → []
 *  13. closePerp again → { alreadyClosed: true }
 *
 * All tx sigs are logged to stdout.
 */

import * as fs from "fs";
import * as path from "path";
import { Keypair } from "@solana/web3.js";
import { makeAdrenaAdapter, isVenueEnabled } from "./venue.js";
import type { VenueAdapter } from "./venue.js";
import type { PerpIntent } from "./perp-policy.js";

// Find the repo root by looking for the scripts/ directory
function findRepoRoot(): string {
  // Try env vars first
  if (process.env["REPO_ROOT"]) return process.env["REPO_ROOT"];
  // Walk up from CWD until we find scripts/localnet-adrena/
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "scripts/localnet-adrena/setup.sh"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: assume we're in worker/, so repo root is one level up
  return path.resolve(__dirname, "../../../../");
}

const REPO_ROOT = findRepoRoot();
const SCRIPT_DIR = path.join(REPO_ROOT, "scripts/localnet-adrena");
const CONFIG_PATH = path.join(SCRIPT_DIR, ".localnet-config.json");

// Colours
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
  const line = `  ${G}PASS${Z} ${label}${detail ? `  ${B}${detail}${Z}` : ""}`;
  console.log(line);
  results.push(`PASS: ${label}${detail ? " " + detail : ""}`);
}

function fail(label: string, err: unknown): void {
  failed++;
  const msg = (err as Error)?.message ?? String(err);
  const line = `  ${R}FAIL${Z} ${label}  ${R}${msg}${Z}`;
  console.log(line);
  results.push(`FAIL: ${label} — ${msg}`);
}

async function main(): Promise<void> {
  console.log(`\n${C}=== VenueAdapter Integration Suite — Adrena Localnet ===${Z}`);
  console.log(`${B}Date: ${new Date().toISOString()}${Z}\n`);

  // ── Environment check ──────────────────────────────────────────────────────

  if (!isVenueEnabled()) {
    console.error(
      `${R}ERROR: isVenueEnabled() = false.${Z}\n` +
      `Set VENUE=adrena VENUE_ENV=localnet before running.\n` +
      `Also ensure VENUE_RPC_URL=http://127.0.0.1:8899 is set.`
    );
    process.exit(1);
  }

  const rpcUrl = process.env["VENUE_RPC_URL"] ?? "http://127.0.0.1:8899";
  console.log(`RPC: ${rpcUrl}`);

  // ── Load keypair from config ────────────────────────────────────────────────
  let cfg: Record<string, string>;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    console.log(`Config: ${CONFIG_PATH}`);
  } catch {
    console.error(
      `${R}FATAL: config not found at ${CONFIG_PATH}${Z}\n` +
      `Run: bash scripts/localnet-adrena/setup.sh first.`
    );
    process.exit(1);
  }

  let authority: Keypair;
  try {
    const bytes = JSON.parse(fs.readFileSync(cfg["localWallet"]!, "utf-8")) as number[];
    authority = Keypair.fromSecretKey(new Uint8Array(bytes));
    console.log(`Wallet: ${authority.publicKey.toBase58()}\n`);
  } catch (e) {
    console.error(`${R}FATAL: keypair load failed: ${(e as Error).message}${Z}`);
    process.exit(1);
  }

  // ── [0] makeAdrenaAdapter ──────────────────────────────────────────────────
  console.log(`${Y}[0] makeAdrenaAdapter${Z}`);
  let adapter: VenueAdapter;
  try {
    adapter = await makeAdrenaAdapter({ rpcUrl, authority });
    ok("makeAdrenaAdapter");
  } catch (e) {
    fail("makeAdrenaAdapter", e);
    console.error("Cannot continue without adapter.");
    process.exit(1);
  }

  // ── [1] ensureUserInitialized ──────────────────────────────────────────────
  console.log(`\n${Y}[1] ensureUserInitialized${Z}`);
  try {
    await adapter.ensureUserInitialized();
    ok("ensureUserInitialized (first call)");
    // Call again — should be a no-op
    await adapter.ensureUserInitialized();
    ok("ensureUserInitialized (idempotent — no-op on second call)");
  } catch (e) {
    fail("ensureUserInitialized", e);
  }

  // ── [2] getFloatBalanceUsdc ────────────────────────────────────────────────
  console.log(`\n${Y}[2] getFloatBalanceUsdc${Z}`);
  let balance = 0;
  try {
    balance = await adapter.getFloatBalanceUsdc();
    ok("getFloatBalanceUsdc", `${balance.toFixed(2)} USDC`);
  } catch (e) {
    fail("getFloatBalanceUsdc", e);
  }

  // ── [3] ensureDeposited ────────────────────────────────────────────────────
  console.log(`\n${Y}[3] ensureDeposited${Z}`);
  try {
    await adapter.ensureDeposited(10); // should pass — setup.sh funds 10,000 USDC
    ok("ensureDeposited(10) — pass (sufficient balance)");
  } catch (e) {
    fail("ensureDeposited(10) — expected PASS", e);
  }
  try {
    await adapter.ensureDeposited(999_999_999); // should fail
    fail("ensureDeposited(999999999) — expected FAIL but got PASS", new Error("should have thrown"));
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("insufficient float")) {
      ok("ensureDeposited(999999999) — correctly throws 'insufficient float'", msg);
    } else {
      fail("ensureDeposited(999999999) — wrong error", e);
    }
  }

  // ── [4] getOraclePrice ─────────────────────────────────────────────────────
  console.log(`\n${Y}[4] getOraclePrice${Z}`);
  try {
    const price = await adapter.getOraclePrice("SOL-PERP");
    ok("getOraclePrice(SOL-PERP)", `$${price.toFixed(2)}`);
  } catch (e) {
    fail("getOraclePrice(SOL-PERP)", e);
  }

  // ── [5] hasOpenOrderWithUserOrderId (before open) ─────────────────────────
  console.log(`\n${Y}[5] hasOpenOrderWithUserOrderId (before open)${Z}`);
  try {
    const has = await adapter.hasOpenOrderWithUserOrderId(42);
    if (!has) {
      ok("hasOpenOrderWithUserOrderId(42) = false (no position open yet)");
    } else {
      // May be true if a previous run left a position
      ok("hasOpenOrderWithUserOrderId(42) = true (leftover from prior run — closing first)");
      try {
        const closeResult = await adapter.closePerp("SOL-PERP");
        if ("txSig" in closeResult) {
          console.log(`    ${B}Pre-cleanup closePerp: ${closeResult.txSig}${Z}`);
        }
      } catch {
        // ignore cleanup errors
      }
    }
  } catch (e) {
    fail("hasOpenOrderWithUserOrderId", e);
  }

  // ── [6] openPerp ──────────────────────────────────────────────────────────
  console.log(`\n${Y}[6] openPerp (long, 10 USDC, x3, SL=50, TP=120)${Z}`);
  const intent: PerpIntent = {
    market: "SOL-PERP",
    side: "long",
    leverage: 3,
    marginUsdc: 10,
    stopLoss: 50,
    takeProfit: 120,
  };
  let openSig = "";
  try {
    const result = await adapter.openPerp(intent, 42);
    openSig = result.txSig;
    ok("openPerp", `txSig=${openSig}`);
    console.log(`    ${C}TX SIG (open+SL+TP): ${openSig}${Z}`);
  } catch (e) {
    fail("openPerp", e);
    console.error(`    Note: if this is a collateral error, re-run setup.sh to refresh the funded ATA.`);
  }

  // ── [7] getPositions ──────────────────────────────────────────────────────
  console.log(`\n${Y}[7] getPositions (expect 1 position with SL+TP)${Z}`);
  if (openSig) {
    try {
      const positions = await adapter.getPositions();
      if (positions.length === 1) {
        const p = positions[0]!;
        const slOk = p.stopLoss !== null;
        const tpOk = p.takeProfit !== null;
        ok(
          "getPositions → 1 position",
          `side=${p.side} entry=${p.entryPrice?.toFixed(2)} sl=${p.stopLoss?.toFixed(2)} tp=${p.takeProfit?.toFixed(2)} liq=${p.liqPrice?.toFixed(2) ?? "null"}`,
        );
        if (slOk) ok("  stopLoss is set", `$${p.stopLoss?.toFixed(2)}`);
        else fail("  stopLoss should be set", new Error("null"));
        if (tpOk) ok("  takeProfit is set", `$${p.takeProfit?.toFixed(2)}`);
        else fail("  takeProfit should be set", new Error("null"));
      } else {
        fail(`getPositions → expected 1, got ${positions.length}`, new Error("wrong count"));
      }
    } catch (e) {
      fail("getPositions", e);
    }
  } else {
    console.log(`  ${Y}SKIP: openPerp failed${Z}`);
  }

  // ── [8] hasOpenOrderWithUserOrderId (after open) ──────────────────────────
  console.log(`\n${Y}[8] hasOpenOrderWithUserOrderId (after open → true)${Z}`);
  if (openSig) {
    try {
      const has = await adapter.hasOpenOrderWithUserOrderId(42);
      if (has) {
        ok("hasOpenOrderWithUserOrderId(42) = true (position open)");
      } else {
        fail("hasOpenOrderWithUserOrderId(42) = false (expected true)", new Error("wrong"));
      }
    } catch (e) {
      fail("hasOpenOrderWithUserOrderId (after open)", e);
    }
  }

  // ── [9] Wait for PositionTooYoung guard ───────────────────────────────────
  if (openSig) {
    console.log(`\n${Y}[9] Waiting 35s for PositionTooYoung guard (error 6070)...${Z}`);
    await new Promise((r) => setTimeout(r, 35_000));
    console.log(`    35s elapsed.`);
  }

  // ── [10] closePerp ────────────────────────────────────────────────────────
  console.log(`\n${Y}[10] closePerp${Z}`);
  if (openSig) {
    try {
      const result = await adapter.closePerp("SOL-PERP");
      if ("txSig" in result) {
        ok("closePerp", `txSig=${result.txSig}`);
        console.log(`    ${C}TX SIG (closeLong): ${result.txSig}${Z}`);
      } else {
        fail("closePerp returned alreadyClosed (expected txSig)", new Error("alreadyClosed"));
      }
    } catch (e) {
      fail("closePerp", e);
    }
  }

  // ── [11] getPositions (expect []) ─────────────────────────────────────────
  console.log(`\n${Y}[11] getPositions (expect [])${Z}`);
  if (openSig) {
    try {
      const positions = await adapter.getPositions();
      if (positions.length === 0) {
        ok("getPositions → [] (position closed)");
      } else {
        fail(`getPositions → expected 0, got ${positions.length}`, new Error("not empty"));
      }
    } catch (e) {
      fail("getPositions (after close)", e);
    }
  }

  // ── [12] closePerp again → alreadyClosed ─────────────────────────────────
  console.log(`\n${Y}[12] closePerp again (expect alreadyClosed)${Z}`);
  if (openSig) {
    try {
      const result = await adapter.closePerp("SOL-PERP");
      if ("alreadyClosed" in result) {
        ok("closePerp (second call) → { alreadyClosed: true }");
      } else {
        fail("closePerp returned txSig (expected alreadyClosed)", new Error("unexpected txSig"));
      }
    } catch (e) {
      fail("closePerp (second call)", e);
    }
  }

  // ── [13] disconnect ───────────────────────────────────────────────────────
  console.log(`\n${Y}[13] disconnect${Z}`);
  try {
    await adapter.disconnect();
    ok("disconnect (no-op)");
  } catch (e) {
    fail("disconnect", e);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${C}=== SUMMARY ===${Z}`);
  const status = failed === 0 ? `${G}DONE${Z}` : `${R}DONE_WITH_CONCERNS${Z}`;
  console.log(`Status: ${status}  (${passed} passed, ${failed} failed)`);
  console.log(results.map((r) => `  ${r}`).join("\n"));

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Integration suite fatal:", e);
  process.exit(1);
});
