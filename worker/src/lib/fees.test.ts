/**
 * Run with: pnpm vitest run src/lib/fees.test.ts
 * (ported from node:test when vitest was added to worker — same assertions)
 *
 * Pure-function tests, no I/O.
 */

import { describe, it, expect } from "vitest";
import {
  calcDailyAumFeeLamports,
  calcPerformanceFeeLamports,
  previewSwapFeeLamports,
  swapFeeBps,
} from "./fees";

const SOL = 1_000_000_000n;

describe("swapFeeBps", () => {
  it("returns 55 (0.55%)", () => {
    expect(swapFeeBps()).toBe(55);
  });
});

describe("previewSwapFeeLamports", () => {
  it("1 SOL swap → 0.0055 SOL fee", () => {
    expect(previewSwapFeeLamports(SOL)).toBe(5_500_000n);
  });
  it("100 SOL swap → 0.55 SOL fee", () => {
    expect(previewSwapFeeLamports(100n * SOL)).toBe(550_000_000n);
  });
});

describe("calcPerformanceFeeLamports", () => {
  it("flat → 0", () => {
    expect(calcPerformanceFeeLamports(10n * SOL, 10n * SOL)).toBe(0n);
  });
  it("down → 0", () => {
    expect(calcPerformanceFeeLamports(10n * SOL, 9n * SOL)).toBe(0n);
  });
  it("+1 SOL gain → 0.05 SOL fee (5%)", () => {
    expect(calcPerformanceFeeLamports(10n * SOL, 11n * SOL)).toBe(50_000_000n);
  });
  it("+100 SOL → 5 SOL", () => {
    expect(calcPerformanceFeeLamports(0n, 100n * SOL)).toBe(5n * SOL);
  });
});

describe("calcDailyAumFeeLamports", () => {
  it("100 SOL balance → ~0.00274 SOL/day", () => {
    // 100 SOL * 1% / 365 = 0.0027397...
    // expected: 100e9 * 100 / 10000 / 365 = 2_739_726 lamports
    expect(calcDailyAumFeeLamports(100n * SOL)).toBe(2_739_726n);
  });
  it("zero balance → zero fee", () => {
    expect(calcDailyAumFeeLamports(0n)).toBe(0n);
  });
  it("multiplied by 365 ≈ 1% APY (within rounding)", () => {
    const balance = 1000n * SOL;
    const dailyFee = calcDailyAumFeeLamports(balance);
    const yearly = dailyFee * 365n;
    // 1% of 1000 SOL = 10 SOL = 10_000_000_000
    const expected = 10n * SOL;
    // tolerate integer division dust
    const drift = yearly > expected ? yearly - expected : expected - yearly;
    expect(drift).toBeLessThan(1000n);
  });
});
