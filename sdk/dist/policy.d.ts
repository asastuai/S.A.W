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
