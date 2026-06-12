/**
 * worker/src/lib/demo-perps-full.ts
 *
 * Full end-to-end demo runner for SAW Perps — localnet only.
 *
 * Tests:
 *   1. LONG open via dispatchPerpItem → tx sig + position read
 *   2. LONG close via dispatchPerpItem → tx sig
 *   3. Second close → skipped (alreadyClosed guard)
 *   4. SHORT open via dispatchPerpItem → tx sig + position read
 *   5. SHORT close via dispatchPerpItem → tx sig
 *
 * Output: structured JSON evidence written to stdout (captured by DEMO-RESULTS-perps.md).
 *
 * RUN:
 *   cd ~/projects/saw/worker
 *   VENUE=adrena VENUE_ENV=localnet VENUE_RPC_URL=http://127.0.0.1:8899 \
 *     pnpm exec tsx src/lib/demo-perps-full.ts
 */

import fs from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import { makeAdrenaAdapter } from "./venue.js";
import { dispatchPerpItem } from "./dispatch-perp.js";
import { DEFAULT_PERP_POLICY } from "./perp-policy.js";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Colour helpers ──────────────────────────────────────────────────────────
const G = "\x1b[32m";
const R = "\x1b[31m";
const Y = "\x1b[33m";
const B = "\x1b[34m";
const Z = "\x1b[0m";
const ok = (label: string, extra = "") =>
  console.log(`${G}✓${Z} ${label}${extra ? " — " + extra : ""}`);
const fail = (label: string, e: unknown) =>
  console.error(`${R}✗ ${label}: ${(e as Error)?.message ?? String(e)}${Z}`);
const info = (msg: string) => console.log(`${Y}  ${msg}${Z}`);
const section = (title: string) =>
  console.log(`\n${B}${"═".repeat(60)}${Z}\n${B} ${title}${Z}\n${B}${"═".repeat(60)}${Z}`);

// ── Config ──────────────────────────────────────────────────────────────────
const CONFIG_PATH = path.resolve(
  process.env["LOCALNET_CONFIG"] ??
    path.join(process.env["HOME"] ?? "/home/asastu", "projects/saw/scripts/localnet-adrena/.localnet-config.json"),
);
const RPC_URL = process.env["VENUE_RPC_URL"] ?? "http://127.0.0.1:8899";

// ── Evidence collector ──────────────────────────────────────────────────────
const evidence: {
  timestamp: string;
  wallet: string;
  rpc: string;
  long: {
    openTxSig?: string;
    openPosition?: Record<string, unknown>;
    closeTxSig?: string;
    secondCloseOutcome?: string;
    openOutcome?: string;
    openError?: string;
    closeOutcome?: string;
    closeError?: string;
  };
  short: {
    openTxSig?: string;
    openPosition?: Record<string, unknown>;
    closeTxSig?: string;
    openOutcome?: string;
    openError?: string;
    closeOutcome?: string;
    closeError?: string;
  };
  errors: string[];
} = {
  timestamp: new Date().toISOString(),
  wallet: "",
  rpc: RPC_URL,
  long: {},
  short: {},
  errors: [],
};

// ── In-memory DB mock ──────────────────────────────────────────────────────
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
    chain["select"] = () =>
      Promise.resolve({ data: [{ id: itemId }], error: null });
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
    _getTxSig: () => log.find((l) => l.tx_signature)?.tx_signature,
    _getError: () => log.find((l) => l.error_message)?.error_message,
  };

  return db as unknown as SupabaseClient;
}

// ── Sleep helper ────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  section("SAW Perps End-to-End Demo — Long + Short");
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Config: ${CONFIG_PATH}\n`);

  // ── Load keypair ──────────────────────────────────────────────────────
  let authority: Keypair;
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as Record<string, string>;
    const walletPath = cfg["localWallet"];
    if (!walletPath) throw new Error("localWallet not in config");
    const bytes = JSON.parse(fs.readFileSync(walletPath, "utf-8")) as number[];
    authority = Keypair.fromSecretKey(new Uint8Array(bytes));
    evidence.wallet = authority.publicKey.toBase58();
    ok("keypair loaded", evidence.wallet);
  } catch (e) {
    console.error(`${R}FATAL: keypair load failed: ${(e as Error).message}${Z}`);
    process.exit(1);
  }

  // ── Create adapter ────────────────────────────────────────────────────
  let adapter: Awaited<ReturnType<typeof makeAdrenaAdapter>>;
  try {
    adapter = await makeAdrenaAdapter({ rpcUrl: RPC_URL, authority });
    ok("makeAdrenaAdapter");
  } catch (e) {
    console.error(`${R}FATAL: adapter init: ${(e as Error)?.message ?? String(e)}${Z}`);
    process.exit(1);
  }

  // ── ensureUserInitialized ─────────────────────────────────────────────
  try {
    await adapter.ensureUserInitialized();
    ok("ensureUserInitialized");
  } catch (e) {
    info(`ensureUserInitialized: ${(e as Error)?.message} (may already exist)`);
  }

  // ── Oracle price ──────────────────────────────────────────────────────
  let oraclePrice: number;
  try {
    oraclePrice = await adapter.getOraclePrice("SOL-PERP");
    ok("getOraclePrice", `$${oraclePrice.toFixed(4)}`);
  } catch (e) {
    console.error(`${R}FATAL: getOraclePrice: ${(e as Error)?.message}${Z}`);
    await adapter.disconnect();
    process.exit(1);
  }

  // ── USDC balance ──────────────────────────────────────────────────────
  let balance: number;
  try {
    balance = await adapter.getFloatBalanceUsdc();
    ok("getFloatBalanceUsdc", `${balance.toFixed(2)} USDC`);
    if (balance < 20) {
      console.error(`${R}FATAL: insufficient USDC ${balance} (need 20 for long+short)${Z}`);
      await adapter.disconnect();
      process.exit(1);
    }
  } catch (e) {
    console.error(`${R}FATAL: getFloatBalanceUsdc: ${(e as Error)?.message}${Z}`);
    await adapter.disconnect();
    process.exit(1);
  }

  // ════════════════════════════════════════════════════════════════════════
  // LONG PATH
  // ════════════════════════════════════════════════════════════════════════
  section("LONG PATH: open → read position → wait 35s → close → second close");

  // Trigger 0.1% above oracle so gap < 1.5% (oracle is "below" trigger → beyondTrigger=true)
  // We need beyondTrigger=true (oracle < trigger for "below" kind), gap < 1.5%
  // oracle * 1.001 → gap = 0.1% → ok
  const longTriggerPrice = oraclePrice * 1.001;
  const longStopLoss = oraclePrice * 0.90;   // -10% SL (in JITOSOL-range, same units as oracle)
  const longTakeProfit = oraclePrice * 1.15; // +15% TP
  const MARGIN = 10; // 10 USDC

  info(`oracle=$${oraclePrice.toFixed(4)}, trigger=$${longTriggerPrice.toFixed(4)}`);
  info(`SL=$${longStopLoss.toFixed(4)}, TP=$${longTakeProfit.toFixed(4)}, margin=${MARGIN} USDC`);

  const longOpenItemId = "demo-long-open-" + Date.now();
  const longOpenDb = makeIntegrationDb(longOpenItemId);
  const longOpenItem = {
    id: longOpenItemId,
    action_type: "perp-open",
    status: "queued",
    agent_id: "demo-agent",
    perp_market: "SOL-PERP",
    perp_side: "long",
    perp_leverage: 2,
    perp_margin_usdc: MARGIN,
    perp_stop_loss: longStopLoss,
    perp_take_profit: longTakeProfit,
    perp_user_order_id: 42,
    trigger_kind: "below",
    trigger_target_price: longTriggerPrice,
  };

  console.log(`\n${Y}[LONG-1] dispatchPerpItem — open long${Z}`);
  let longOpened = false;
  try {
    const r = await dispatchPerpItem({
      db: longOpenDb,
      adapter,
      item: longOpenItem,
      policy: DEFAULT_PERP_POLICY,
      dailyMarginUsedUsdc: 0,
      openPositions: 0,
    });

    const dbAny = longOpenDb as any;
    const txSig = dbAny._getTxSig();
    const errMsg = dbAny._getError();

    evidence.long.openOutcome = r.outcome;
    if (r.outcome === "done") {
      evidence.long.openTxSig = txSig;
      longOpened = true;
      ok("LONG open", `outcome=done tx=${txSig}`);
    } else {
      evidence.long.openError = errMsg ?? `outcome=${r.outcome}`;
      info(`LONG open outcome=${r.outcome}${errMsg ? " error=" + errMsg : ""}`);
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    evidence.long.openError = msg;
    evidence.errors.push(`LONG open: ${msg}`);
    fail("LONG open", e);
  }

  // ── Read position after open ──────────────────────────────────────────
  if (longOpened) {
    console.log(`\n${Y}[LONG-2] reading position after open${Z}`);
    try {
      const positions = await adapter.getPositions();
      const longPos = positions.find((p) => p.side === "long");
      if (longPos) {
        evidence.long.openPosition = {
          market: longPos.market,
          side: longPos.side,
          entryPrice: longPos.entryPrice,
          markPrice: longPos.markPrice,
          baseSize: longPos.baseSize,
          unrealizedPnlUsdc: longPos.unrealizedPnlUsdc,
          liqPrice: longPos.liqPrice,
          stopLoss: longPos.stopLoss,
          takeProfit: longPos.takeProfit,
        };
        ok("position read", JSON.stringify(evidence.long.openPosition, null, 0));
      } else {
        info("no long position found (may be propagating)");
        evidence.long.openPosition = { note: "not found after open — check tx" };
      }
    } catch (e) {
      fail("getPositions", e);
      evidence.long.openPosition = { error: (e as Error)?.message };
    }

    // ── Wait for PositionTooYoung guard to clear ──────────────────────────
    console.log(`\n${Y}[LONG-3] waiting 35s for PositionTooYoung guard (error 6070)...${Z}`);
    await sleep(35_000);

    // ── Close long ────────────────────────────────────────────────────────
    console.log(`\n${Y}[LONG-4] dispatchPerpItem — close long${Z}`);
    const longCloseItemId = "demo-long-close-" + Date.now();
    const longCloseDb = makeIntegrationDb(longCloseItemId);
    try {
      const r = await dispatchPerpItem({
        db: longCloseDb,
        adapter,
        item: {
          id: longCloseItemId,
          action_type: "perp-close",
          status: "queued",
          agent_id: "demo-agent",
          perp_market: "SOL-PERP",
          perp_user_order_id: 42,
          trigger_kind: "time",
          trigger_target_price: null,
        },
        policy: DEFAULT_PERP_POLICY,
        dailyMarginUsedUsdc: MARGIN,
        openPositions: 1,
      });

      const dbAny = longCloseDb as any;
      const txSig = dbAny._getTxSig();
      const errMsg = dbAny._getError();
      evidence.long.closeOutcome = r.outcome;

      if (r.outcome === "done") {
        evidence.long.closeTxSig = txSig;
        ok("LONG close", `outcome=done tx=${txSig}`);
      } else if (r.outcome === "skipped") {
        evidence.long.closeTxSig = "skipped:alreadyClosed";
        ok("LONG close", `outcome=skipped (alreadyClosed)`);
      } else {
        evidence.long.closeError = errMsg ?? `outcome=${r.outcome}`;
        fail("LONG close", new Error(`outcome=${r.outcome} error=${errMsg}`));
      }
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      evidence.long.closeError = msg;
      evidence.errors.push(`LONG close: ${msg}`);
      fail("LONG close", e);
    }

    // ── Second close → skipped ────────────────────────────────────────────
    console.log(`\n${Y}[LONG-5] second close → should be skipped (alreadyClosed)${Z}`);
    const longClose2Db = makeIntegrationDb("demo-long-close2-" + Date.now());
    try {
      const r = await dispatchPerpItem({
        db: longClose2Db,
        adapter,
        item: {
          id: "demo-long-close2-" + Date.now(),
          action_type: "perp-close",
          status: "queued",
          agent_id: "demo-agent",
          perp_market: "SOL-PERP",
          perp_user_order_id: 42,
          trigger_kind: "time",
          trigger_target_price: null,
        },
        policy: DEFAULT_PERP_POLICY,
        dailyMarginUsedUsdc: MARGIN,
        openPositions: 0,
      });
      evidence.long.secondCloseOutcome = r.outcome;
      if (r.outcome === "skipped") {
        ok("second close → skipped (alreadyClosed guard works)");
      } else {
        info(`second close outcome=${r.outcome} (expected skipped)`);
      }
    } catch (e) {
      fail("second close", e);
    }
  }

  // Wait a bit between long and short to let chain state settle
  if (longOpened) {
    console.log(`\n${Y}Waiting 5s before opening short...${Z}`);
    await sleep(5_000);
  }

  // ════════════════════════════════════════════════════════════════════════
  // SHORT PATH
  // ════════════════════════════════════════════════════════════════════════
  section("SHORT PATH: open → read position → wait 35s → close");

  // For short: trigger BELOW oracle so oracle is "above" trigger → beyond
  // oracle * 0.999 → gap = 0.1% → ok
  // Re-read oracle price to get fresh value
  let shortOraclePrice: number;
  try {
    shortOraclePrice = await adapter.getOraclePrice("SOL-PERP");
    ok("getOraclePrice (for short)", `$${shortOraclePrice.toFixed(4)}`);
  } catch (e) {
    shortOraclePrice = oraclePrice;
    info(`using cached oracle price $${shortOraclePrice.toFixed(4)}`);
  }

  const shortTriggerPrice = shortOraclePrice * 0.999; // 0.1% below oracle → "above" trigger fired
  const shortStopLoss = shortOraclePrice * 1.10;   // +10% above entry (stop for short)
  const shortTakeProfit = shortOraclePrice * 0.85; // -15% below entry (profit for short)

  info(`oracle=$${shortOraclePrice.toFixed(4)}, trigger=$${shortTriggerPrice.toFixed(4)}`);
  info(`SL=$${shortStopLoss.toFixed(4)}, TP=$${shortTakeProfit.toFixed(4)}, margin=${MARGIN} USDC`);

  const shortOpenItemId = "demo-short-open-" + Date.now();
  const shortOpenDb = makeIntegrationDb(shortOpenItemId);
  const shortOpenItem = {
    id: shortOpenItemId,
    action_type: "perp-open",
    status: "queued",
    agent_id: "demo-agent",
    perp_market: "SOL-PERP",
    perp_side: "short",
    perp_leverage: 2,
    perp_margin_usdc: MARGIN,
    perp_stop_loss: shortStopLoss,
    perp_take_profit: shortTakeProfit,
    perp_user_order_id: 43, // different order ID from long
    trigger_kind: "above",
    trigger_target_price: shortTriggerPrice,
  };

  console.log(`\n${Y}[SHORT-1] dispatchPerpItem — open short${Z}`);
  let shortOpened = false;
  try {
    const r = await dispatchPerpItem({
      db: shortOpenDb,
      adapter,
      item: shortOpenItem,
      policy: DEFAULT_PERP_POLICY,
      dailyMarginUsedUsdc: longOpened ? MARGIN : 0,
      openPositions: 0,
    });

    const dbAny = shortOpenDb as any;
    const txSig = dbAny._getTxSig();
    const errMsg = dbAny._getError();

    evidence.short.openOutcome = r.outcome;
    if (r.outcome === "done") {
      evidence.short.openTxSig = txSig;
      shortOpened = true;
      ok("SHORT open", `outcome=done tx=${txSig}`);
    } else {
      evidence.short.openError = errMsg ?? `outcome=${r.outcome}`;
      fail("SHORT open", new Error(`outcome=${r.outcome}${errMsg ? " error=" + errMsg : ""}`));
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    evidence.short.openError = msg;
    evidence.errors.push(`SHORT open: ${msg}`);
    fail("SHORT open", e);
  }

  // ── Read position after short open ───────────────────────────────────
  if (shortOpened) {
    console.log(`\n${Y}[SHORT-2] reading position after short open${Z}`);
    try {
      const positions = await adapter.getPositions();
      const shortPos = positions.find((p) => p.side === "short");
      if (shortPos) {
        evidence.short.openPosition = {
          market: shortPos.market,
          side: shortPos.side,
          entryPrice: shortPos.entryPrice,
          markPrice: shortPos.markPrice,
          baseSize: shortPos.baseSize,
          unrealizedPnlUsdc: shortPos.unrealizedPnlUsdc,
          liqPrice: shortPos.liqPrice,
          stopLoss: shortPos.stopLoss,
          takeProfit: shortPos.takeProfit,
        };
        ok("position read", JSON.stringify(evidence.short.openPosition, null, 0));
      } else {
        info("no short position found (may be propagating)");
        evidence.short.openPosition = { note: "not found after open — check tx" };
      }
    } catch (e) {
      fail("getPositions", e);
      evidence.short.openPosition = { error: (e as Error)?.message };
    }

    // ── Wait for PositionTooYoung guard ───────────────────────────────────
    console.log(`\n${Y}[SHORT-3] waiting 35s for PositionTooYoung guard...${Z}`);
    await sleep(35_000);

    // ── Close short ───────────────────────────────────────────────────────
    console.log(`\n${Y}[SHORT-4] dispatchPerpItem — close short${Z}`);
    const shortCloseItemId = "demo-short-close-" + Date.now();
    const shortCloseDb = makeIntegrationDb(shortCloseItemId);
    try {
      const r = await dispatchPerpItem({
        db: shortCloseDb,
        adapter,
        item: {
          id: shortCloseItemId,
          action_type: "perp-close",
          status: "queued",
          agent_id: "demo-agent",
          perp_market: "SOL-PERP",
          perp_user_order_id: 43,
          trigger_kind: "time",
          trigger_target_price: null,
        },
        policy: DEFAULT_PERP_POLICY,
        dailyMarginUsedUsdc: MARGIN * 2,
        openPositions: 1,
      });

      const dbAny = shortCloseDb as any;
      const txSig = dbAny._getTxSig();
      const errMsg = dbAny._getError();
      evidence.short.closeOutcome = r.outcome;

      if (r.outcome === "done") {
        evidence.short.closeTxSig = txSig;
        ok("SHORT close", `outcome=done tx=${txSig}`);
      } else if (r.outcome === "skipped") {
        evidence.short.closeTxSig = "skipped:alreadyClosed";
        ok("SHORT close", `outcome=skipped (alreadyClosed)`);
      } else {
        evidence.short.closeError = errMsg ?? `outcome=${r.outcome}`;
        fail("SHORT close", new Error(`outcome=${r.outcome} error=${errMsg}`));
      }
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      evidence.short.closeError = msg;
      evidence.errors.push(`SHORT close: ${msg}`);
      fail("SHORT close", e);
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────
  await adapter.disconnect();

  // ── Print Evidence JSON ─────────────────────────────────────────────────
  section("EVIDENCE JSON");
  console.log(JSON.stringify(evidence, null, 2));

  const allGood =
    evidence.long.openTxSig &&
    (evidence.long.closeTxSig || evidence.long.closeOutcome === "skipped") &&
    evidence.short.openTxSig &&
    (evidence.short.closeTxSig || evidence.short.closeOutcome === "skipped");

  if (allGood) {
    console.log(`\n${G}=== ALL PATHS SUCCEEDED ===${Z}`);
    process.exit(0);
  } else {
    const partial =
      evidence.long.openTxSig || evidence.short.openTxSig;
    if (partial) {
      console.log(`\n${Y}=== PARTIAL SUCCESS — see evidence JSON above ===${Z}`);
    } else {
      console.log(`\n${R}=== FAILED — no tx sigs captured ===${Z}`);
    }
    process.exit(evidence.errors.length > 0 ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(`${R}FATAL: ${(e as Error).message ?? String(e)}${Z}`);
  process.exit(1);
});
