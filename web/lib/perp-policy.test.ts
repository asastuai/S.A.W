import { describe, it, expect } from "vitest";
import { evaluatePerpPolicy, DEFAULT_PERP_POLICY, deriveUserOrderId, type PerpIntent } from "./perp-policy";

const intent = (over: Partial<PerpIntent> = {}): PerpIntent => ({
  market: "SOL-PERP", side: "long", leverage: 4, marginUsdc: 300,
  stopLoss: 58, takeProfit: null, ...over,
});
const ctx = { dailyMarginUsedUsdc: 0, openPositions: 0 };

describe("evaluatePerpPolicy — orden de evaluación de la spec", () => {
  it("deniega mercado no listado (gate 1)", () => {
    const v = evaluatePerpPolicy(intent({ market: "DOGE-PERP" }), DEFAULT_PERP_POLICY, ctx);
    expect(v).toEqual({ verdict: "denied", reason: "market DOGE-PERP not in allowedMarkets" });
  });
  it("deniega leverage excedido (gate 2)", () => {
    expect(evaluatePerpPolicy(intent({ leverage: 20 }), DEFAULT_PERP_POLICY, ctx).verdict).toBe("denied");
  });
  it("deniega margin per-tx excedido (gate 3)", () => {
    expect(evaluatePerpPolicy(intent({ marginUsdc: 600 }), DEFAULT_PERP_POLICY, ctx).verdict).toBe("denied");
  });
  it("deniega budget diario agotado (gate 4)", () => {
    const v = evaluatePerpPolicy(intent({ marginUsdc: 150 }), DEFAULT_PERP_POLICY,
      { ...ctx, dailyMarginUsedUsdc: 900 });
    expect(v.verdict).toBe("denied"); // 900+150 > 1000
  });
  it("deniega maxOpenPositions (gate 5)", () => {
    expect(evaluatePerpPolicy(intent(), DEFAULT_PERP_POLICY, { ...ctx, openPositions: 3 }).verdict).toBe("denied");
  });
  it("deniega sin stop-loss cuando requireStopLoss (gate 6)", () => {
    expect(evaluatePerpPolicy(intent({ stopLoss: null }), DEFAULT_PERP_POLICY, ctx).verdict).toBe("denied");
  });
  it("requiere aprobación arriba del threshold (gate 7)", () => {
    expect(evaluatePerpPolicy(intent({ marginUsdc: 300 }), DEFAULT_PERP_POLICY, ctx).verdict)
      .toBe("requires-approval"); // 300 > 200
  });
  it("permite orden dentro de todos los caps", () => {
    expect(evaluatePerpPolicy(intent({ marginUsdc: 100 }), DEFAULT_PERP_POLICY, ctx).verdict).toBe("allowed");
  });
  it("el orden importa: leverage malo + margin malo reporta leverage (gate 2 antes que 3)", () => {
    const v = evaluatePerpPolicy(intent({ leverage: 20, marginUsdc: 600 }), DEFAULT_PERP_POLICY, ctx);
    expect(v.verdict).toBe("denied");
    if (v.verdict === "allowed") throw new Error("unreachable");
    expect(v.reason).toContain("leverage");
  });
});

describe("deriveUserOrderId", () => {
  it("returns a value in 1..255", () => {
    const id = deriveUserOrderId("123e4567-e89b-12d3-a456-426614174000");
    expect(id).toBeGreaterThanOrEqual(1);
    expect(id).toBeLessThanOrEqual(255);
  });
  it("is deterministic for the same input", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(deriveUserOrderId(uuid)).toBe(deriveUserOrderId(uuid));
  });
  it("produces different values for different uuids", () => {
    const a = deriveUserOrderId("aaaaaaaa-0000-0000-0000-000000000001");
    const b = deriveUserOrderId("bbbbbbbb-0000-0000-0000-000000000002");
    expect(a).not.toBe(b);
  });
});
