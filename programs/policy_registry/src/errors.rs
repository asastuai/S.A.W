use anchor_lang::prelude::*;

#[error_code]
pub enum PolicyError {
    #[msg("Token is not in the allowlist")]
    TokenNotAllowed,
    #[msg("Recipient is not in the allowlist")]
    RecipientNotAllowed,
    #[msg("Transaction exceeds per-transaction limit")]
    ExceedsPerTxLimit,
    #[msg("Transaction exceeds daily spending limit")]
    ExceedsDailyLimit,
    #[msg("Cooldown period has not elapsed")]
    CooldownActive,
    #[msg("Caller is not the registered owner")]
    NotOwner,
    #[msg("Caller is not the registered wallet")]
    NotWallet,
    #[msg("Allowlist exceeds maximum size")]
    AllowlistTooLarge,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("cooldown_seconds exceeds maximum allowed (7 days)")]
    CooldownTooLong,
    #[msg("daily_limit must be > 0 unless the allowlist is empty (intentional pause)")]
    InvalidDailyLimit,
}
