use anchor_lang::prelude::*;

pub const MAX_PENDING_PER_WALLET: u32 = 10;
pub const DEFAULT_EXPIRY_SECONDS: i64 = 86_400;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum RequestStatus {
    Pending,
    Approved,
    Denied,
}

#[account]
pub struct QueueState {
    pub wallet: Pubkey,
    pub owner: Pubkey,
    pub next_request_id: u64,
    pub pending_count: u32,
    pub bump: u8,
}

impl QueueState {
    pub const SIZE: usize = 32 + 32 + 8 + 4 + 1;
}

#[account]
pub struct RequestAccount {
    pub wallet: Pubkey,
    pub id: u64,
    pub to: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub memo: [u8; 32],
    pub created_at: i64,
    pub expires_at: i64,
    pub status: RequestStatus,
    pub bump: u8,
}

impl RequestAccount {
    pub const SIZE: usize = 32  // wallet
        + 8                      // id
        + 32                     // to
        + 32                     // mint
        + 8                      // amount
        + 32                     // memo
        + 8                      // created_at
        + 8                      // expires_at
        + 1                      // status (enum, 1 byte for unit variants)
        + 1; // bump
}
