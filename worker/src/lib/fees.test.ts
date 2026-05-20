/**
 * Run with: node --test --experimental-strip-types worker/src/lib/fees.test.ts
 *
 * Pure-function tests, no I/O.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  calcDailyAumFeeLamports,
  calcPerformanceFeeLamports,
  previewSwapFeeLamports,
  swapFeeBps,
} from "./fees.ts";

const SOL = 1_000_000_000n;

test("swapFeeBps returns 55 (0.55%)", () => {
  assert.equal(swapFeeBps(), 55);
});

test("previewSwapFeeLamports — 1 SOL swap → 0.0055 SOL fee", () => {
  const fee = previewSwapFeeLamports(SOL);
  assert.equal(fee, 5_500_000n);
});

test("previewSwapFeeLamports — 100 SOL swap → 0.55 SOL fee", () => {
  const fee = previewSwapFeeLamports(100n * SOL);
  assert.equal(fee, 550_000_000n);
});

test("calcPerformanceFeeLamports — flat → 0", () => {
  const fee = calcPerformanceFeeLamports(10n * SOL, 10n * SOL);
  assert.equal(fee, 0n);
});

test("calcPerformanceFeeLamports — down → 0", () => {
  const fee = calcPerformanceFeeLamports(10n * SOL, 9n * SOL);
  assert.equal(fee, 0n);
});

test("calcPerformanceFeeLamports — +1 SOL gain → 0.05 SOL fee (5%)", () => {
  const fee = calcPerformanceFeeLamports(10n * SOL, 11n * SOL);
  assert.equal(fee, 50_000_000n);
});

test("calcPerformanceFeeLamports — +100 SOL → 5 SOL", () => {
  const fee = calcPerformanceFeeLamports(0n, 100n * SOL);
  assert.equal(fee, 5n * SOL);
});

test("calcDailyAumFeeLamports — 100 SOL balance → ~0.00274 SOL/day", () => {
  // 100 SOL * 1% / 365 = 0.0027397...
  const fee = calcDailyAumFeeLamports(100n * SOL);
  // expected: 100e9 * 100 / 10000 / 365 = 2_739_726 lamports
  assert.equal(fee, 2_739_726n);
});

test("calcDailyAumFeeLamports — zero balance → zero fee", () => {
  assert.equal(calcDailyAumFeeLamports(0n), 0n);
});

test("calcDailyAumFeeLamports — multiplied by 365 ≈ 1% APY (within rounding)", () => {
  const balance = 1000n * SOL;
  const dailyFee = calcDailyAumFeeLamports(balance);
  const yearly = dailyFee * 365n;
  // 1% of 1000 SOL = 10 SOL = 10_000_000_000
  const expected = 10n * SOL;
  // tolerate integer division dust
  const drift = yearly > expected ? yearly - expected : expected - yearly;
  assert.ok(drift < 1000n, `drift was ${drift} lamports`);
});
