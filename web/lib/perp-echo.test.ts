// web/lib/perp-echo.test.ts — Task 6: structured echo builder tests (spec verbatim)
import { describe, it, expect } from "vitest";
import { buildPerpEcho } from "./perp-echo";

it("arma el echo estructurado de la spec", () => {
  const echo = buildPerpEcho({
    intent: { market: "SOL-PERP", side: "long", leverage: 4, marginUsdc: 300, stopLoss: 58, takeProfit: null },
    trigger: { kind: "below", asset: "SOL", price: 64 },
    estLiqPrice: 49.6,
    verdict: { verdict: "requires-approval", reason: "margin 300 > approval threshold 200" },
  });
  expect(echo).toContain("LONG SOL-PERP ×4 · margin 300 USDC");
  expect(echo).toContain("entrada: SOL ≤ $64.00");
  expect(echo).toContain("SL $58.00");
  expect(echo).toContain("liq est. ~$49.60");
  expect(echo).toContain("requiere tu aprobación");
});

it("formatea sin liq estimada y para short inmediato", () => {
  const echo = buildPerpEcho({
    intent: { market: "SOL-PERP", side: "short", leverage: 2, marginUsdc: 100, stopLoss: 70, takeProfit: 55 },
    trigger: { kind: "time" }, estLiqPrice: null,
    verdict: { verdict: "allowed" },
  });
  expect(echo).toContain("SHORT SOL-PERP ×2");
  expect(echo).toContain("liq est. —");
});

it("incluye takeProfit cuando está presente", () => {
  const echo = buildPerpEcho({
    intent: { market: "SOL-PERP", side: "long", leverage: 3, marginUsdc: 150, stopLoss: 50, takeProfit: 90 },
    trigger: { kind: "time" },
    estLiqPrice: null,
    verdict: { verdict: "allowed" },
  });
  expect(echo).toContain("TP $90.00");
});

it("policy ok para allowed", () => {
  const echo = buildPerpEcho({
    intent: { market: "SOL-PERP", side: "long", leverage: 2, marginUsdc: 100, stopLoss: 50, takeProfit: null },
    trigger: { kind: "time" },
    estLiqPrice: null,
    verdict: { verdict: "allowed" },
  });
  expect(echo).toContain("policy: ✓ ok");
});

it("formatea trigger above", () => {
  const echo = buildPerpEcho({
    intent: { market: "SOL-PERP", side: "short", leverage: 2, marginUsdc: 100, stopLoss: 80, takeProfit: null },
    trigger: { kind: "above", asset: "SOL", price: 75 },
    estLiqPrice: null,
    verdict: { verdict: "allowed" },
  });
  expect(echo).toContain("entrada: SOL ≥ $75.00");
});

it("formatea trigger dip", () => {
  const echo = buildPerpEcho({
    intent: { market: "SOL-PERP", side: "long", leverage: 2, marginUsdc: 100, stopLoss: 50, takeProfit: null },
    trigger: { kind: "dip", basisPrice: 70, dropPct: 3 },
    estLiqPrice: null,
    verdict: { verdict: "allowed" },
  });
  expect(echo).toContain("entrada: dip −3%");
});

it("entry inmediata cuando kind=time", () => {
  const echo = buildPerpEcho({
    intent: { market: "SOL-PERP", side: "long", leverage: 2, marginUsdc: 100, stopLoss: 50, takeProfit: null },
    trigger: { kind: "time" },
    estLiqPrice: null,
    verdict: { verdict: "allowed" },
  });
  expect(echo).toContain("entrada: inmediata");
});
