"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPolicy = buildPolicy;
exports.evaluatePolicyOffChain = evaluatePolicyOffChain;
const anchor_1 = require("@coral-xyz/anchor");
const toBn = (v) => (anchor_1.BN.isBN(v) ? v : new anchor_1.BN(v));
function buildPolicy(input) {
    return {
        dailyLimit: toBn(input.dailyLimit),
        perTxLimit: toBn(input.perTxLimit),
        approvalThreshold: toBn(input.approvalThreshold),
        cooldownSeconds: toBn(input.cooldownSeconds ?? 0),
        recipientAllowlist: input.recipientAllowlist ?? [],
        tokenAllowlist: input.tokenAllowlist ?? [],
    };
}
function evaluatePolicyOffChain(policy, to, mint, usdValue, nowSec) {
    if (policy.tokenAllowlist.length > 0 &&
        !policy.tokenAllowlist.some((p) => p.equals(mint))) {
        return { kind: "denied", reason: "TokenNotAllowed" };
    }
    if (policy.recipientAllowlist.length > 0 &&
        !policy.recipientAllowlist.some((p) => p.equals(to))) {
        return { kind: "denied", reason: "RecipientNotAllowed" };
    }
    if (usdValue.gt(policy.perTxLimit)) {
        return { kind: "denied", reason: "ExceedsPerTxLimit" };
    }
    const daySec = 86400;
    const elapsed = nowSec - policy.lastResetTimestamp.toNumber();
    const currentSpent = elapsed >= daySec ? new anchor_1.BN(0) : policy.dailySpent;
    if (currentSpent.add(usdValue).gt(policy.dailyLimit)) {
        return { kind: "denied", reason: "ExceedsDailyLimit" };
    }
    const cd = policy.cooldownSeconds.toNumber();
    if (cd > 0 &&
        nowSec - policy.lastTxTimestamp.toNumber() < cd) {
        return { kind: "denied", reason: "CooldownActive" };
    }
    if (usdValue.gt(policy.approvalThreshold)) {
        return { kind: "requires_approval" };
    }
    return { kind: "allowed" };
}
