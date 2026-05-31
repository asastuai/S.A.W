use anchor_lang::prelude::*;

use crate::state::{CheckOutcome, DenyReason, PolicyAccount};

pub fn evaluate_policy(
    policy: &PolicyAccount,
    to: Pubkey,
    mint: Pubkey,
    // RAW base-units of the policy's pinned mint (M-1), NOT a USD value — there
    // is no oracle. Caps are coherent because every payment uses one mint.
    amount: u64,
    now: i64,
) -> CheckOutcome {
    // Token gate (unchanged). M-1 also pins the mint at the caller.
    if !policy.token_allowlist.is_empty() && !policy.token_allowlist.contains(&mint) {
        return CheckOutcome::Denied(DenyReason::TokenNotAllowed);
    }

    // HARD CAPS run FIRST and always Deny, so an over-limit payment can never be
    // laundered through the approval queue to bypass per_tx / daily / cooldown.
    if amount > policy.per_tx_limit {
        return CheckOutcome::Denied(DenyReason::ExceedsPerTxLimit);
    }

    let current_spent = policy.current_daily_spent(now);
    let new_total = current_spent.saturating_add(amount);
    if new_total > policy.daily_limit {
        return CheckOutcome::Denied(DenyReason::ExceedsDailyLimit);
    }

    let cooldown = policy.cooldown_seconds as i64;
    if cooldown > 0 && now.saturating_sub(policy.last_tx_timestamp) < cooldown {
        return CheckOutcome::Denied(DenyReason::CooldownActive);
    }

    // v1.5 critique #1: recipient_allowlist is a "pre-authorized auto-spend
    // set", NOT an allow-all-when-empty filter. Any recipient not explicitly
    // listed (including the empty-list default) is escalated to owner approval
    // — never silently allowed. This moves the H-2 destination guarantee
    // ON-CHAIN: the agent keypair alone cannot move funds to an arbitrary /
    // prompt-injected address; the owner must sign off via the approval queue.
    if !policy.recipient_allowlist.contains(&to) {
        return CheckOutcome::RequiresApproval;
    }

    // Pre-authorized recipient: large amounts still escalate to approval.
    if amount > policy.approval_threshold {
        return CheckOutcome::RequiresApproval;
    }

    CheckOutcome::Allowed
}
