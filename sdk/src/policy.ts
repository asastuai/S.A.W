import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { PolicyParams } from "./types";

export type PolicyBuilderInput = {
  dailyLimit: number | BN;
  perTxLimit: number | BN;
  approvalThreshold: number | BN;
  cooldownSeconds?: number | BN;
  recipientAllowlist?: PublicKey[];
  tokenAllowlist?: PublicKey[];
  // M-1: the SPL mint the spend limits are denominated in (required).
  mint: PublicKey;
};

const toBn = (v: number | BN): BN => (BN.isBN(v) ? v : new BN(v));

/**
 * Convert a human amount (e.g. 120 "USDC") into the raw base-units a policy cap
 * must be expressed in, scaled by the MINT's decimals.
 *
 * v1.5 critique #2: on-chain evaluate_policy compares caps against raw token
 * base-units of the policy's pinned mint (M-1) — there is NO oracle. So caps
 * MUST be built with that mint's ACTUAL decimals; hardcoding a count (e.g. 6)
 * silently mis-scales a 9-decimal mint by 1000x. Pair this with
 * WalletHandle.fetchMintDecimals(mint) (or getMint(...).decimals) instead of a
 * fixed constant when constructing dailyLimit / perTxLimit / approvalThreshold.
 */
export const toBaseUnits = (human: number, decimals: number): BN =>
  new BN(Math.round(human * 10 ** decimals));

export function buildPolicy(input: PolicyBuilderInput): PolicyParams {
  return {
    dailyLimit: toBn(input.dailyLimit),
    perTxLimit: toBn(input.perTxLimit),
    approvalThreshold: toBn(input.approvalThreshold),
    cooldownSeconds: toBn(input.cooldownSeconds ?? 0),
    recipientAllowlist: input.recipientAllowlist ?? [],
    tokenAllowlist: input.tokenAllowlist ?? [],
    mint: input.mint,
  };
}

export type PolicyEvaluation =
  | { kind: "allowed" }
  | { kind: "requires_approval" }
  | { kind: "denied"; reason: PolicyDenyReason };

export type PolicyDenyReason =
  | "TokenNotAllowed"
  | "RecipientNotAllowed"
  | "ExceedsPerTxLimit"
  | "ExceedsDailyLimit"
  | "CooldownActive";

export function evaluatePolicyOffChain(
  policy: PolicyParams & {
    dailySpent: BN;
    lastTxTimestamp: BN;
    lastResetTimestamp: BN;
  },
  to: PublicKey,
  mint: PublicKey,
  amount: BN,
  nowSec: number
): PolicyEvaluation {
  // Mirrors programs/policy_registry/src/check.rs evaluate_policy EXACTLY
  // (ordering matters). `amount` is raw base-units of the policy's pinned
  // mint (M-1), NOT a USD value — there is no oracle.
  if (
    policy.tokenAllowlist.length > 0 &&
    !policy.tokenAllowlist.some((p) => p.equals(mint))
  ) {
    return { kind: "denied", reason: "TokenNotAllowed" };
  }

  // HARD CAPS first — always Deny, evaluated before the recipient gate so an
  // over-cap unlisted payment Denies (not escalates).
  if (amount.gt(policy.perTxLimit)) {
    return { kind: "denied", reason: "ExceedsPerTxLimit" };
  }

  // L-1: UTC-day bucketing to match on-chain enforcement near midnight UTC.
  const daySec = 86_400;
  const utcDay = (ts: number) => Math.floor(ts / daySec);
  const currentSpent =
    utcDay(nowSec) > utcDay(policy.lastResetTimestamp.toNumber())
      ? new BN(0)
      : policy.dailySpent;
  if (currentSpent.add(amount).gt(policy.dailyLimit)) {
    return { kind: "denied", reason: "ExceedsDailyLimit" };
  }

  const cd = policy.cooldownSeconds.toNumber();
  if (cd > 0 && nowSec - policy.lastTxTimestamp.toNumber() < cd) {
    return { kind: "denied", reason: "CooldownActive" };
  }

  // v1.5 critique #1: recipient_allowlist is a pre-authorized auto-spend set.
  // An unlisted recipient (including the empty-list default) escalates to
  // owner approval — never silently allowed.
  if (!policy.recipientAllowlist.some((p) => p.equals(to))) {
    return { kind: "requires_approval" };
  }

  if (amount.gt(policy.approvalThreshold)) {
    return { kind: "requires_approval" };
  }

  return { kind: "allowed" };
}
