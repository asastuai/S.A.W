/**
 * worker/src/lib/dispatch-perp-sur.integration.ts
 *
 * Integration test for the REAL product dispatch path (dispatchPerpItem +
 * evaluatePerpPolicy) against SUR on DEVNET. The SUR counterpart of
 * dispatch-perp.integration.ts (which targets Adrena localnet).
 *
 * Unlike sur-venue.integration.ts (which calls the adapter directly), this
 * exercises the FULL worker flow per item:
 *   atomic claim -> fire-time policy re-check (7 gates) -> oracle gap guard ->
 *   dedup guard -> collateral check -> venue send.
 *
 * WHAT IT PROVES (4 cases):
 *   [A] valid open  -> passes all gates -> opens on SUR devnet (real tx, done)
 *   [B] leverage x10 (> maxLeverage 5) -> evaluatePerpPolicy DENIES -> no tx
 *   [C] market DOGE-USD (not in allowedMarkets) -> DENIES -> no tx
 *   [D] close -> closePerp on SUR devnet (real tx, done); second close -> skipped
 *
 * WHAT IS MOCKED: only the SupabaseClient (in-memory mock simulating the atomic
 * claim + status writes), identical to the Adrena harness. The adapter, the
 * dispatch logic, and the policy evaluation are all REAL.
 *
 * RUN:
 *   cd ~/projects/saw/worker
 *   VENUE=sur VENUE_ENV=devnet \
 *     VENUE_RPC_URL=https://api.devnet.solana.com \
 *     SUR_FUND_USDC=2000 \
 *     pnpm exec tsx src/lib/dispatch-perp-sur.integration.ts
 *
 * SECURITY: reads the operator keypair from ~/.config/solana/id.json (devnet
 * throwaway, registered SUR engine+oracle operator). Held only in memory, never
 * written. Does NOT read from the DB — no SAW_BYOK_ENC_KEY needed.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Keypair } from "@solana/web3.js";
import { makeSurAdapter } from "./sur-venue.js";
import type { SurAdapterWithPushPrice } from "./sur-venue.js";
import { dispatchPerpItem } from "./dispatch-perp.js";
import type { PerpPolicyParams } from "./perp-policy.js";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Terminal colours ──────────────────────────────────────────────────────────
const G = "\x1b[32m";
const R = "\x1b[31m";
const Y = "\x1b[33m";
const C = "\x1b[36m";
const B = "\x1b[90m";
const Z = "\x1b[0m";

let passed = 0;
let failed = 0;
const txSigs: Record<string, string> = {};

function ok(label: string, detail = ""): void {
  passed++;
  console.log(`  ${G}PASS${Z} ${label}${detail ? `  ${B}${detail}${Z}` : ""}`);
}
function fail(label: string, err: unknown): void {
  failed++;
  const msg = (err as Error)?.message ?? String(err);
  console.log(`  ${R}FAIL${Z} ${label}  ${R}${msg}${Z}`);
}
function info(msg: string): void {
  console.log(`${B}  ${msg}${Z}`);
}

// ── SUR devnet policy ───────────────────────────────────────────────────────
// Tuned for SUR's capabilities: market is BTC-USD (not SOL-PERP), and SUR's
// perp_engine has NO on-chain stop-loss/take-profit, so requireStopLoss=false.
// Caps are set so the valid case [A] (margin 500) executes.
const SUR_DEVNET_POLICY: PerpPolicyParams = {
  maxLeverage: 5,
  maxMarginPerTx: 1000,
  dailyMarginBudget: 5000,
  allowedMarkets: ["BTC-USD"],
  maxOpenPositions: 3,
  requireStopLoss: false,
  approvalThresholdMargin: 1000,
};

// ── In-memory DB mock (simulates atomic claim + status writes) ─────────────────
// Identical pattern to dispatch-perp.integration.ts. Returns 1 row for the
// queued->executing claim, logs status writes so we can read back the tx sig.
function makeIntegrationDb(itemId: string): SupabaseClient {
  let currentStatus = "queued";
  const log: Array<{ status: string; tx_signature?: string; error_message?: string }> = [];

  const makeUpdateChain = (vals: Record<string, unknown>) => {
    if (vals["status"]) {
      currentStatus = vals["status"] as string;
      log.push({
        status: currentStatus,
        tx_signature: vals["tx_signature"] as string | undefined,
        error_message: vals["error_message"] as string | undefined,
      });
    }
    const chain: Record<string, unknown> = {};
    chain["eq"] = () => chain;
    chain["select"] = () => Promise.resolve({ data: [{ id: itemId }], error: null });
    return chain;
  };
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {};
    chain["eq"] = () => chain;
    chain["gte"] = () => Promise.resolve({ data: [], error: null });
    return chain;
  };

  const db = {
    from: (_table: string) => ({
      update: (vals: Record<string, unknown>) => makeUpdateChain(vals),
      select: (_cols: string) => makeSelectChain(),
    }),
    _log: log,
    _getStatus: () => currentStatus,
  };
  return db as unknown as SupabaseClient;
}

type LoggedDb = SupabaseClient & {
  _log: Array<{ status: string; tx_signature?: string; error_message?: string }>;
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const rpcUrl = process.env["VENUE_RPC_URL"] ?? "https://api.devnet.solana.com";
  const fundUsdc = Number(process.env["SUR_FUND_USDC"] ?? "2000");

  console.log(`\n${C}=== dispatch-perp SUR Integration (real dispatch path) ===${Z}`);
  console.log(`${B}Date: ${new Date().toISOString()}${Z}`);
  console.log(`${B}RPC: ${rpcUrl}${Z}\n`);

  // Load operator keypair (deployer = registered SUR engine+oracle operator).
  const kpPath = path.join(os.homedir(), ".config", "solana", "id.json");
  let authority: Keypair;
  try {
    const bytes = JSON.parse(fs.readFileSync(kpPath, "utf-8")) as number[];
    authority = Keypair.fromSecretKey(new Uint8Array(bytes));
    console.log(`Operator (deployer): ${authority.publicKey.toBase58()}\n`);
  } catch (e) {
    console.error(`${R}FATAL: keypair load failed: ${(e as Error).message}${Z}`);
    process.exit(1);
  }

  const adapter: SurAdapterWithPushPrice = makeSurAdapter({
    rpcUrl,
    authority,
    market: "BTC-USD",
  });

  // ── Setup: init + fund + clear any leftover position ────────────────────────
  console.log(`${Y}[setup] ensureUserInitialized + fundFloat(${fundUsdc}) + clear leftovers${Z}`);
  try {
    await adapter.ensureUserInitialized();
    await adapter.fundFloat(fundUsdc);
    const bal = await adapter.getFloatBalanceUsdc();
    ok("setup", `float=${bal.toFixed(2)} USDC`);
    // Close any leftover BTC-USD position from a prior run so [A] starts clean.
    await adapter.pushMarkPrice(65_000);
    const pre = await adapter.getPositions();
    if (pre.length > 0) {
      info(`closing ${pre.length} leftover position(s) before run`);
      await adapter.closePerp("BTC-USD");
    }
  } catch (e) {
    fail("setup", e);
    await adapter.disconnect();
    process.exit(1);
  }

  // ── [A] valid open — passes all 7 gates → real tx, done ─────────────────────
  console.log(`\n${Y}[A] dispatchPerpItem — valid open (long, x2, 500 USDC margin)${Z}`);
  try {
    await adapter.pushMarkPrice(65_000); // operator pushes price; dispatch reads it
    const openPositions = (await adapter.getPositions()).length;
    const item = {
      id: "sur-disp-open-A",
      action_type: "perp-open",
      status: "queued",
      agent_id: "sur-integration-agent",
      perp_market: "BTC-USD",
      perp_side: "long",
      perp_leverage: 2,
      perp_margin_usdc: 500,
      perp_stop_loss: null, // SUR has no on-chain SL — policy requireStopLoss=false
      perp_take_profit: null,
      perp_user_order_id: 77,
      trigger_kind: "below",
      trigger_target_price: 65_000, // == oracle → gap 0, gap-guard passes
    };
    const db = makeIntegrationDb(item.id);
    const r = await dispatchPerpItem({
      db,
      adapter,
      item,
      policy: SUR_DEVNET_POLICY,
      dailyMarginUsedUsdc: 0,
      openPositions,
    });
    if (r.outcome === "done") {
      const sig = (db as LoggedDb)._log.find((l) => l.status === "done")?.tx_signature;
      if (sig) txSigs["open"] = sig;
      ok("valid open → done", `tx=${sig ?? "(missing)"}`);
    } else {
      fail("valid open", new Error(`expected done, got ${r.outcome}: ${r.error_message ?? ""}`));
    }
  } catch (e) {
    fail("valid open", e);
  }

  // ── [B] denied: leverage x10 > maxLeverage 5 ────────────────────────────────
  console.log(`\n${Y}[B] dispatchPerpItem — leverage x10 (should be DENIED, no tx)${Z}`);
  try {
    const item = {
      id: "sur-disp-deny-lev",
      action_type: "perp-open",
      status: "queued",
      agent_id: "sur-integration-agent",
      perp_market: "BTC-USD",
      perp_side: "long",
      perp_leverage: 10,
      perp_margin_usdc: 500,
      perp_stop_loss: null,
      perp_take_profit: null,
      perp_user_order_id: 78,
      trigger_kind: "below",
      trigger_target_price: 65_000,
    };
    const db = makeIntegrationDb(item.id);
    const r = await dispatchPerpItem({
      db,
      adapter,
      item,
      policy: SUR_DEVNET_POLICY,
      dailyMarginUsedUsdc: 0,
      openPositions: 0,
    });
    if (r.outcome === "denied" && /leverage/i.test(r.error_message ?? "")) {
      ok("leverage x10 → denied (no tx)", r.error_message);
    } else {
      fail("leverage x10", new Error(`expected denied/leverage, got ${r.outcome}: ${r.error_message ?? ""}`));
    }
  } catch (e) {
    fail("leverage x10", e);
  }

  // ── [C] denied: market DOGE-USD not in allowedMarkets ───────────────────────
  console.log(`\n${Y}[C] dispatchPerpItem — market DOGE-USD (should be DENIED, no tx)${Z}`);
  try {
    const item = {
      id: "sur-disp-deny-mkt",
      action_type: "perp-open",
      status: "queued",
      agent_id: "sur-integration-agent",
      perp_market: "DOGE-USD",
      perp_side: "long",
      perp_leverage: 2,
      perp_margin_usdc: 500,
      perp_stop_loss: null,
      perp_take_profit: null,
      perp_user_order_id: 79,
      trigger_kind: "below",
      trigger_target_price: 65_000,
    };
    const db = makeIntegrationDb(item.id);
    const r = await dispatchPerpItem({
      db,
      adapter,
      item,
      policy: SUR_DEVNET_POLICY,
      dailyMarginUsedUsdc: 0,
      openPositions: 0,
    });
    if (r.outcome === "denied" && /allowedMarkets/i.test(r.error_message ?? "")) {
      ok("DOGE-USD → denied (no tx)", r.error_message);
    } else {
      fail("DOGE-USD", new Error(`expected denied/allowedMarkets, got ${r.outcome}: ${r.error_message ?? ""}`));
    }
  } catch (e) {
    fail("DOGE-USD", e);
  }

  // ── [D] close the position from [A] — real tx, done ─────────────────────────
  console.log(`\n${Y}[D] dispatchPerpItem — close (real tx, done)${Z}`);
  try {
    await adapter.pushMarkPrice(66_000); // close fill price
    const item = {
      id: "sur-disp-close-D",
      action_type: "perp-close",
      status: "queued",
      agent_id: "sur-integration-agent",
      perp_market: "BTC-USD",
      perp_user_order_id: 77,
      trigger_kind: "time",
      trigger_target_price: null,
    };
    const db = makeIntegrationDb(item.id);
    const r = await dispatchPerpItem({
      db,
      adapter,
      item,
      policy: SUR_DEVNET_POLICY,
      dailyMarginUsedUsdc: 0,
      openPositions: 1,
    });
    if (r.outcome === "done") {
      const sig = (db as LoggedDb)._log.find((l) => l.status === "done")?.tx_signature;
      if (sig) txSigs["close"] = sig;
      ok("close → done", `tx=${sig ?? "(missing)"}`);
    } else {
      fail("close", new Error(`expected done, got ${r.outcome}: ${r.error_message ?? ""}`));
    }
  } catch (e) {
    fail("close", e);
  }

  // ── [D2] second close → skipped (alreadyClosed guard) ───────────────────────
  console.log(`\n${Y}[D2] dispatchPerpItem — second close (should be skipped)${Z}`);
  try {
    const item = {
      id: "sur-disp-close-D2",
      action_type: "perp-close",
      status: "queued",
      agent_id: "sur-integration-agent",
      perp_market: "BTC-USD",
      perp_user_order_id: 77,
      trigger_kind: "time",
      trigger_target_price: null,
    };
    const db = makeIntegrationDb(item.id);
    const r = await dispatchPerpItem({
      db,
      adapter,
      item,
      policy: SUR_DEVNET_POLICY,
      dailyMarginUsedUsdc: 0,
      openPositions: 0,
    });
    if (r.outcome === "skipped") ok("second close → skipped (alreadyClosed guard)");
    else fail("second close", new Error(`expected skipped, got ${r.outcome}`));
  } catch (e) {
    fail("second close", e);
  }

  await adapter.disconnect();

  console.log(`\n${C}=== SUMMARY ===${Z}`);
  console.log(`Status: ${failed === 0 ? G + "DONE" : R + "DONE_WITH_CONCERNS"}${Z}  (${passed} passed, ${failed} failed)`);
  if (txSigs["open"]) console.log(`  open  tx: ${txSigs["open"]}`);
  if (txSigs["close"]) console.log(`  close tx: ${txSigs["close"]}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`${R}FATAL: ${(e as Error).message}${Z}`);
  process.exit(1);
});
