use anchor_lang::prelude::*;

pub const MAX_ALLOWLIST: usize = 10;
pub const SECONDS_PER_DAY: i64 = 86_400;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct PolicyParams {
    pub daily_limit: u64,
    pub per_tx_limit: u64,
    pub approval_threshold: u64,
    pub cooldown_seconds: u64,
    pub recipient_allowlist: Vec<Pubkey>,
    pub token_allowlist: Vec<Pubkey>,
}

#[account]
pub struct PolicyAccount {
    pub wallet: Pubkey,
    pub owner: Pubkey,
    pub daily_limit: u64,
    pub per_tx_limit: u64,
    pub approval_threshold: u64,
    pub cooldown_seconds: u64,
    pub recipient_allowlist: Vec<Pubkey>,
    pub token_allowlist: Vec<Pubkey>,
    pub daily_spent: u64,
    pub last_tx_timestamp: i64,
    pub last_reset_timestamp: i64,
    pub bump: u8,
}

impl PolicyAccount {
    pub const SIZE: usize = 32  // wallet
        + 32                     // owner
        + 8                      // daily_limit
        + 8                      // per_tx_limit
        + 8                      // approval_threshold
        + 8                      // cooldown_seconds
        + 4 + 32 * MAX_ALLOWLIST // recipient_allowlist
        + 4 + 32 * MAX_ALLOWLIST // token_allowlist
        + 8                      // daily_spent
        + 8                      // last_tx_timestamp
        + 8                      // last_reset_timestamp
        + 1; // bump

    pub fn current_daily_spent(&self, now: i64) -> u64 {
        if now.saturating_sub(self.last_reset_timestamp) >= SECONDS_PER_DAY {
            0
        } else {
            self.daily_spent
        }
    }

    pub fn maybe_reset_daily(&mut self, now: i64) {
        if now.saturating_sub(self.last_reset_timestamp) >= SECONDS_PER_DAY {
            self.daily_spent = 0;
            self.last_reset_timestamp = now;
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum CheckOutcome {
    Allowed,
    RequiresApproval,
    Denied(DenyReason),
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum DenyReason {
    TokenNotAllowed,
    RecipientNotAllowed,
    ExceedsPerTxLimit,
    ExceedsDailyLimit,
    CooldownActive,
}
