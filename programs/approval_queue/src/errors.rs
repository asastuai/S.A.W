use anchor_lang::prelude::*;

#[error_code]
pub enum ApprovalError {
    #[msg("Maximum pending requests reached for this wallet")]
    MaxPendingReached,
    #[msg("Request is not in Pending status")]
    NotPending,
    #[msg("Request has expired")]
    Expired,
    #[msg("Caller is not the registered wallet")]
    NotWallet,
    #[msg("Caller is not the registered owner")]
    NotOwner,
    #[msg("Request does not belong to this wallet")]
    WrongWallet,
    #[msg("Request has not expired yet — cannot prune")]
    NotExpired,
}
