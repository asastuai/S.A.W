"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toBaseUnits = void 0;
exports.buildPolicy = buildPolicy;
exports.evaluatePolicyOffChain = evaluatePolicyOffChain;
const anchor_1 = require("@coral-xyz/anchor");
const toBn = (v) => (anchor_1.BN.isBN(v) ? v : new anchor_1.BN(v));
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
const toBaseUnits = (human, decimals) => new anchor_1.BN(Math.round(human * 10 ** decimals));
exports.toBaseUnits = toBaseUnits;
function buildPolicy(input) {
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
function evaluatePolicyOffChain(policy, to, mint, amount, nowSec) {
    // Mirrors programs/policy_registry/src/check.rs evaluate_policy EXACTLY
    // (ordering matters). `amount` is raw base-units of the policy's pinned
    // mint (M-1), NOT a USD value — there is no oracle.
    if (policy.tokenAllowlist.length > 0 &&
        !policy.tokenAllowlist.some((p) => p.equals(mint))) {
        return { kind: "denied", reason: "TokenNotAllowed" };
    }
    // HARD CAPS first — always Deny, evaluated before the recipient gate so an
    // over-cap unlisted payment Denies (not escalates).
    if (amount.gt(policy.perTxLimit)) {
        return { kind: "denied", reason: "ExceedsPerTxLimit" };
    }
    // L-1: UTC-day bucketing to match on-chain enforcement near midnight UTC.
    const daySec = 86400;
    const utcDay = (ts) => Math.floor(ts / daySec);
    const currentSpent = utcDay(nowSec) > utcDay(policy.lastResetTimestamp.toNumber())
        ? new anchor_1.BN(0)
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
