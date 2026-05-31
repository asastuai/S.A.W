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
    mint: PublicKey;
};
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
export declare const toBaseUnits: (human: number, decimals: number) => BN;
export declare function buildPolicy(input: PolicyBuilderInput): PolicyParams;
export type PolicyEvaluation = {
    kind: "allowed";
} | {
    kind: "requires_approval";
} | {
    kind: "denied";
    reason: PolicyDenyReason;
};
export type PolicyDenyReason = "TokenNotAllowed" | "RecipientNotAllowed" | "ExceedsPerTxLimit" | "ExceedsDailyLimit" | "CooldownActive";
export declare function evaluatePolicyOffChain(policy: PolicyParams & {
    dailySpent: BN;
    lastTxTimestamp: BN;
    lastResetTimestamp: BN;
}, to: PublicKey, mint: PublicKey, amount: BN, nowSec: number): PolicyEvaluation;
