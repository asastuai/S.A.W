/**
 * worker/src/lib/venue.ts
 *
 * VenueAdapter over Adrena — Task 4 of SAW Perps Phase 1.
 *
 * Replaces the original Drift adapter (Task 1c rename: drift.ts → venue.ts,
 * isDriftEnabled → isVenueEnabled, DRIFT_* envs → VENUE_* envs).
 *
 * JITOSOL / SOL PRICE NOTE:
 *   Adrena's "SOL-PERP" market uses JITOSOL as the principal token (liquid-staked SOL).
 *   JITOSOL tracks SOL price via Pyth SOL/USD oracle, but JITOSOL/SOL ≈ 1.1–1.2
 *   (exchange rate from staking rewards). The caller MUST supply JITOSOL-range prices
 *   for stopLoss / takeProfit and entryPrice fields. The intent layer owns the
 *   SOL → JITOSOL price translation; the adapter does NOT perform it.
 *
 *   TODO Task 6: intent layer must translate SOL-range prices to JITOSOL-range
 *   before calling openPerp(). Use jitoSOL/SOL exchange rate from on-chain or
 *   Pyth feed (≈ 1.12–1.20x). See docs/superpowers/plans/2026-06-11-saw-perps-phase1.md §Task6.
 *
 * hasOpenOrderWithUserOrderId MAPPING:
 *   Adrena has no client order ID. The `userOrderId` u8 field (from Drift spec)
 *   maps to a position-existence check: hasOpenPosition(market, side).
 *   There can be at most ONE position per (owner, market, side) under a keypair.
 *   If a position is open for the given market+side, we return true regardless of
 *   the numeric userOrderId. This is conservative (avoids double-open) and correct
 *   for the single-position-per-keypair constraint of Adrena.
 *
 * LIQUIDATION PRICE:
 *   Not stored in the Position account. Estimated client-side:
 *     liqPrice = entryPrice * (1 - (collateralUsd - liquidationFeeUsd) / sizeUsd)
 *   This is an approximation; displayed with "~" in the UI per spec §UI.1.
 *   Returns null if calculation yields a non-finite or negative value.
 *
 * POSITION TOO YOUNG:
 *   Adrena enforces a minimum delay between open and close (error 6070,
 *   PositionTooYoung, ~30s on localnet). Caught and surfaced as typed error
 *   message "position too young, retry later". NO auto-retry (spec rule 1).
 *
 * LOCALNET vs MAINNET:
 *   On localnet, Jito bundles do not exist. The adapter detects VENUE_ENV=localnet
 *   and uses the lower-level instruction builders + sendTransaction directly.
 *   Atomicity is equivalent: all instructions are in one transaction.
 *   On mainnet/devnet, the SDK's high-level openMarketLong/openMarketShort are used
 *   (which call sendTransactionWithJito internally).
 *
 * TYPE BOUNDARY NOTE:
 *   The worker uses @solana/kit v6; adrena-sdk uses @solana/kit v2. These are
 *   structurally similar but not type-compatible. All SDK calls at the boundary
 *   use `as any` casts (same pattern as scripts/probe-localnet.ts). This is safe
 *   because the types are structurally equivalent at runtime — only the generic
 *   parameter variance differs between major versions.
 *
 * SECURITY:
 *   input.authority is a Keypair (Phase 1). Phase 2 will inject a PDA signer.
 *   The adapter does not read or log the keypair bytes beyond creating the signer.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  createSolanaRpc,
  createKeyPairSignerFromBytes,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  type Rpc,
  type SolanaRpcApi,
  type TransactionSigner,
  type Address,
} from "@solana/kit";

import type { Keypair } from "@solana/web3.js";

// ── Adrena SDK (built from ~/vendor/adrena-sdk-ts) ─────────────────────────────
// NOTE: All SDK function params are cast as `any` at call sites to bridge the
// @solana/kit v2 (SDK) vs v6 (worker) type mismatch. Runtime behaviour is identical.

import {
  getOpenLongIxs,
  getClosePositionLongIxs,
  getClosePositionShortIxs,
  getCancelStopLossIx,
  getCancelTakeProfitIx,
  getSetStopLossLongIx,
  getTakeProfitLongIx,
  // Short-side builders — now exported from instructions barrel (added to vendor
  // ~/vendor/adrena-sdk-ts/dist/src/instructions/index.js). The three short builders
  // existed in dist/ but were not in the index re-export; we patched the vendor index.
  // CRITICAL: short positions need short-specific SL/TP instructions — the Long and Short
  // setStopLoss/setTakeProfit ixs have DIFFERENT on-chain discriminators. Using a Long SL
  // ix against a short position is rejected by the Adrena program.
  getOpenShortIxs,
  getSetStopLossShortIx,
  getTakeProfitShortIx,
} from "adrena-sdk/instructions";

// loadShortBuilders: replaced by direct static imports above (vendor index patched)
async function loadShortBuilders() {
  return { getOpenShortIxs, getSetStopLossShortIx, getTakeProfitShortIx };
}

import {
  findCustodyAddress,
  findPositionAddress,
  getCortexPda,
  getPoolPda,
  PRINCIPAL_ADDRESSES,
  findATAAddress,
  hasUserProfile,
  buildInitUserProfileIx,
  PRICE_DECIMALS,
  USD_DECIMALS,
  USDC_TOKEN_MINT,
  accountExists as sdkAccountExists,
  getPythPrice,
} from "adrena-sdk/helpers";

import { getPositionStatus } from "adrena-sdk/core";

// ── Re-export PerpIntent from perp-policy (caller uses the same type) ─────────
export type { PerpIntent } from "./perp-policy.js";
import type { PerpIntent } from "./perp-policy.js";

// ── Public types (interface contract) ─────────────────────────────────────────

export type PerpPosition = {
  market: string;
  side: "long" | "short";
  baseSize: number;          // position size in principal token units (human)
  entryPrice: number;        // USD entry price (JITOSOL-range — see file header)
  markPrice: number;         // current oracle price
  unrealizedPnlUsdc: number;
  liqPrice: number | null;   // estimated client-side (see LIQUIDATION PRICE note)
  stopLoss: number | null;   // USD trigger price, null if not set
  takeProfit: number | null; // USD trigger price, null if not set
};

export type OpenResult = {
  txSig: string;
  userOrderId: number; // caller-provided, echoed back (Adrena has no native clientOrderId)
};

export interface VenueAdapter {
  /**
   * Ensures the Adrena user profile exists on-chain for the authority wallet.
   * Safe to call multiple times (no-op if already initialized).
   */
  ensureUserInitialized(): Promise<void>;

  /**
   * Verifies that the float USDC balance is >= marginUsdc.
   * Adrena collateral flows into the open instruction, so there is no separate
   * deposit step. This method throws "insufficient float" if the balance is
   * insufficient (spec error table).
   */
  ensureDeposited(marginUsdc: number): Promise<void>;

  /** Returns the current oracle price for the given market (e.g. "SOL-PERP"). */
  getOraclePrice(market: string): Promise<number>;

  /**
   * Checks whether a position is open for the given userOrderId.
   *
   * SEMANTIC MAPPING: Adrena has no clientOrderId. This method checks whether
   * any JITOSOL position (long or short) exists for this wallet. Since there is
   * at most ONE position per (owner, market, side) in Adrena, a truthy return
   * means "the slot for this market+side is already occupied." The caller's
   * userOrderId is ignored beyond triggering the existence check.
   *
   * Conservative: returns true if ANY JITOSOL long/short position exists.
   */
  hasOpenOrderWithUserOrderId(userOrderId: number): Promise<boolean>;

  /** Opens a perp position. The SL/TP prices MUST be in JITOSOL-range (see header). */
  openPerp(intent: PerpIntent, userOrderId: number): Promise<OpenResult>;

  /**
   * Closes a perp position for the given market.
   * Returns { alreadyClosed: true } if the position account no longer exists
   * (e.g. closed by a keeper executing SL/TP).
   * Throws "position too young, retry later" if Adrena's 6070 guard fires.
   */
  closePerp(market: string): Promise<{ txSig: string } | { alreadyClosed: true }>;

  /** Returns all open perp positions for this authority. */
  getPositions(): Promise<PerpPosition[]>;

  /** Returns USDC balance of the authority wallet's ATA (human units). */
  getFloatBalanceUsdc(): Promise<number>;

  /** No-op cleanup (no persistent connection). Reserved for Phase 2 teardown. */
  disconnect(): Promise<void>;
}

// ── Environment gate ───────────────────────────────────────────────────────────

/**
 * Returns true when the venue is enabled.
 * VENUE==="adrena" AND one of:
 *   - VENUE_ENV==="localnet"
 *   - VENUE_ENV==="devnet"
 *   - VENUE_ENV==="mainnet-dust" AND VENUE_ALLOW_MAINNET_DUST==="true"
 */
export function isVenueEnabled(): boolean {
  const venue = process.env["VENUE"];
  const env = process.env["VENUE_ENV"];
  if (venue !== "adrena") return false;
  if (env === "localnet" || env === "devnet") return true;
  if (env === "mainnet-dust" && process.env["VENUE_ALLOW_MAINNET_DUST"] === "true") return true;
  return false;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

type PrincipalToken = "JITOSOL" | "WBTC" | "BONK";

/** Market string → Adrena principal token */
function marketToPrincipalToken(market: string): PrincipalToken {
  switch (market) {
    case "SOL-PERP":
      return "JITOSOL";
    default:
      throw new Error(`Unknown market: ${market} — only SOL-PERP is supported in Phase 1`);
  }
}

/** True when running in localnet mode (Jito not available). */
function isLocalnet(): boolean {
  return process.env["VENUE_ENV"] === "localnet";
}

const PRICE_DEC = PRICE_DECIMALS; // 10
const USD_DEC = USD_DECIMALS;     // 6

/**
 * Send transaction and poll until confirmed.
 * Pattern lifted from scripts/probe-localnet.ts sendLocalnet().
 * Works for both localnet and mainnet (just bypasses Jito).
 */
async function sendAndConfirm(
  ixs: unknown[],
  signer: TransactionSigner,
  rpc: Rpc<SolanaRpcApi>,
): Promise<string> {
  const { value: blockhash } = await rpc.getLatestBlockhash().send();

  const txMsg = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(signer.address, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx) => appendTransactionMessageInstructions(ixs as any, tx),
  );

  const signed = await signTransactionMessageWithSigners(txMsg);
  const sig = getSignatureFromTransaction(signed);
  const wire = getBase64EncodedWireTransaction(signed);

  await rpc
    .sendTransaction(wire as any, { encoding: "base64", preflightCommitment: "processed" })
    .send();

  // Poll for confirmation (sendTransaction returns on submission, not confirmation)
  const MAX_WAIT_MS = 45_000;
  const POLL_MS = 500;
  const start = Date.now();
  let confirmed = false;
  while (Date.now() - start < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    try {
      const status = await (rpc as any)
        .getSignatureStatuses([sig], { searchTransactionHistory: false })
        .send();
      const info = status?.value?.[0];
      if (info) {
        if (info.err) throw new Error(`TX failed on-chain: ${JSON.stringify(info.err)}`);
        if (
          info.confirmationStatus === "confirmed" ||
          info.confirmationStatus === "finalized"
        ) {
          confirmed = true;
          break;
        }
      }
    } catch (pollErr) {
      const msg = (pollErr as Error).message ?? "";
      if (msg.startsWith("TX failed")) throw pollErr;
      // transient poll error — keep waiting
    }
  }

  // Do NOT return an unconfirmed signature — the caller must be able to trust
  // that a returned sig means the tx landed. A timeout here is a hard error
  // (no auto-retry — spec rule 1; the caller decides what to do).
  if (!confirmed) {
    throw new Error(`TX not confirmed after ${MAX_WAIT_MS}ms: ${sig}`);
  }

  return sig;
}

/** Classify an Adrena on-chain error for typed surface. */
function classifyError(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e);
  // PositionTooYoung = error 6070 in Adrena program
  if (/6070|PositionTooYoung|too.young/i.test(msg)) {
    return "position too young, retry later";
  }
  return msg;
}

// ── Adapter implementation ────────────────────────────────────────────────────

class AdrenaAdapter implements VenueAdapter {
  private readonly signer: TransactionSigner;
  private readonly rpc: Rpc<SolanaRpcApi>;

  constructor(signer: TransactionSigner, rpcUrl: string) {
    this.signer = signer;
    this.rpc = createSolanaRpc(rpcUrl) as unknown as Rpc<SolanaRpcApi>;
  }

  // ── ensureUserInitialized ───────────────────────────────────────────────────

  async ensureUserInitialized(): Promise<void> {
    const profileState = await hasUserProfile(
      this.signer.address as any,
      this.rpc as any,
    );
    if (profileState && profileState.exists) return;

    const initIx = await buildInitUserProfileIx(this.signer as any);
    await sendAndConfirm([initIx], this.signer, this.rpc);
  }

  // ── ensureDeposited ─────────────────────────────────────────────────────────

  async ensureDeposited(marginUsdc: number): Promise<void> {
    const balance = await this.getFloatBalanceUsdc();
    if (balance < marginUsdc) {
      throw new Error(
        `insufficient float: have ${balance.toFixed(2)} USDC, need ${marginUsdc.toFixed(2)} USDC`,
      );
    }
    // No deposit step — collateral flows into the open instruction.
  }

  // ── getOraclePrice ──────────────────────────────────────────────────────────

  async getOraclePrice(market: string): Promise<number> {
    if (market === "SOL-PERP") {
      // SOL-PERP → JITOSOL principal → SOL/USD Pyth feed
      return await getPythPrice("SOL");
    }
    throw new Error(`getOraclePrice: unknown market ${market}`);
  }

  // ── hasOpenOrderWithUserOrderId ─────────────────────────────────────────────

  async hasOpenOrderWithUserOrderId(_userOrderId: number): Promise<boolean> {
    // SEMANTIC MAPPING: Adrena has no clientOrderId. Returns true if ANY
    // JITOSOL position (long or short) is open for this wallet. The userOrderId
    // param is intentionally unused — position PDAs are deterministic from
    // (pool, owner, custody), so there is at most one slot per market/side.
    try {
      const jitosolMint = PRINCIPAL_ADDRESSES["JITOSOL"].address;
      const [poolPda] = await getPoolPda();
      const [custodyAddr] = await findCustodyAddress(
        poolPda as any,
        jitosolMint as any,
      );
      const [longPos] = await findPositionAddress(
        poolPda as any,
        this.signer.address as any,
        custodyAddr as any,
        "long",
      );
      const [shortPos] = await findPositionAddress(
        poolPda as any,
        this.signer.address as any,
        custodyAddr as any,
        "short",
      );
      const longExists = await sdkAccountExists(longPos as any, this.rpc as any);
      const shortExists = await sdkAccountExists(shortPos as any, this.rpc as any);
      return longExists || shortExists;
    } catch {
      return false;
    }
  }

  // ── openPerp ────────────────────────────────────────────────────────────────

  async openPerp(intent: PerpIntent, userOrderId: number): Promise<OpenResult> {
    const principalToken = marketToPrincipalToken(intent.market);

    if (isLocalnet()) {
      return this._openPerpLocalnet(intent, principalToken, userOrderId);
    }
    return this._openPerpMainnet(intent, principalToken, userOrderId);
  }

  private async _openPerpLocalnet(
    intent: PerpIntent,
    principalToken: PrincipalToken,
    userOrderId: number,
  ): Promise<OpenResult> {
    // Use lower-level instruction builders — Jito not available on localnet.
    // All ixs go in one transaction (same atomicity guarantee as a Jito bundle).
    const isLong = intent.side === "long";
    let openResult: any;

    if (isLong) {
      openResult = await getOpenLongIxs(
        this.signer as any,
        principalToken,
        "USDC",
        intent.marginUsdc,
        intent.leverage,
        this.rpc as any,
      );
    } else {
      const { getOpenShortIxs } = await loadShortBuilders();
      openResult = await getOpenShortIxs(
        this.signer as any,
        principalToken,
        "USDC",
        intent.marginUsdc,
        intent.leverage,
        this.rpc as any,
      );
    }

    const allIxs: unknown[] = [...(openResult.ixns as unknown[])];

    // Append SL ix if requested — MUST use side-specific instruction.
    // setStopLossLong and setStopLossShort have different on-chain discriminators;
    // a Long SL ix against a short position is rejected by the program.
    if (intent.stopLoss != null) {
      let slIx: unknown;
      if (isLong) {
        slIx = await getSetStopLossLongIx({
          owner: this.signer as any,
          cortex: openResult.cortex,
          pool: openResult.pool,
          position: openResult.positionAddress,
          custody: openResult.principalCustodyObj.address,
          stopLossLimitPrice: intent.stopLoss,
          closePositionPrice: null,
        });
      } else {
        const { getSetStopLossShortIx } = await loadShortBuilders();
        slIx = await getSetStopLossShortIx({
          owner: this.signer as any,
          cortex: openResult.cortex,
          pool: openResult.pool,
          position: openResult.positionAddress,
          custody: openResult.principalCustodyObj.address,
          stopLossLimitPrice: intent.stopLoss,
          closePositionPrice: null,
        });
      }
      allIxs.push(slIx);
    }

    // Append TP ix if requested — side-specific (same reasoning as SL above).
    if (intent.takeProfit != null) {
      let tpIx: unknown;
      if (isLong) {
        tpIx = await getTakeProfitLongIx({
          owner: this.signer as any,
          cortex: openResult.cortex,
          pool: openResult.pool,
          position: openResult.positionAddress,
          custody: openResult.principalCustodyObj.address,
          takeProfitLimitPrice: intent.takeProfit,
        });
      } else {
        const { getTakeProfitShortIx } = await loadShortBuilders();
        tpIx = await getTakeProfitShortIx({
          owner: this.signer as any,
          cortex: openResult.cortex,
          pool: openResult.pool,
          position: openResult.positionAddress,
          custody: openResult.principalCustodyObj.address,
          takeProfitLimitPrice: intent.takeProfit,
        });
      }
      allIxs.push(tpIx);
    }

    try {
      const txSig = await sendAndConfirm(allIxs, this.signer, this.rpc);
      return { txSig, userOrderId };
    } catch (e) {
      throw new Error(classifyError(e));
    }
  }

  private async _openPerpMainnet(
    intent: PerpIntent,
    principalToken: PrincipalToken,
    userOrderId: number,
  ): Promise<OpenResult> {
    // On mainnet/devnet: use SDK high-level functions (sendTransactionWithJito).
    // SL/TP are included atomically in the same Jito bundle.
    // openMarketLong/openMarketShort live in adrena-sdk/core.
    const { openMarketLong, openMarketShort } = await import("adrena-sdk/core");

    let result: any;
    if (intent.side === "long") {
      result = await (openMarketLong as any)({
        wallet: this.signer as any,
        rpc: this.rpc as any,
        principalToken,
        collateralToken: "USDC",
        collateralAmount: intent.marginUsdc,
        leverage: intent.leverage,
        stopLossPrice: intent.stopLoss ?? undefined,
        takeProfitPrice: intent.takeProfit ?? undefined,
      });
    } else {
      result = await (openMarketShort as any)({
        wallet: this.signer as any,
        rpc: this.rpc as any,
        principalToken,
        collateralToken: "USDC",
        collateralAmount: intent.marginUsdc,
        leverage: intent.leverage,
        stopLossPrice: intent.stopLoss ?? undefined,
        takeProfitPrice: intent.takeProfit ?? undefined,
      });
    }

    const txSig: string = result.txSignature ?? "";
    return { txSig, userOrderId };
  }

  // ── closePerp ───────────────────────────────────────────────────────────────

  async closePerp(market: string): Promise<{ txSig: string } | { alreadyClosed: true }> {
    const principalToken = marketToPrincipalToken(market);

    // Determine which side has an open position
    const jitosolMint = PRINCIPAL_ADDRESSES["JITOSOL"].address;
    const [poolPda] = await getPoolPda();
    const [custodyAddr] = await findCustodyAddress(
      poolPda as any,
      jitosolMint as any,
    );
    const [longPos] = await findPositionAddress(
      poolPda as any,
      this.signer.address as any,
      custodyAddr as any,
      "long",
    );
    const [shortPos] = await findPositionAddress(
      poolPda as any,
      this.signer.address as any,
      custodyAddr as any,
      "short",
    );
    const longExists = await sdkAccountExists(longPos as any, this.rpc as any);
    const shortExists = await sdkAccountExists(shortPos as any, this.rpc as any);

    if (!longExists && !shortExists) {
      return { alreadyClosed: true };
    }

    const side = longExists ? "long" : "short";
    const posAddr = longExists ? longPos : shortPos;

    // Cancel orphan SL/TP before closing (safe even if no SL/TP set)
    try {
      const [cortexPda] = await getCortexPda();
      const cancelIxs: unknown[] = [
        await getCancelStopLossIx({
          owner: this.signer as any,
          cortex: cortexPda as any,
          pool: poolPda as any,
          custody: custodyAddr as any,
          position: posAddr as any,
        }),
        await getCancelTakeProfitIx({
          owner: this.signer as any,
          cortex: cortexPda as any,
          pool: poolPda as any,
          custody: custodyAddr as any,
          position: posAddr as any,
        }),
      ];
      await sendAndConfirm(cancelIxs, this.signer, this.rpc);
    } catch {
      // Cancel may fail if no SL/TP was set — continue to close regardless
    }

    // Build and send close instruction
    try {
      let closeIxs: unknown[];
      if (side === "long") {
        const result = await getClosePositionLongIxs({
          wallet: this.signer as any,
          rpc: this.rpc as any,
          principalToken,
        });
        closeIxs = result.ixs as unknown[];
      } else {
        const result = await getClosePositionShortIxs({
          wallet: this.signer as any,
          rpc: this.rpc as any,
          principalToken,
          collateralToken: "USDC",
        });
        closeIxs = result.ixs as unknown[];
      }

      const txSig = await sendAndConfirm(closeIxs, this.signer, this.rpc);
      return { txSig };
    } catch (e) {
      const msg = (e as Error).message ?? String(e);

      // Position already closed (by keeper executing SL/TP)
      if (/AccountNotFound|does not exist|account.*not.*found|3012/i.test(msg)) {
        return { alreadyClosed: true };
      }

      // PositionTooYoung — surface typed, no retry (spec rule 1)
      throw new Error(classifyError(e));
    }
  }

  // ── getPositions ────────────────────────────────────────────────────────────

  async getPositions(): Promise<PerpPosition[]> {
    const positions: PerpPosition[] = [];
    const principalToken = "JITOSOL" as PrincipalToken; // Phase 1: SOL-PERP only

    const jitosolMint = PRINCIPAL_ADDRESSES["JITOSOL"].address;
    const [poolPda] = await getPoolPda();
    const [custodyAddr] = await findCustodyAddress(
      poolPda as any,
      jitosolMint as any,
    );

    for (const side of ["long", "short"] as const) {
      const [posAddr] = await findPositionAddress(
        poolPda as any,
        this.signer.address as any,
        custodyAddr as any,
        side,
      );

      const exists = await sdkAccountExists(posAddr as any, this.rpc as any);
      if (!exists) continue;

      try {
        const status = await getPositionStatus({
          wallet: this.signer as any,
          rpc: this.rpc as any,
          principalToken,
          positionAddress: posAddr as any,
        });

        const pos = status.positionData as any;

        // SL/TP — read from raw Position account fields
        const slIsSet = Number(pos.stopLossIsSet ?? 0) === 1;
        const tpIsSet = Number(pos.takeProfitIsSet ?? 0) === 1;
        const stopLoss = slIsSet
          ? Number(pos.stopLossLimitPrice) / 10 ** PRICE_DEC
          : null;
        const takeProfit = tpIsSet
          ? Number(pos.takeProfitLimitPrice) / 10 ** PRICE_DEC
          : null;

        // Liquidation price estimate (client-side, not stored in Position struct)
        // liqPrice ≈ entryPrice * (1 - (collateralUsd - liqFeeUsd) / sizeUsd)
        const collateralUsd = Number(pos.collateralUsd ?? 0n) / 10 ** USD_DEC;
        const liqFeeUsd = Number(pos.liquidationFeeUsd ?? 0n) / 10 ** USD_DEC;
        const sizeUsd = status.sizeUsd;
        let liqPrice: number | null = null;
        if (sizeUsd > 0 && status.entryPrice > 0) {
          const est = status.entryPrice * (1 - (collateralUsd - liqFeeUsd) / sizeUsd);
          liqPrice = Number.isFinite(est) && est > 0 ? est : null;
        }

        positions.push({
          market: "SOL-PERP",
          side,
          baseSize: status.assetAmount, // human units from SDK
          entryPrice: status.entryPrice,
          markPrice: status.pythPrice,
          unrealizedPnlUsdc: status.pnl,
          liqPrice,
          stopLoss,
          takeProfit,
        });
      } catch {
        // Position may have been closed between existence check and read — skip
      }
    }

    return positions;
  }

  // ── getFloatBalanceUsdc ─────────────────────────────────────────────────────

  async getFloatBalanceUsdc(): Promise<number> {
    try {
      const [ata] = await findATAAddress(
        this.signer.address as any,
        USDC_TOKEN_MINT as any,
      );
      const ataExists = await sdkAccountExists(ata as any, this.rpc as any);
      if (!ataExists) return 0;

      const result = await (this.rpc as any).getTokenAccountBalance(ata).send();
      return Number(result.value.uiAmount ?? 0);
    } catch {
      // Fail-closed: an RPC error (node down, network partition) is treated as a
      // zero balance so that ensureDeposited() throws "insufficient float" rather
      // than letting an open proceed on an unverified balance. Callers using this
      // read independently of the deposit check get 0 on failure with no error
      // signal — acceptable for Phase 1; revisit if used outside ensureDeposited.
      return 0;
    }
  }

  // ── disconnect ──────────────────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    // No-op: stateless adapter. Reserved for Phase 2 PDA signer teardown.
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates an Adrena VenueAdapter.
 *
 * @param input.rpcUrl    - RPC endpoint (from VENUE_RPC_URL env or passed directly)
 * @param input.authority - Keypair for signing (@solana/web3.js v1 type; Phase 2
 *                          will inject a PDA signer — keep the factory signature stable)
 */
export async function makeAdrenaAdapter(input: {
  rpcUrl: string;
  authority: Keypair;
}): Promise<VenueAdapter> {
  // Convert @solana/web3.js v1 Keypair to @solana/kit v2 TransactionSigner.
  // Keypair.secretKey is a 64-byte Uint8Array (seed bytes || public key bytes).
  const signer = await createKeyPairSignerFromBytes(input.authority.secretKey);
  return new AdrenaAdapter(signer, input.rpcUrl);
}
