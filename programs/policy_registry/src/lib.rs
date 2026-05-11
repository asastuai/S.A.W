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
        require!(
            params.recipient_allowlist.len() <= MAX_ALLOWLIST,
            PolicyError::AllowlistTooLarge
        );
        require!(
            params.token_allowlist.len() <= MAX_ALLOWLIST,
            PolicyError::AllowlistTooLarge
        );

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
        require!(
            params.recipient_allowlist.len() <= MAX_ALLOWLIST,
            PolicyError::AllowlistTooLarge
        );
        require!(
            params.token_allowlist.len() <= MAX_ALLOWLIST,
            PolicyError::AllowlistTooLarge
        );

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
