/**
 * worker/src/lib/dispatch-perp.test.ts
 *
 * Unit tests for dispatchPerpItem — 9 cases per spec §errores.
 * All external dependencies (VenueAdapter, SupabaseClient) are mocked.
 * No real network calls, no real DB calls.
 *
 * ATOMIC CLAIM (M-5): the claim is modeled as the update returning 0 or 1 rows.
 * NO auto-retry anywhere — if a step fails, status flips to 'failed' and we stop.
 */

import { describe, it, expect, vi } from "vitest";
import { dispatchPerpItem, sumMarginExecutedTodayUTC } from "./dispatch-perp.js";
import { DEFAULT_PERP_POLICY } from "./perp-policy.js";
import type { VenueAdapter } from "./venue.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal queued perp-open scheduled_item row */
function makePerpOpenItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "test-item-uuid-0001",
    action_type: "perp-open",
    status: "queued",
    agent_id: "agent-uuid-0001",
    perp_market: "SOL-PERP",
    perp_side: "long",
    perp_leverage: 4,
    perp_margin_usdc: 100,
    perp_stop_loss: 58,
    perp_take_profit: null,
    perp_user_order_id: 42,
    trigger_kind: "below",
    trigger_target_price: 64,
    ...overrides,
  };
}

/** Build a minimal queued perp-close item */
function makePerpCloseItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "test-item-uuid-close-001",
    action_type: "perp-close",
    status: "queued",
    agent_id: "agent-uuid-0001",
    perp_market: "SOL-PERP",
    perp_user_order_id: 42,
    trigger_kind: "time",
    trigger_target_price: null,
    ...overrides,
  };
}

/** Build a mock VenueAdapter with all happy-path defaults */
function makeMockAdapter(overrides: Partial<VenueAdapter> = {}): VenueAdapter {
  return {
    ensureUserInitialized: vi.fn().mockResolvedValue(undefined),
    ensureDeposited: vi.fn().mockResolvedValue(undefined),
    getOraclePrice: vi.fn().mockResolvedValue(63.5), // just below trigger 64 — fires correctly
    hasOpenOrderWithUserOrderId: vi.fn().mockResolvedValue(false),
    openPerp: vi.fn().mockResolvedValue({ txSig: "mock-tx-sig-abcdef1234", userOrderId: 42 }),
    closePerp: vi.fn().mockResolvedValue({ txSig: "mock-close-tx-sig-9999" }),
    getPositions: vi.fn().mockResolvedValue([]),
    getFloatBalanceUsdc: vi.fn().mockResolvedValue(1000),
    disconnect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as VenueAdapter;
}

/**
 * Build a minimal mock Supabase client.
 * claimedRows: rows returned by the atomic claim update.
 */
function makeDb(claimedRows: unknown[] = [{ id: "test-item-uuid-0001" }]) {
  // We need a flexible mock: from() must return an object that supports
  // both .update(...).eq(...).eq(...).select() (for claim + status writes)
  // and .select(...).eq(...).eq(...).gte() (for sumMarginExecutedTodayUTC).

  // Track calls so tests can inspect them
  const updateCalls: Array<Record<string, unknown>> = [];

  const makeUpdateChain = (vals: Record<string, unknown>) => {
    updateCalls.push(vals);
    const chain: Record<string, unknown> = {};
    chain["eq"] = vi.fn(() => chain);
    // select resolves with claimedRows only for the first update (claim)
    // subsequent updates (status writes) also resolve OK
    chain["select"] = vi.fn().mockResolvedValue({ data: claimedRows, error: null });
    return chain;
  };

  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {};
    chain["eq"] = vi.fn(() => chain);
    chain["gte"] = vi.fn().mockResolvedValue({ data: [], error: null });
    return chain;
  };

  const db = {
    from: vi.fn((_table: string) => ({
      update: vi.fn((vals: Record<string, unknown>) => makeUpdateChain(vals)),
      select: vi.fn((_cols: string) => makeSelectChain()),
    })),
    _updateCalls: updateCalls,
  };

  return db;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("dispatchPerpItem", () => {

  // ── Case 1: Atomic claim returns 0 rows → claimed-elsewhere ────────────────
  it("1. atomic claim returns 0 rows => outcome claimed-elsewhere, no execution", async () => {
    const db = makeDb([]); // 0 rows claimed
    const adapter = makeMockAdapter();

    const result = await dispatchPerpItem({
      db: db as any,
      adapter,
      item: makePerpOpenItem(),
      policy: DEFAULT_PERP_POLICY,
      dailyMarginUsedUsdc: 0,
      openPositions: 0,
    });

    expect(result.outcome).toBe("claimed-elsewhere");
    // Ensure no execution happened
    expect(adapter.openPerp).not.toHaveBeenCalled();
    expect(adapter.getOraclePrice).not.toHaveBeenCalled();
    expect(adapter.ensureDeposited).not.toHaveBeenCalled();
  });

  // ── Case 2: Fire-time policy re-check denies → denied + error_message ──────
  it("2. fire-time policy re-check denies (budget consumed) => status denied", async () => {
    const db = makeDb([{ id: "test-item-uuid-0001" }]);
    const adapter = makeMockAdapter();

    const result = await dispatchPerpItem({
      db: db as any,
      adapter,
      item: makePerpOpenItem({ perp_margin_usdc: 100 }),
      policy: DEFAULT_PERP_POLICY,
      dailyMarginUsedUsdc: 950, // 950 + 100 = 1050 > 1000 budget => denied
      openPositions: 0,
    });

    expect(result.outcome).toBe("denied");
    expect(adapter.openPerp).not.toHaveBeenCalled();
  });

  // ── Case 3: Oracle gap >1.5% beyond trigger → skipped ──────────────────────
  it("3. oracle gap >1.5% beyond trigger => outcome skipped with reason", async () => {
    const db = makeDb([{ id: "test-item-uuid-0001" }]);
    // Trigger = 64, oracle = 62 => gap = |62-64|/64 = 3.125% > 1.5%
    // oracle < trig (below trigger kind) => beyondTrigger = true
    const adapter = makeMockAdapter({
      getOraclePrice: vi.fn().mockResolvedValue(62.0),
    });

    const result = await dispatchPerpItem({
      db: db as any,
      adapter,
      item: makePerpOpenItem({ trigger_kind: "below", trigger_target_price: 64 }),
      policy: DEFAULT_PERP_POLICY,
      dailyMarginUsedUsdc: 0,
      openPositions: 0,
    });

    expect(result.outcome).toBe("skipped");
    expect(adapter.openPerp).not.toHaveBeenCalled();
  });

  // ── Case 4: hasOpenOrderWithUserOrderId true → skipped (double-fire guard) ──
  it("4. hasOpenOrderWithUserOrderId true => skipped (double-fire guard)", async () => {
    const db = makeDb([{ id: "test-item-uuid-0001" }]);
    const adapter = makeMockAdapter({
      getOraclePrice: vi.fn().mockResolvedValue(63.5),
      hasOpenOrderWithUserOrderId: vi.fn().mockResolvedValue(true),
    });

    const result = await dispatchPerpItem({
      db: db as any,
      adapter,
      item: makePerpOpenItem(),
      policy: DEFAULT_PERP_POLICY,
      dailyMarginUsedUsdc: 0,
      openPositions: 0,
    });

    expect(result.outcome).toBe("skipped");
    expect(adapter.openPerp).not.toHaveBeenCalled();
  });

  // ── Case 5: ensureDeposited throws → failed + msg, NO retry ────────────────
  it("5. ensureDeposited throws insufficient float => failed, no retry", async () => {
    const db = makeDb([{ id: "test-item-uuid-0001" }]);
    const adapter = makeMockAdapter({
      getOraclePrice: vi.fn().mockResolvedValue(63.5),
      hasOpenOrderWithUserOrderId: vi.fn().mockResolvedValue(false),
      ensureDeposited: vi.fn().mockRejectedValue(
        new Error("insufficient float: have 50.00 USDC, need 100.00 USDC"),
      ),
    });

    const result = await dispatchPerpItem({
      db: db as any,
      adapter,
      item: makePerpOpenItem(),
      policy: DEFAULT_PERP_POLICY,
      dailyMarginUsedUsdc: 0,
      openPositions: 0,
    });

    expect(result.outcome).toBe("failed");
    // Ensure openPerp was NOT called (no retry, no fallback)
    expect(adapter.openPerp).not.toHaveBeenCalled();
    // ensureDeposited called exactly once — NO retry
    expect(adapter.ensureDeposited).toHaveBeenCalledTimes(1);
  });

  // ── Case 6: openPerp throws → failed + error_message, NO retry ─────────────
  it("6. openPerp throws (venue rejects) => failed + error_message, NO retry", async () => {
    const db = makeDb([{ id: "test-item-uuid-0001" }]);
    const adapter = makeMockAdapter({
      getOraclePrice: vi.fn().mockResolvedValue(63.5),
      hasOpenOrderWithUserOrderId: vi.fn().mockResolvedValue(false),
      ensureDeposited: vi.fn().mockResolvedValue(undefined),
      openPerp: vi.fn().mockRejectedValue(new Error("venue error: slippage exceeded")),
    });

    const result = await dispatchPerpItem({
      db: db as any,
      adapter,
      item: makePerpOpenItem(),
      policy: DEFAULT_PERP_POLICY,
      dailyMarginUsedUsdc: 0,
      openPositions: 0,
    });

    expect(result.outcome).toBe("failed");
    // Called exactly once — NO retry (spec rule 1)
    expect(adapter.openPerp).toHaveBeenCalledTimes(1);
  });

  // ── Case 7: Happy path → done + tx_signature + executed_at ─────────────────
  it("7. happy path => outcome done with tx_signature", async () => {
    const db = makeDb([{ id: "test-item-uuid-0001" }]);
    const adapter = makeMockAdapter({
      getOraclePrice: vi.fn().mockResolvedValue(63.5),
      hasOpenOrderWithUserOrderId: vi.fn().mockResolvedValue(false),
      ensureDeposited: vi.fn().mockResolvedValue(undefined),
      openPerp: vi.fn().mockResolvedValue({ txSig: "realTxSig12345", userOrderId: 42 }),
    });

    const result = await dispatchPerpItem({
      db: db as any,
      adapter,
      item: makePerpOpenItem(),
      policy: DEFAULT_PERP_POLICY,
      dailyMarginUsedUsdc: 0,
      openPositions: 0,
    });

    expect(result.outcome).toBe("done");
    expect(adapter.openPerp).toHaveBeenCalledTimes(1);
  });

  // ── Case 8: perp-close with no position → skipped "position already closed" ─
  it("8. perp-close with no open position => skipped (alreadyClosed)", async () => {
    const db = makeDb([{ id: "test-item-uuid-close-001" }]);
    const adapter = makeMockAdapter({
      closePerp: vi.fn().mockResolvedValue({ alreadyClosed: true }),
    });

    const result = await dispatchPerpItem({
      db: db as any,
      adapter,
      item: makePerpCloseItem(),
      policy: DEFAULT_PERP_POLICY,
      dailyMarginUsedUsdc: 0,
      openPositions: 0,
    });

    expect(result.outcome).toBe("skipped");
    expect(adapter.closePerp).toHaveBeenCalledTimes(1);
  });

  // ── Case 9: requireStopLoss + item without perp_stop_loss → denied ──────────
  it("9. requireStopLoss=true + item without stop_loss => denied (defense in depth)", async () => {
    const db = makeDb([{ id: "test-item-uuid-0001" }]);
    const adapter = makeMockAdapter();

    const result = await dispatchPerpItem({
      db: db as any,
      adapter,
      item: makePerpOpenItem({ perp_stop_loss: null }),
      policy: { ...DEFAULT_PERP_POLICY, requireStopLoss: true },
      dailyMarginUsedUsdc: 0,
      openPositions: 0,
    });

    expect(result.outcome).toBe("denied");
    expect(adapter.openPerp).not.toHaveBeenCalled();
  });

});

// ── sumMarginExecutedTodayUTC tests ───────────────────────────────────────────

describe("sumMarginExecutedTodayUTC", () => {
  it("returns 0 when no done items today", async () => {
    const chain: Record<string, unknown> = {};
    chain["eq"] = vi.fn(() => chain);
    chain["gte"] = vi.fn().mockResolvedValue({ data: [], error: null });

    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(chain),
      }),
    };

    const result = await sumMarginExecutedTodayUTC(db as any, "agent-uuid-0001");
    expect(result).toBe(0);
  });

  it("sums perp_margin_usdc from done items", async () => {
    const rows = [
      { perp_margin_usdc: 100 },
      { perp_margin_usdc: 250 },
      { perp_margin_usdc: 75 },
    ];
    const chain: Record<string, unknown> = {};
    chain["eq"] = vi.fn(() => chain);
    chain["gte"] = vi.fn().mockResolvedValue({ data: rows, error: null });

    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(chain),
      }),
    };

    const result = await sumMarginExecutedTodayUTC(db as any, "agent-uuid-0001");
    expect(result).toBe(425);
  });
});
