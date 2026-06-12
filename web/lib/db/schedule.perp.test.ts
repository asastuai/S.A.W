/**
 * Tests for perp-specific schedule helpers.
 * Supabase admin client is fully mocked — no live DB needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock ─────────────────────────────────────────────────────────────
// We build a minimal chainable mock that records which methods were called and
// returns controlled data. The chain is: from → select/insert/update → eq →
// gte → single / (terminal).
//
// Each call to supabaseAdmin() returns a fresh mock object so tests don't bleed.

type MockResolve = { data?: unknown; count?: number | null; error: unknown };

type MockChain = {
  _table: string;
  _insertPayload: Record<string, unknown> | null;
  _filters: Array<{ col: string; val: unknown }>;
  _gteFilters: Array<{ col: string; val: unknown }>;
  _selectCols: string;
  _resolveWith: MockResolve;
};

function makeChain(resolveWith: MockResolve): MockChain {
  return {
    _table: "",
    _insertPayload: null,
    _filters: [],
    _gteFilters: [],
    _selectCols: "*",
    _resolveWith: resolveWith,
  };
}

let _mockChain: MockChain;
let _insertedPayload: Record<string, unknown> | null = null;
let _capturedFilters: Array<{ col: string; val: unknown }> = [];
let _capturedGteFilters: Array<{ col: string; val: unknown }> = [];
let _capturedSelectCols = "*";

function buildSupabaseMock(resolveWith: MockResolve) {
  _mockChain = makeChain(resolveWith);

  const terminal = () => Promise.resolve(resolveWith);
  const single = () => Promise.resolve(resolveWith);

  const builder: any = {
    from(table: string) {
      _mockChain._table = table;
      return builder;
    },
    select(cols: string) {
      _capturedSelectCols = cols;
      return builder;
    },
    insert(payload: Record<string, unknown>) {
      _insertedPayload = payload;
      return builder;
    },
    eq(col: string, val: unknown) {
      _capturedFilters.push({ col, val });
      return builder;
    },
    gte(col: string, val: unknown) {
      _capturedGteFilters.push({ col, val });
      return builder;
    },
    single,
    then: (res: any, rej: any) => terminal().then(res, rej),
  };
  return builder;
}

// Hoist the mock so the module under test (schedule.ts) picks it up.
// supabaseAdmin() returns the next builder in _mockQueue (FIFO), falling back
// to _currentMockBuilder when the queue is empty. This lets tests that call
// supabaseAdmin() multiple times (e.g. countOpenPerpPositions) return
// different results per call without complex vi.mock resets.
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: () => {
    if (_mockQueue.length > 0) return _mockQueue.shift()!;
    return _currentMockBuilder;
  },
}));

let _currentMockBuilder: ReturnType<typeof buildSupabaseMock>;
let _mockQueue: Array<ReturnType<typeof buildSupabaseMock>> = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetMock(resolveWith: MockResolve) {
  _insertedPayload = null;
  _capturedFilters = [];
  _capturedGteFilters = [];
  _capturedSelectCols = "*";
  _mockQueue = [];
  _currentMockBuilder = buildSupabaseMock(resolveWith);
}

/** Queue up sequential responses for tests that call supabaseAdmin() multiple
 *  times (e.g. countOpenPerpPositions makes two DB round-trips). */
function queueMocks(...responses: Array<MockResolve>) {
  _insertedPayload = null;
  _capturedFilters = [];
  _capturedGteFilters = [];
  _capturedSelectCols = "*";
  _mockQueue = responses.map(buildSupabaseMock);
  // Fallback in case more calls arrive than queued
  _currentMockBuilder = buildSupabaseMock({ data: null, error: null });
}

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
  createScheduledItem,
  sumMarginExecutedTodayUTC,
  countOpenPerpPositions,
} from "./schedule";

// ── createScheduledItem — perp block ─────────────────────────────────────────

describe("createScheduledItem — perp block", () => {
  const baseInput = {
    agentId: "agent-uuid-1",
    actionType: "perp-open" as const,
    amount: 300_000_000, // 300 USDC in micro-USDC
    asset: "SOL" as const,
    reason: "long SOL test",
    scheduledFor: new Date("2026-06-12T10:00:00Z"),
    trigger: { kind: "time" as const },
  };

  it("inserts perp_* columns when perp block is provided", async () => {
    const fakeRow = {
      id: "item-1",
      agent_id: "agent-uuid-1",
      action_type: "perp-open",
      perp_market: "SOL-PERP",
      perp_side: "long",
      perp_leverage: 4,
      perp_margin_usdc: 300,
      perp_stop_loss: 58,
      perp_take_profit: null,
      perp_user_order_id: 42,
    };
    resetMock({ data: fakeRow, error: null });

    await createScheduledItem({
      ...baseInput,
      perp: {
        market: "SOL-PERP",
        side: "long",
        leverage: 4,
        marginUsdc: 300,
        stopLoss: 58,
        takeProfit: null,
        userOrderId: 42,
      },
    });

    expect(_insertedPayload).not.toBeNull();
    expect(_insertedPayload!.perp_market).toBe("SOL-PERP");
    expect(_insertedPayload!.perp_side).toBe("long");
    expect(_insertedPayload!.perp_leverage).toBe(4);
    expect(_insertedPayload!.perp_margin_usdc).toBe(300);
    expect(_insertedPayload!.perp_stop_loss).toBe(58);
    expect(_insertedPayload!.perp_take_profit).toBeNull();
    expect(_insertedPayload!.perp_user_order_id).toBe(42);
  });

  it("inserts null perp_* columns when no perp block is provided", async () => {
    const fakeRow = {
      id: "item-2",
      agent_id: "agent-uuid-1",
      action_type: "pay",
      perp_market: null,
      perp_side: null,
      perp_leverage: null,
      perp_margin_usdc: null,
      perp_stop_loss: null,
      perp_take_profit: null,
      perp_user_order_id: null,
    };
    resetMock({ data: fakeRow, error: null });

    await createScheduledItem({
      agentId: "agent-uuid-1",
      actionType: "pay",
      amount: 1_000_000,
      asset: "SOL",
      scheduledFor: new Date("2026-06-12T10:00:00Z"),
      trigger: { kind: "time" },
    });

    expect(_insertedPayload).not.toBeNull();
    expect(_insertedPayload!.perp_market).toBeNull();
    expect(_insertedPayload!.perp_side).toBeNull();
    expect(_insertedPayload!.perp_leverage).toBeNull();
    expect(_insertedPayload!.perp_margin_usdc).toBeNull();
    expect(_insertedPayload!.perp_stop_loss).toBeNull();
    expect(_insertedPayload!.perp_take_profit).toBeNull();
    expect(_insertedPayload!.perp_user_order_id).toBeNull();
  });

  it("perp-close only needs market (stopLoss/takeProfit/leverage are null)", async () => {
    const fakeRow = {
      id: "item-3",
      agent_id: "agent-uuid-1",
      action_type: "perp-close",
      perp_market: "SOL-PERP",
      perp_side: null,
      perp_leverage: null,
      perp_margin_usdc: null,
      perp_stop_loss: null,
      perp_take_profit: null,
      perp_user_order_id: null,
    };
    resetMock({ data: fakeRow, error: null });

    await createScheduledItem({
      agentId: "agent-uuid-1",
      actionType: "perp-close",
      amount: 0,
      asset: "SOL",
      reason: "close position",
      scheduledFor: new Date("2026-06-12T10:00:00Z"),
      trigger: { kind: "time" },
      perp: {
        market: "SOL-PERP",
        side: null,
        leverage: null,
        marginUsdc: null,
        stopLoss: null,
        takeProfit: null,
        userOrderId: null,
      },
    });

    expect(_insertedPayload!.perp_market).toBe("SOL-PERP");
    expect(_insertedPayload!.perp_side).toBeNull();
    expect(_insertedPayload!.perp_leverage).toBeNull();
    expect(_insertedPayload!.perp_margin_usdc).toBeNull();
  });
});

// ── sumMarginExecutedTodayUTC ─────────────────────────────────────────────────

describe("sumMarginExecutedTodayUTC", () => {
  // We need a chainable builder that supports .select on aggregated data.
  // The function does a select of perp_margin_usdc with filters, then sums
  // the returned rows in JS. Reset mock with the row data it should see.

  it("sums perp_margin_usdc from returned rows", async () => {
    const rows = [
      { perp_margin_usdc: 300 },
      { perp_margin_usdc: 150 },
    ];
    resetMock({ data: rows, error: null });

    const sum = await sumMarginExecutedTodayUTC("agent-uuid-1");
    expect(sum).toBe(450);
  });

  it("returns 0 when no rows match", async () => {
    resetMock({ data: [], error: null });

    const sum = await sumMarginExecutedTodayUTC("agent-uuid-2");
    expect(sum).toBe(0);
  });

  it("returns 0 when data is null", async () => {
    resetMock({ data: null, error: null });

    const sum = await sumMarginExecutedTodayUTC("agent-uuid-3");
    expect(sum).toBe(0);
  });

  it("applies eq filter for agent_id", async () => {
    resetMock({ data: [], error: null });

    await sumMarginExecutedTodayUTC("agent-abc");
    expect(_capturedFilters.some((f) => f.col === "agent_id" && f.val === "agent-abc")).toBe(true);
  });

  it("applies gte filter for today UTC boundary", async () => {
    resetMock({ data: [], error: null });

    await sumMarginExecutedTodayUTC("agent-abc");
    expect(_capturedGteFilters.some((f) => f.col === "executed_at")).toBe(true);
  });
});

// ── countOpenPerpPositions ────────────────────────────────────────────────────

describe("countOpenPerpPositions", () => {
  // The function makes two sequential DB calls (opens query, then closes query).
  // queueMocks() lets each call return a different { count, error } value.

  it("returns opens minus closes: 3 opens, 1 close → 2", async () => {
    // First supabaseAdmin() call (perp-open query) returns count: 3
    // Second supabaseAdmin() call (perp-close query) returns count: 1
    queueMocks(
      { count: 3, error: null },
      { count: 1, error: null },
    );
    const result = await countOpenPerpPositions("agent-uuid-1");
    expect(result).toBe(2);
  });

  it("floors at 0 when closes exceed opens: 1 open, 5 closes → 0", async () => {
    queueMocks(
      { count: 1, error: null },
      { count: 5, error: null },
    );
    const result = await countOpenPerpPositions("agent-uuid-1");
    expect(result).toBe(0);
  });

  it("handles null counts (no rows) as 0", async () => {
    queueMocks(
      { count: null, error: null },
      { count: null, error: null },
    );
    const result = await countOpenPerpPositions("agent-uuid-1");
    expect(result).toBe(0);
  });

  it("throws when the opens query errors", async () => {
    queueMocks(
      { count: null, error: { message: "db error" } },
      { count: 0, error: null },
    );
    await expect(countOpenPerpPositions("agent-uuid-1")).rejects.toThrow("countOpenPerpPositions");
  });

  it("throws when the closes query errors", async () => {
    queueMocks(
      { count: 2, error: null },
      { count: null, error: { message: "db error" } },
    );
    await expect(countOpenPerpPositions("agent-uuid-1")).rejects.toThrow("countOpenPerpPositions");
  });
});
