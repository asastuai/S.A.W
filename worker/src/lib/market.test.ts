/**
 * Run with: pnpm vitest run src/lib/market.test.ts
 *
 * Pure-function tests, no I/O.
 */

import { describe, it, expect } from "vitest";
import { perpMarketToAsset } from "./market";

describe("perpMarketToAsset", () => {
  it("maps BTC-USD to BTC", () => {
    expect(perpMarketToAsset("BTC-USD")).toBe("BTC");
  });
  it("maps SOL-USD to SOL", () => {
    expect(perpMarketToAsset("SOL-USD")).toBe("SOL");
  });
  it("maps ETH-USD to ETH", () => {
    expect(perpMarketToAsset("ETH-USD")).toBe("ETH");
  });
  it("uppercases and trims a lowercase symbol", () => {
    expect(perpMarketToAsset("btc-usd")).toBe("BTC");
  });
});
