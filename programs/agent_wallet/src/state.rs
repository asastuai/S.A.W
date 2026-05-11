use anchor_lang::prelude::*;

#[account]
pub struct WalletAccount {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub agent_active: bool,
    pub salt: [u8; 32],
    pub bump: u8,
}

impl WalletAccount {
    pub const SIZE: usize = 32 + 32 + 1 + 32 + 1;
}
