/**
 * Tests for web/lib/db/trading-keys.ts
 * Supabase admin client is fully mocked — no live DB needed.
 *
 * Key invariants verified:
 *   1. getTradingKey returns full row (for server-side decryption).
 *   2. createTradingKey inserts correct fields and returns PUBLIC shape only
 *      (no ciphertext/iv in the return value).
 *   3. Secret material (ciphertext, iv) is NEVER present in createTradingKey's
 *      return value — the no-secret-leakage invariant.
 *   4. createTradingKey inserts pubkey, ciphertext, iv, agent_id.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock ─────────────────────────────────────────────────────────────
// Chainable builder pattern from schedule.perp.test.ts.

type MockResolve = { data?: unknown; error: unknown };

let _insertedPayload: Record<string, unknown> | null = null;
let _capturedFilters: Array<{ col: string; val: unknown }> = [];
let _selectCols = "*";
let _currentMockBuilder: ReturnType<typeof buildSupabaseMock>;

function buildSupabaseMock(resolveWith: MockResolve) {
  const single = () => Promise.resolve(resolveWith);
  const maybeSingle = () => Promise.resolve(resolveWith);

  const builder: any = {
    from(_table: string) {
      return builder;
    },
    select(cols: string) {
      _selectCols = cols;
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
    single,
    maybeSingle,
    then: (res: any, rej: any) => Promise.resolve(resolveWith).then(res, rej),
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: () => _currentMockBuilder,
}));

function resetMock(resolveWith: MockResolve) {
  _insertedPayload = null;
  _capturedFilters = [];
  _selectCols = "*";
  _currentMockBuilder = buildSupabaseMock(resolveWith);
}

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { getTradingKey, createTradingKey } from "./trading-keys";

// ── getTradingKey ─────────────────────────────────────────────────────────────

describe("getTradingKey", () => {
  it("returns null when no row exists", async () => {
    resetMock({ data: null, error: null });
    const result = await getTradingKey("agent-uuid-1");
    expect(result).toBeNull();
  });

  it("returns full row when a row exists (including ciphertext/iv for server use)", async () => {
    const fakeRow = {
      id: "key-uuid-1",
      agent_id: "agent-uuid-1",
      pubkey: "SomePubkey111",
      ciphertext: "base64ciphertext==",
      iv: "base64iv==",
      created_at: "2026-06-12T00:00:00Z",
    };
    resetMock({ data: fakeRow, error: null });

    const result = await getTradingKey("agent-uuid-1");
    expect(result).not.toBeNull();
    expect(result!.pubkey).toBe("SomePubkey111");
    // Full row IS returned (for server-side decryption) — security note
    // says never forward this to HTTP responses, checked separately.
    expect(result!.ciphertext).toBe("base64ciphertext==");
    expect(result!.iv).toBe("base64iv==");
  });

  it("applies eq filter for agent_id", async () => {
    resetMock({ data: null, error: null });
    await getTradingKey("agent-abc");
    expect(_capturedFilters.some((f) => f.col === "agent_id" && f.val === "agent-abc")).toBe(true);
  });

  it("throws when DB errors", async () => {
    resetMock({ data: null, error: { message: "connection refused" } });
    await expect(getTradingKey("agent-uuid-1")).rejects.toThrow("getTradingKey");
  });
});

// ── createTradingKey ──────────────────────────────────────────────────────────

describe("createTradingKey", () => {
  const input = {
    agentId: "agent-uuid-2",
    pubkey: "ExamplePubkey222",
    ciphertext: "encryptedSecretBase64==",
    iv: "ivBase64==",
  };

  it("returns PUBLIC shape — no ciphertext or iv in return value", async () => {
    const fakePublicRow = {
      id: "key-uuid-2",
      agent_id: "agent-uuid-2",
      pubkey: "ExamplePubkey222",
      created_at: "2026-06-12T00:00:00Z",
      // NOTE: ciphertext and iv are NOT selected (see query: "id, agent_id, pubkey, created_at")
    };
    resetMock({ data: fakePublicRow, error: null });

    const result = await createTradingKey(input);

    // Security invariant: secret fields MUST NOT be in the return value.
    expect((result as any).ciphertext).toBeUndefined();
    expect((result as any).iv).toBeUndefined();

    // Public fields ARE present.
    expect(result.pubkey).toBe("ExamplePubkey222");
    expect(result.agent_id).toBe("agent-uuid-2");
    expect(result.id).toBe("key-uuid-2");
  });

  it("inserts agent_id, pubkey, ciphertext, iv", async () => {
    const fakePublicRow = {
      id: "key-uuid-3",
      agent_id: "agent-uuid-2",
      pubkey: "ExamplePubkey222",
      created_at: "2026-06-12T00:00:00Z",
    };
    resetMock({ data: fakePublicRow, error: null });

    await createTradingKey(input);

    expect(_insertedPayload).not.toBeNull();
    expect(_insertedPayload!.agent_id).toBe("agent-uuid-2");
    expect(_insertedPayload!.pubkey).toBe("ExamplePubkey222");
    // ciphertext and iv ARE inserted (they need to be stored) — just not returned.
    expect(_insertedPayload!.ciphertext).toBe("encryptedSecretBase64==");
    expect(_insertedPayload!.iv).toBe("ivBase64==");
  });

  it("throws when DB errors (e.g. unique constraint on agent_id)", async () => {
    resetMock({ data: null, error: { message: "duplicate key value violates unique constraint" } });
    await expect(createTradingKey(input)).rejects.toThrow("createTradingKey");
  });

  it("select query excludes ciphertext and iv columns", async () => {
    const fakePublicRow = {
      id: "key-uuid-4",
      agent_id: "agent-uuid-2",
      pubkey: "ExamplePubkey222",
      created_at: "2026-06-12T00:00:00Z",
    };
    resetMock({ data: fakePublicRow, error: null });

    await createTradingKey(input);

    // The select string must NOT include ciphertext or iv.
    expect(_selectCols).not.toContain("ciphertext");
    expect(_selectCols).not.toContain("iv");
    // But must include pubkey.
    expect(_selectCols).toContain("pubkey");
  });
});
