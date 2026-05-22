import { describe, it, expect } from "vitest";
import {
  AUM_FEE_BPS_PER_YEAR,
  BPS_DENOM,
  PERFORMANCE_FEE_BPS,
  SWAP_FEE_BPS,
  calcDailyAumFeeLamports,
  calcPerformanceFeeLamports,
  formatSol,
  lamportsToSol,
  previewSwapFeeLamports,
  swapFeeBps,
} from "./fees";

const SOL = 1_000_000_000n;

describe("fee constants", () => {
  it("are the documented values", () => {
    expect(SWAP_FEE_BPS).toBe(55n);
    expect(PERFORMANCE_FEE_BPS).toBe(500n);
    expect(AUM_FEE_BPS_PER_YEAR).toBe(100n);
    expect(BPS_DENOM).toBe(10_000n);
    expect(swapFeeBps()).toBe(55);
  });
});

describe("previewSwapFeeLamports", () => {
  it("0 input → 0 fee", () => {
    expect(previewSwapFeeLamports(0n)).toBe(0n);
  });
  it("1 SOL @ 55 bps → 0.0055 SOL", () => {
    expect(previewSwapFeeLamports(SOL)).toBe(5_500_000n);
  });
  it("100 SOL @ 55 bps → 0.55 SOL", () => {
    expect(previewSwapFeeLamports(100n * SOL)).toBe(550_000_000n);
  });
});

describe("calcPerformanceFeeLamports", () => {
  it("flat returns 0", () => {
    expect(calcPerformanceFeeLamports(10n * SOL, 10n * SOL)).toBe(0n);
  });
  it("loss returns 0", () => {
    expect(calcPerformanceFeeLamports(10n * SOL, 5n * SOL)).toBe(0n);
  });
  it("+1 SOL gain → 5% = 0.05 SOL fee", () => {
    expect(calcPerformanceFeeLamports(10n * SOL, 11n * SOL)).toBe(50_000_000n);
  });
  it("+100 SOL gain → 5% = 5 SOL fee", () => {
    expect(calcPerformanceFeeLamports(0n, 100n * SOL)).toBe(5n * SOL);
  });
});

describe("calcDailyAumFeeLamports", () => {
  it("zero balance → zero fee", () => {
    expect(calcDailyAumFeeLamports(0n)).toBe(0n);
  });
  it("100 SOL → ~0.00274 SOL/day (1% APY / 365)", () => {
    expect(calcDailyAumFeeLamports(100n * SOL)).toBe(2_739_726n);
  });
  it("365 daily fees ≈ 1% of balance (rounding tolerance)", () => {
    const bal = 1000n * SOL;
    const yearly = calcDailyAumFeeLamports(bal) * 365n;
    const expected = 10n * SOL;
    const drift = yearly > expected ? yearly - expected : expected - yearly;
    expect(drift).toBeLessThan(1000n);
  });
});

describe("formatters", () => {
  it("lamportsToSol", () => {
    expect(lamportsToSol(SOL)).toBe(1);
    expect(lamportsToSol(500_000_000n)).toBe(0.5);
  });
  it("formatSol default 4 decimals", () => {
    expect(formatSol(SOL)).toBe("1.0000 SOL");
  });
  it("formatSol custom decimals", () => {
    expect(formatSol(1_234_567n, 9)).toBe("0.001234567 SOL");
  });
});
