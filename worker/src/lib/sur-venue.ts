/**
 * worker/src/lib/sur-venue.ts
 *
 * SurAdapter -- VenueAdapter backed by SUR (SAW's own perps DEX on Solana).
 * Proves VenueAdapter portability: same SAW dispatch loop works over Adrena
 * (via venue.ts) and SUR (this file) with zero changes to the harness.
 *
 * ── DESIGN DECISIONS ────────────────────────────────────────────────────────
 *
 * SL/TP always null (GAP-1):
 *   SUR has no on-chain stop-loss or take-profit. intent.stopLoss and
 *   intent.takeProfit are accepted but silently ignored in openPerp().
 *   getPositions() always returns stopLoss: null, takeProfit: null.
 *   This is the accepted paper-trade tradeoff -- portability proof, not SL/TP
 *   parity. Production SL/TP for SUR would require off-chain monitoring.
 *
 * Paper-trade oracle (GAP-2):
 *   SUR markPrice is operator-pushed. The adapter IS the engine operator,
 *   so it reads its own pushed price as the fill price for open/close.
 *   pushMarkPrice(price) is exposed as an EXTRA method beyond VenueAdapter
 *   (not in the interface) so the paper-trade harness can set synthetic prices
 *   before openPerp/closePerp. openPerp/closePerp always read the current
 *   on-chain markPrice as fill_price.
 *
 *   Follow-up: in the live dispatch loop, push markPrice from a real reference
 *   (e.g. CoinGecko or Pyth) in agent-wake before dispatch. That sync step is
 *   NOT part of this adapter.
 *
 * Operator requirement:
 *   The authority Keypair MUST be a registered SUR engine operator. On localnet
 *   this is the deployer key (from ~/.config/solana/id.json), which the
 *   sur-adapter-probe.ts initialise sequence registers. For devnet/production,
 *   register the SAW worker keypair via engine.setOperator(authority, true).
 *
 * ensureDeposited semantics:
 *   SUR requires the AccountBalance PDA to have sufficient balance BEFORE
 *   openPerp. Unlike Adrena (collateral flows into the open ix), SUR debits
 *   from a pre-funded vault balance. ensureDeposited() does NOT auto-top-up
 *   the balance -- it throws "insufficient float" if balance < required margin.
 *   Funding is a SETUP STEP done by the harness via vault.deposit().
 *
 * userOrderId:
 *   SUR has no native clientOrderId. ONE Position PDA per (market, trader).
 *   hasOpenOrderWithUserOrderId() ignores the numeric userOrderId and checks
 *   whether Position.size !== 0. openPerp echoes back the caller's userOrderId.
 *
 * Anchor / web3.js:
 *   Uses @coral-xyz/anchor (0.31.x, root node_modules) and @solana/web3.js v1.
 *   IDLs are vendored into worker/src/lib/sur-idl/ for self-containment.
 *
 * ── PROGRAM IDs ─────────────────────────────────────────────────────────────
 *   perp_engine: 28pVZVVY2MyxmukdDTcz85zD88TsfDBhqovgU6ARW6SX
 *   perp_vault:  2iidk56xin9riWJDdfR9BpFU3sLH4oZbPwQrK64Y3xf1
 *   (devnet IDs, also correct for localnet via --bpf-program keypair.json .so)
 *
 * ── SECURITY ────────────────────────────────────────────────────────────────
 *   authority is a Keypair used only at runtime. NEVER write its bytes to disk.
 *   Localnet/devnet throwaway keys only. Production: inject via env/HSM.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import * as path from "path";

import type { VenueAdapter, PerpPosition, OpenResult } from "./venue.js";
import type { PerpIntent } from "./perp-policy.js";

// ── IDL loading ───────────────────────────────────────────────────────────────

// ESM-compatible require for loading JSON IDLs vendored in sur-idl/.
const _require = createRequire(import.meta.url);
const IDL_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "sur-idl",
);

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
const PERP_ENGINE_IDL: any = _require(path.join(IDL_DIR, "perp_engine.json"));
const PERP_VAULT_IDL: any = _require(path.join(IDL_DIR, "perp_vault.json"));
/* eslint-enable @typescript-eslint/no-unsafe-assignment */

// ── Program IDs ───────────────────────────────────────────────────────────────

const PERP_ENGINE_ID = new PublicKey(
  "28pVZVVY2MyxmukdDTcz85zD88TsfDBhqovgU6ARW6SX",
);
const PERP_VAULT_ID = new PublicKey(
  "2iidk56xin9riWJDdfR9BpFU3sLH4oZbPwQrK64Y3xf1",
);

// ── Precision constants ───────────────────────────────────────────────────────

/** 1e6 -- mark_price, entry_price, fill_price, AccountBalance.balance */
const PRICE_PRECISION = 1_000_000;
/** 1e8 -- Position.size and size_delta arg */
const SIZE_PRECISION = 100_000_000;

// ── PDA helpers ───────────────────────────────────────────────────────────────

const u = (s: string): Buffer => Buffer.from(s);

/** Synchronous PDA derivation -- no RPC needed. */
function pdaFind(seeds: (Buffer | Uint8Array)[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

/** AccountBalance PDA: seeds=["balance", trader], program=perp_vault */
function balancePda(trader: PublicKey): PublicKey {
  return pdaFind([u("balance"), trader.toBuffer()], PERP_VAULT_ID);
}

/** perp_vault Operator PDA: seeds=["operator", op], program=perp_vault */
function vaultOperatorPda(op: PublicKey): PublicKey {
  return pdaFind([u("operator"), op.toBuffer()], PERP_VAULT_ID);
}

/** perp_engine Operator PDA: seeds=["operator", op], program=perp_engine */
function engineOperatorPda(op: PublicKey): PublicKey {
  return pdaFind([u("operator"), op.toBuffer()], PERP_ENGINE_ID);
}

/** Market PDA: seeds=["market", market_id_bytes32], program=perp_engine */
function marketPda(marketId: Buffer): PublicKey {
  return pdaFind([u("market"), marketId], PERP_ENGINE_ID);
}

/** Position PDA: seeds=["position", market_id_bytes32, trader], program=perp_engine */
function positionPda(marketId: Buffer, trader: PublicKey): PublicKey {
  return pdaFind([u("position"), marketId, trader.toBuffer()], PERP_ENGINE_ID);
}

/** engine_authority PDA: seeds=["engine_authority"], program=perp_engine */
function engineAuthorityPda(): PublicKey {
  return pdaFind([u("engine_authority")], PERP_ENGINE_ID);
}

/** vault_config PDA: seeds=["vault_config"], program=perp_vault */
function vaultConfigPda(): PublicKey {
  return pdaFind([u("vault_config")], PERP_VAULT_ID);
}

/**
 * Convert symbol ("BTC-USD") to a 32-byte zero-padded Buffer.
 * This is the market_id encoding used in PDA seeds across perp_engine.
 */
function marketIdBuf(symbol: string): Buffer {
  const buf = Buffer.alloc(32);
  Buffer.from(symbol).copy(buf);
  return buf;
}

/**
 * remaining_accounts for open_position / close_position.
 * Order is CRITICAL -- from programs/perp_engine/src/instructions/open_position.rs:
 *   [0] engine_authority PDA          (writable=false, signer=false)
 *   [1] perp_vault program ID         (writable=false, signer=false)
 *   [2] vault_config PDA              (writable=false, signer=false)
 *   [3] vaultOperatorPda(engineAuth)  (writable=false, signer=false)
 *   [4] balancePda(trader)            (writable=true,  signer=false)
 *   [5] balancePda(engineAuthority)   (writable=true,  signer=false)  <- engine pool
 */
function openCloseRemainingAccounts(trader: PublicKey) {
  const engineAuth = engineAuthorityPda();
  const vaultCfg = vaultConfigPda();
  return [
    { pubkey: engineAuth,                   isSigner: false, isWritable: false },
    { pubkey: PERP_VAULT_ID,                isSigner: false, isWritable: false },
    { pubkey: vaultCfg,                     isSigner: false, isWritable: false },
    { pubkey: vaultOperatorPda(engineAuth), isSigner: false, isWritable: false },
    { pubkey: balancePda(trader),           isSigner: false, isWritable: true  },
    { pubkey: balancePda(engineAuth),       isSigner: false, isWritable: true  },
  ];
}

// ── Client-side computation helpers ──────────────────────────────────────────

/**
 * Unrealized PnL in USD (human units).
 * long:  pnl = (markPrice - entryPrice) / PRICE_PRECISION * |size| / SIZE_PRECISION
 * short: pnl = (entryPrice - markPrice) / PRICE_PRECISION * |size| / SIZE_PRECISION
 * All inputs are raw on-chain units (1e6 for prices, 1e8 for size).
 *
 * Verified against probe: long 0.1 BTC $65k->$66k = +$100,
 *                         short 0.1 BTC $66k->$65k = +$100.
 */
export function calcUPnL(
  size: number,
  entryPrice: number,
  markPrice: number,
): number {
  const absSizeHuman = Math.abs(size) / SIZE_PRECISION;
  if (size > 0) {
    return ((markPrice - entryPrice) / PRICE_PRECISION) * absSizeHuman;
  } else {
    return ((entryPrice - markPrice) / PRICE_PRECISION) * absSizeHuman;
  }
}

/**
 * Approximate liquidation price (client-side, not stored on-chain).
 * Uses maintenance_margin_bps=250 (2.5% of notional value).
 *
 * long:  liqPrice = ep_human - (margin_human - maintMargin) / absSize_human
 * short: liqPrice = ep_human + (margin_human - maintMargin) / absSize_human
 *
 * All inputs are raw on-chain units (1e6 prices/margin, 1e8 size).
 * Returns null if result is non-positive (would never liquidate).
 *
 * Verified: long 0.1 BTC @$65k, margin $325 -> liqPrice ~$63,375
 *           short 0.1 BTC @$66k, margin $330 -> liqPrice ~$67,650
 */
export function calcLiqPrice(
  size: number,
  entryPrice: number,
  margin: number,
): number | null {
  const epHuman = entryPrice / PRICE_PRECISION;
  const marginHuman = margin / PRICE_PRECISION;
  const absSizeHuman = Math.abs(size) / SIZE_PRECISION;
  if (absSizeHuman === 0) return null;
  const notionalHuman = absSizeHuman * epHuman;
  const maintMarginHuman = notionalHuman * 0.025; // 250 bps = 2.5%
  if (size > 0) {
    const liq = epHuman - (marginHuman - maintMarginHuman) / absSizeHuman;
    return liq > 0 ? liq : null;
  } else {
    const liq = epHuman + (marginHuman - maintMarginHuman) / absSizeHuman;
    return liq > 0 ? liq : null;
  }
}

// ── Adapter implementation ────────────────────────────────────────────────────

class SurAdapter implements VenueAdapter {
  private readonly connection: Connection;
  private readonly authority: Keypair;
  private readonly engine: Program;
  private readonly vault: Program;
  private readonly defaultMarket: string;

  constructor(connection: Connection, authority: Keypair, market: string) {
    this.connection = connection;
    this.authority = authority;
    this.defaultMarket = market;

    const provider = new AnchorProvider(
      connection,
      new Wallet(authority),
      { commitment: "confirmed" },
    );
    anchor.setProvider(provider);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.engine = new Program(PERP_ENGINE_IDL, provider);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.vault = new Program(PERP_VAULT_IDL, provider);
  }

  // ── ensureUserInitialized ───────────────────────────────────────────────────

  /**
   * Creates the AccountBalance PDA via vault.deposit(0) if it does not exist.
   * vault.deposit uses init_if_needed -- idempotent, safe to call repeatedly.
   */
  async ensureUserInitialized(): Promise<void> {
    const trader = this.authority.publicKey;
    const balPda = balancePda(trader);
    const existing = await this.connection.getAccountInfo(balPda);
    if (existing) return;

    const vaultCfg = vaultConfigPda();
    const usdcVaultAcc = pdaFind([u("usdc_vault")], PERP_VAULT_ID);

    // Read vaultConfig to get the USDC mint (needed for userUsdc param).
    const vcData: any = await (this.vault.account as any).vaultConfig.fetch(vaultCfg);
    const usdcMint: PublicKey = vcData.usdcMint as PublicKey;

    const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } =
      await import("@solana/spl-token");
    const userUsdc = await getAssociatedTokenAddress(usdcMint, trader);

    await (this.vault.methods as any)
      .deposit(new BN(0))
      .accounts({
        vaultConfig: vaultCfg,
        usdcVault: usdcVaultAcc,
        userUsdc,
        accountBalance: balPda,
        depositor: trader,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  // ── ensureDeposited ─────────────────────────────────────────────────────────

  /**
   * Throws "insufficient float: have X USDC, need Y USDC" if the vault balance
   * is below marginUsdc. Does NOT automatically deposit -- funding is a setup
   * step done by the harness. Matches Adrena adapter semantics.
   */
  async ensureDeposited(marginUsdc: number): Promise<void> {
    const balance = await this.getFloatBalanceUsdc();
    if (balance < marginUsdc) {
      throw new Error(
        `insufficient float: have ${balance.toFixed(2)} USDC, need ${marginUsdc.toFixed(2)} USDC`,
      );
    }
  }

  // ── getOraclePrice ──────────────────────────────────────────────────────────

  /**
   * Returns Market.markPrice / PRICE_PRECISION (USD, human units).
   * This is an operator-pushed price (paper-trade oracle). Call pushMarkPrice()
   * first to set a synthetic price. For live dispatch, push from CoinGecko/Pyth
   * before agent-wake.
   */
  async getOraclePrice(market: string): Promise<number> {
    const mktData: any = await (this.engine.account as any).market.fetch(
      marketPda(marketIdBuf(market)),
    );
    return (mktData.markPrice as BN).toNumber() / PRICE_PRECISION;
  }

  // ── hasOpenOrderWithUserOrderId ─────────────────────────────────────────────

  /**
   * Returns true if Position PDA exists and Position.size !== 0.
   * userOrderId is ignored (SUR has no clientOrderId; one PDA per market+trader).
   * Checks the adapter's defaultMarket. Conservative: any non-zero size = open.
   */
  async hasOpenOrderWithUserOrderId(_userOrderId: number): Promise<boolean> {
    const trader = this.authority.publicKey;
    try {
      const posData: any = await (this.engine.account as any).position.fetch(
        positionPda(marketIdBuf(this.defaultMarket), trader),
      );
      return (posData.size as BN).toNumber() !== 0;
    } catch {
      return false;
    }
  }

  // ── openPerp ────────────────────────────────────────────────────────────────

  /**
   * Opens a perp position on SUR.
   *
   * SIZE COMPUTATION:
   *   size_human = (marginUsdc * leverage) / markPrice_human
   *   size_delta  = round(size_human * SIZE_PRECISION), signed for side
   *   sign: positive = long, negative = short
   *
   * FILL PRICE: reads current on-chain Market.markPrice (paper-trade oracle).
   * Call pushMarkPrice() before openPerp to control the synthetic price.
   *
   * SL/TP: intent.stopLoss and intent.takeProfit are SILENTLY IGNORED (GAP-1).
   * SUR has no on-chain SL/TP enforcement. getPositions() returns null for both.
   *
   * NO auto-retry (SAW spec rule 1).
   */
  async openPerp(intent: PerpIntent, userOrderId: number): Promise<OpenResult> {
    const trader = this.authority.publicKey;
    const mktId = marketIdBuf(this.defaultMarket);
    const mktPda = marketPda(mktId);
    const posPda = positionPda(mktId, trader);
    const engineCfgPda = pdaFind([u("engine_config")], PERP_ENGINE_ID);
    const myEngineOp = engineOperatorPda(trader);
    const ra = openCloseRemainingAccounts(trader);

    // Read current markPrice as fill_price (paper-trade oracle).
    const mktData: any = await (this.engine.account as any).market.fetch(mktPda);
    const fillPrice: BN = mktData.markPrice as BN;
    const priceHuman = fillPrice.toNumber() / PRICE_PRECISION;

    // size_delta: (marginUsdc * leverage / price) * SIZE_PRECISION, signed for side.
    const sizeHuman = (intent.marginUsdc * intent.leverage) / priceHuman;
    const sizeRaw = Math.round(sizeHuman * SIZE_PRECISION);
    const sizeDelta = new BN(intent.side === "long" ? sizeRaw : -sizeRaw);

    const txSig: string = await (this.engine.methods as any)
      .openPosition(sizeDelta, fillPrice)
      .accounts({
        engineConfig: engineCfgPda,
        market: mktPda,
        position: posPda,
        trader,
        operatorAccount: myEngineOp,
        operator: trader,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(ra)
      .rpc();

    return { txSig, userOrderId };
  }

  // ── closePerp ───────────────────────────────────────────────────────────────

  /**
   * Closes the open position for the given market.
   * Returns { alreadyClosed: true } if Position PDA is missing or size === 0.
   * Returns { txSig } on successful close.
   * NO auto-retry (SAW spec rule 1).
   */
  async closePerp(
    market: string,
  ): Promise<{ txSig: string } | { alreadyClosed: true }> {
    const trader = this.authority.publicKey;
    const mktId = marketIdBuf(market);
    const mktPda = marketPda(mktId);
    const posPda = positionPda(mktId, trader);
    const engineCfgPda = pdaFind([u("engine_config")], PERP_ENGINE_ID);
    const myEngineOp = engineOperatorPda(trader);
    const ra = openCloseRemainingAccounts(trader);

    // Check if position exists and has a non-zero size.
    let posData: any;
    try {
      posData = await (this.engine.account as any).position.fetch(posPda);
    } catch {
      return { alreadyClosed: true };
    }
    if ((posData.size as BN).toNumber() === 0) {
      return { alreadyClosed: true };
    }

    // Read current markPrice as fill_price.
    const mktData: any = await (this.engine.account as any).market.fetch(mktPda);
    const fillPrice: BN = mktData.markPrice as BN;

    const txSig: string = await (this.engine.methods as any)
      .closePosition(fillPrice)
      .accounts({
        engineConfig: engineCfgPda,
        market: mktPda,
        position: posPda,
        operatorAccount: myEngineOp,
        operator: trader,
      })
      .remainingAccounts(ra)
      .rpc();

    return { txSig };
  }

  // ── getPositions ────────────────────────────────────────────────────────────

  /**
   * Returns all open positions for this authority across the default market.
   * stopLoss and takeProfit are ALWAYS null (GAP-1: SUR has no on-chain SL/TP).
   * Returns [] when no position exists or position.size === 0.
   */
  async getPositions(): Promise<PerpPosition[]> {
    const trader = this.authority.publicKey;
    const mktId = marketIdBuf(this.defaultMarket);

    let posData: any;
    try {
      posData = await (this.engine.account as any).position.fetch(
        positionPda(mktId, trader),
      );
    } catch {
      return [];
    }

    const sizeRaw: number = (posData.size as BN).toNumber();
    if (sizeRaw === 0) return [];

    const mktData: any = await (this.engine.account as any).market.fetch(
      marketPda(mktId),
    );

    const entryRaw = (posData.entryPrice as BN).toNumber();
    const marginRaw = (posData.margin as BN).toNumber();
    const markRaw = (mktData.markPrice as BN).toNumber();

    return [
      {
        market: this.defaultMarket,
        side: sizeRaw > 0 ? "long" : "short",
        baseSize: Math.abs(sizeRaw) / SIZE_PRECISION,
        entryPrice: entryRaw / PRICE_PRECISION,
        markPrice: markRaw / PRICE_PRECISION,
        unrealizedPnlUsdc: calcUPnL(sizeRaw, entryRaw, markRaw),
        liqPrice: calcLiqPrice(sizeRaw, entryRaw, marginRaw),
        stopLoss: null,    // GAP-1: SUR has no on-chain SL/TP
        takeProfit: null,  // GAP-1: SUR has no on-chain SL/TP
      },
    ];
  }

  // ── getFloatBalanceUsdc ─────────────────────────────────────────────────────

  /**
   * Returns AccountBalance.balance / PRICE_PRECISION (human USDC).
   * Returns 0 if the PDA does not exist yet (not yet initialized).
   */
  async getFloatBalanceUsdc(): Promise<number> {
    const trader = this.authority.publicKey;
    try {
      const balData: any = await (this.vault.account as any).accountBalance.fetch(
        balancePda(trader),
      );
      return (balData.balance as BN).toNumber() / PRICE_PRECISION;
    } catch {
      return 0;
    }
  }

  // ── disconnect ──────────────────────────────────────────────────────────────

  /** No-op. SUR has no persistent connection or subscription state. */
  async disconnect(): Promise<void> {
    // intentional no-op
  }

  // ── pushMarkPrice (EXTRA -- not in VenueAdapter interface) ──────────────────

  /**
   * Pushes a new markPrice to SUR's Market PDA via engine.updateMarkPrice().
   * This is an EXTRA method beyond VenueAdapter for the paper-trade harness.
   *
   * openPerp/closePerp read the current on-chain markPrice as fill_price, so
   * call pushMarkPrice() BEFORE each open/close to set a synthetic price.
   *
   * For live dispatch: push from a real reference price (CoinGecko or Pyth)
   * in agent-wake before each dispatch cycle. That sync step is a follow-up.
   *
   * @param price  Human USD price (e.g. 65000.0 for $65,000)
   * @param market Market symbol, defaults to the adapter's default market
   */
  async pushMarkPrice(price: number, market?: string): Promise<void> {
    const trader = this.authority.publicKey;
    const mktSymbol = market ?? this.defaultMarket;
    const engineCfgPda = pdaFind([u("engine_config")], PERP_ENGINE_ID);
    const myEngineOp = engineOperatorPda(trader);
    const rawPrice = new BN(Math.round(price * PRICE_PRECISION));

    await (this.engine.methods as any)
      .updateMarkPrice(rawPrice, rawPrice)
      .accounts({
        engineConfig: engineCfgPda,
        market: marketPda(marketIdBuf(mktSymbol)),
        operatorAccount: myEngineOp,
        operator: trader,
      })
      .rpc();
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/** VenueAdapter interface + paper-trade pushMarkPrice helper. */
export type SurAdapterWithPushPrice = VenueAdapter & {
  /**
   * Push a synthetic markPrice to SUR's Market PDA before open/close.
   * Used by the paper-trade harness and integration tests.
   */
  pushMarkPrice(price: number, market?: string): Promise<void>;
};

/**
 * Creates a SurAdapter backed by SUR perp_engine + perp_vault.
 *
 * @param input.rpcUrl    RPC endpoint (http://127.0.0.1:8899 for localnet)
 * @param input.authority @solana/web3.js v1 Keypair. MUST be a registered SUR
 *                        engine operator (see file header). Never write to disk.
 * @param input.market    Market symbol, default "BTC-USD". Must match an
 *                        on-chain Market PDA created via engine.addMarket().
 *
 * @returns VenueAdapter + pushMarkPrice helper (SurAdapterWithPushPrice)
 */
export function makeSurAdapter(input: {
  rpcUrl: string;
  authority: Keypair;
  market?: string;
}): SurAdapterWithPushPrice {
  const connection = new Connection(input.rpcUrl, "confirmed");
  const market = input.market ?? "BTC-USD";
  return new SurAdapter(connection, input.authority, market);
}
