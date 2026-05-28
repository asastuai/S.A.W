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

    // L-1: anchor the daily window to fixed UTC-day boundaries
    // (floor(ts / 86400)) instead of a rolling delta from the last reset.
    // The previous rolling model let the agent reposition the window by
    // timing its first spend, enabling a ~2x burst across an arbitrary
    // moment. UTC-day anchoring makes the reset deterministic (midnight
    // UTC) and removes the agent's ability to choose the boundary. Note:
    // a fixed window still permits a single 2x burst straddling midnight;
    // eliminating that entirely would require true sliding-window
    // accounting, which is out of scope for this limit's risk level.
    fn utc_day(ts: i64) -> i64 {
        ts.div_euclid(SECONDS_PER_DAY)
    }

    pub fn current_daily_spent(&self, now: i64) -> u64 {
        if Self::utc_day(now) > Self::utc_day(self.last_reset_timestamp) {
            0
        } else {
            self.daily_spent
        }
    }

    pub fn maybe_reset_daily(&mut self, now: i64) {
        if Self::utc_day(now) > Self::utc_day(self.last_reset_timestamp) {
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
