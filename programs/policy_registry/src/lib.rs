use anchor_lang::prelude::*;

pub mod check;
pub mod errors;
pub mod state;

pub use check::evaluate_policy;
pub use errors::PolicyError;
pub use state::{CheckOutcome, DenyReason, PolicyAccount, PolicyParams, MAX_ALLOWLIST};

declare_id!("FGTkQ9C8zr7Rm9WFZ7rK6cDdY7Bju1dTsjSN5GuHqAJF");

#[program]
pub mod policy_registry {
    use super::*;

    pub fn register_policy(
        ctx: Context<RegisterPolicy>,
        owner: Pubkey,
        params: PolicyParams,
    ) -> Result<()> {
        validate_params(&params)?;

        let now = Clock::get()?.unix_timestamp;
        let policy = &mut ctx.accounts.policy;
        policy.wallet = ctx.accounts.wallet.key();
        policy.owner = owner;
        policy.daily_limit = params.daily_limit;
        policy.per_tx_limit = params.per_tx_limit;
        policy.approval_threshold = params.approval_threshold;
        policy.cooldown_seconds = params.cooldown_seconds;
        policy.recipient_allowlist = params.recipient_allowlist;
        policy.token_allowlist = params.token_allowlist;
        policy.daily_spent = 0;
        policy.last_tx_timestamp = 0;
        policy.last_reset_timestamp = now;
        policy.bump = ctx.bumps.policy;

        emit!(PolicySet {
            wallet: policy.wallet,
            owner: policy.owner,
        });
        Ok(())
    }

    pub fn set_policy(ctx: Context<SetPolicy>, params: PolicyParams) -> Result<()> {
        validate_params(&params)?;

        let policy = &mut ctx.accounts.policy;
        require_keys_eq!(ctx.accounts.owner.key(), policy.owner, PolicyError::NotOwner);

        policy.daily_limit = params.daily_limit;
        policy.per_tx_limit = params.per_tx_limit;
        policy.approval_threshold = params.approval_threshold;
        policy.cooldown_seconds = params.cooldown_seconds;
        policy.recipient_allowlist = params.recipient_allowlist;
        policy.token_allowlist = params.token_allowlist;

        emit!(PolicySet {
            wallet: policy.wallet,
            owner: policy.owner,
        });
        Ok(())
    }

    pub fn record_spend(ctx: Context<RecordSpend>, amount: u64) -> Result<()> {
        let policy = &mut ctx.accounts.policy;
        require_keys_eq!(
            ctx.accounts.wallet.key(),
            policy.wallet,
            PolicyError::NotWallet
        );

        let now = Clock::get()?.unix_timestamp;
        policy.maybe_reset_daily(now);
        policy.daily_spent = policy
            .daily_spent
            .checked_add(amount)
            .ok_or(PolicyError::Overflow)?;
        policy.last_tx_timestamp = now;
        Ok(())
    }

    /// L-4 fix: when the wallet is emergency-withdrawn, the agent's
    /// daily_spent counter still reflects pre-emergency activity. If the
    /// owner refunds the wallet within the same day, the agent finds
    /// itself artificially throttled until midnight. This zeros the
    /// counter. Only callable by the wallet PDA (CPI from agent_wallet's
    /// emergency_withdraw).
    pub fn reset_daily_spent(ctx: Context<RecordSpend>) -> Result<()> {
        let policy = &mut ctx.accounts.policy;
        require_keys_eq!(
            ctx.accounts.wallet.key(),
            policy.wallet,
            PolicyError::NotWallet
        );
        policy.daily_spent = 0;
        policy.last_reset_timestamp = Clock::get()?.unix_timestamp;
        Ok(())
    }
}

/// M-2 fix: bound the params an owner can set so they can't soft-brick
/// the wallet (cooldown=u64::MAX would freeze the agent indefinitely)
/// while still allowing intentional pauses (empty allowlists).
fn validate_params(params: &PolicyParams) -> Result<()> {
    require!(
        params.recipient_allowlist.len() <= MAX_ALLOWLIST,
        PolicyError::AllowlistTooLarge
    );
    require!(
        params.token_allowlist.len() <= MAX_ALLOWLIST,
        PolicyError::AllowlistTooLarge
    );
    // Max cooldown of 7 days — beyond that is almost certainly a mistake.
    const MAX_COOLDOWN_SECS: u64 = 7 * 24 * 60 * 60;
    require!(
        params.cooldown_seconds <= MAX_COOLDOWN_SECS,
        PolicyError::CooldownTooLong
    );
    // daily_limit=0 only makes sense as "explicit pause" — require the
    // recipient allowlist to also be empty so it reads as intentional.
    if params.daily_limit == 0 && !params.recipient_allowlist.is_empty() {
        return err!(PolicyError::InvalidDailyLimit);
    }
    Ok(())
}

#[derive(Accounts)]
pub struct RegisterPolicy<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + PolicyAccount::SIZE,
        seeds = [b"policy", wallet.key().as_ref()],
        bump
    )]
    pub policy: Account<'info, PolicyAccount>,
    pub wallet: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPolicy<'info> {
    #[account(
        mut,
        seeds = [b"policy", policy.wallet.as_ref()],
        bump = policy.bump
    )]
    pub policy: Account<'info, PolicyAccount>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct RecordSpend<'info> {
    #[account(
        mut,
        seeds = [b"policy", policy.wallet.as_ref()],
        bump = policy.bump
    )]
    pub policy: Account<'info, PolicyAccount>,
    pub wallet: Signer<'info>,
}

#[event]
pub struct PolicySet {
    pub wallet: Pubkey,
    pub owner: Pubkey,
}
