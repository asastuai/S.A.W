use anchor_lang::prelude::*;

#[error_code]
pub enum WalletError {
    #[msg("Caller is not the wallet owner (handler)")]
    NotOwner,
    #[msg("Caller is not the active agent")]
    NotActiveAgent,
    #[msg("Agent is currently revoked")]
    AgentRevoked,
    #[msg("Token is not in policy allowlist")]
    TokenNotAllowed,
    #[msg("Recipient is not in policy allowlist")]
    RecipientNotAllowed,
    #[msg("Transaction exceeds per-transaction limit")]
    ExceedsPerTxLimit,
    #[msg("Transaction exceeds daily spending limit")]
    ExceedsDailyLimit,
    #[msg("Cooldown period has not elapsed")]
    CooldownActive,
    #[msg("Approval request mismatch")]
    RequestMismatch,
    #[msg("Approval request is not in approved status")]
    NotApproved,
    #[msg("Insufficient wallet balance")]
    InsufficientBalance,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Payment mint does not match the policy's denomination mint")]
    MintMismatch,
    #[msg("Recipient is not pre-authorized; route through request_payment for owner approval")]
    RequiresOwnerApproval,
}
