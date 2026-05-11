use anchor_lang::prelude::*;

use crate::state::{CheckOutcome, DenyReason, PolicyAccount};

pub fn evaluate_policy(
    policy: &PolicyAccount,
    to: Pubkey,
    mint: Pubkey,
    usd_value: u64,
    now: i64,
) -> CheckOutcome {
    if !policy.token_allowlist.is_empty() && !policy.token_allowlist.contains(&mint) {
        return CheckOutcome::Denied(DenyReason::TokenNotAllowed);
    }

    if !policy.recipient_allowlist.is_empty() && !policy.recipient_allowlist.contains(&to) {
        return CheckOutcome::Denied(DenyReason::RecipientNotAllowed);
    }

    if usd_value > policy.per_tx_limit {
        return CheckOutcome::Denied(DenyReason::ExceedsPerTxLimit);
    }

    let current_spent = policy.current_daily_spent(now);
    let new_total = current_spent.saturating_add(usd_value);
    if new_total > policy.daily_limit {
        return CheckOutcome::Denied(DenyReason::ExceedsDailyLimit);
    }

    let cooldown = policy.cooldown_seconds as i64;
    if cooldown > 0 && now.saturating_sub(policy.last_tx_timestamp) < cooldown {
        return CheckOutcome::Denied(DenyReason::CooldownActive);
    }

    if usd_value > policy.approval_threshold {
        return CheckOutcome::RequiresApproval;
    }

    CheckOutcome::Allowed
}
