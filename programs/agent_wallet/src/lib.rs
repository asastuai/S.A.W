use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

pub mod cpi;
pub mod errors;
pub mod state;

pub use errors::WalletError;
pub use state::WalletAccount;

use approval_queue::{QueueState, RequestAccount, RequestStatus, ID as APPROVAL_QUEUE_ID};
use policy_registry::{
    evaluate_policy, CheckOutcome, DenyReason, PolicyAccount, PolicyParams,
    ID as POLICY_REGISTRY_ID,
};

declare_id!("6wsPfHTs13KA3seca53S8sc4oW7ropypGU7PzA4345TB");

#[program]
pub mod agent_wallet {
    use super::*;

    pub fn initialize_wallet(
        ctx: Context<InitializeWallet>,
        salt: [u8; 32],
        agent: Pubkey,
        params: PolicyParams,
    ) -> Result<()> {
        let wallet = &mut ctx.accounts.wallet;
        wallet.owner = ctx.accounts.owner.key();
        wallet.agent = agent;
        wallet.agent_active = true;
        wallet.salt = salt;
        wallet.bump = ctx.bumps.wallet;

        let owner_key = ctx.accounts.owner.key();
        let signer_seeds: &[&[u8]] = &[
            b"wallet",
            owner_key.as_ref(),
            &salt,
            &[wallet.bump],
        ];

        cpi::register_policy(
            ctx.accounts.policy_program.to_account_info(),
            ctx.accounts.policy.to_account_info(),
            wallet.to_account_info(),
            ctx.accounts.owner.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            owner_key,
            params,
            signer_seeds,
        )?;

        cpi::register_queue(
            ctx.accounts.queue_program.to_account_info(),
            ctx.accounts.queue.to_account_info(),
            wallet.to_account_info(),
            ctx.accounts.owner.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            owner_key,
            signer_seeds,
        )?;

        emit!(WalletInitialized {
            wallet: wallet.key(),
            owner: owner_key,
            agent,
        });
        Ok(())
    }

    pub fn pay_direct(
        ctx: Context<PayDirect>,
        to: Pubkey,
        amount: u64,
        _memo: [u8; 32],
    ) -> Result<()> {
        require!(amount > 0, WalletError::ZeroAmount);
        let wallet = &ctx.accounts.wallet;
        require!(wallet.agent_active, WalletError::AgentRevoked);
        require_keys_eq!(
            ctx.accounts.agent.key(),
            wallet.agent,
            WalletError::NotActiveAgent
        );
        require_keys_eq!(
            ctx.accounts.recipient_token_account.owner,
            to,
            WalletError::RecipientNotAllowed
        );
        // M-1: enforce the policy's denomination mint so the agent can't
        // bypass the token-unit spend limits by paying in a different token.
        require_keys_eq!(
            ctx.accounts.mint.key(),
            ctx.accounts.policy.mint,
            WalletError::MintMismatch
        );

        let now = Clock::get()?.unix_timestamp;
        let outcome = evaluate_policy(
            &ctx.accounts.policy,
            to,
            ctx.accounts.source_token_account.mint,
            amount,
            now,
        );

        match outcome {
            CheckOutcome::Allowed => {}
            // An unlisted recipient or over-threshold amount must go through the
            // approval queue (request_payment + owner approve_and_execute), not
            // an autonomous pay_direct. Surface an honest error.
            CheckOutcome::RequiresApproval => return err!(WalletError::RequiresOwnerApproval),
            CheckOutcome::Denied(reason) => return Err(map_deny(reason).into()),
        }

        let owner_key = wallet.owner;
        let salt = wallet.salt;
        let bump = wallet.bump;
        let signer_seeds: &[&[u8]] = &[
            b"wallet",
            owner_key.as_ref(),
            &salt,
            &[bump],
        ];

        let mint_key = ctx.accounts.mint.key();
        let decimals = ctx.accounts.mint.decimals;

        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.source_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.recipient_token_account.to_account_info(),
                    authority: wallet.to_account_info(),
                },
                &[signer_seeds],
            ),
            amount,
            decimals,
        )?;

        cpi::record_spend(
            ctx.accounts.policy_program.to_account_info(),
            ctx.accounts.policy.to_account_info(),
            wallet.to_account_info(),
            amount,
            signer_seeds,
        )?;

        emit!(PaymentExecuted {
            wallet: wallet.key(),
            to,
            mint: mint_key,
            amount,
        });
        Ok(())
    }

    pub fn request_payment(
        ctx: Context<RequestPayment>,
        to: Pubkey,
        mint: Pubkey,
        amount: u64,
        memo: [u8; 32],
    ) -> Result<()> {
        require!(amount > 0, WalletError::ZeroAmount);
        let wallet = &ctx.accounts.wallet;
        require!(wallet.agent_active, WalletError::AgentRevoked);
        require_keys_eq!(
            ctx.accounts.agent.key(),
            wallet.agent,
            WalletError::NotActiveAgent
        );
        // M-1: the queued request must use the policy's denomination mint.
        require_keys_eq!(mint, ctx.accounts.policy.mint, WalletError::MintMismatch);

        let now = Clock::get()?.unix_timestamp;
        let outcome = evaluate_policy(&ctx.accounts.policy, to, mint, amount, now);

        match outcome {
            CheckOutcome::RequiresApproval => {}
            CheckOutcome::Allowed => return err!(WalletError::ExceedsPerTxLimit),
            CheckOutcome::Denied(reason) => return Err(map_deny(reason).into()),
        }

        let owner_key = wallet.owner;
        let salt = wallet.salt;
        let bump = wallet.bump;
        let signer_seeds: &[&[u8]] = &[
            b"wallet",
            owner_key.as_ref(),
            &salt,
            &[bump],
        ];

        cpi::create_request(
            ctx.accounts.queue_program.to_account_info(),
            ctx.accounts.queue.to_account_info(),
            ctx.accounts.request.to_account_info(),
            wallet.to_account_info(),
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            to,
            mint,
            amount,
            memo,
            signer_seeds,
        )?;

        Ok(())
    }

    pub fn approve_and_execute(ctx: Context<ApproveAndExecute>) -> Result<()> {
        let wallet = &ctx.accounts.wallet;
        require_keys_eq!(
            ctx.accounts.owner.key(),
            wallet.owner,
            WalletError::NotOwner
        );

        let request = &ctx.accounts.request;
        require_keys_eq!(request.wallet, wallet.key(), WalletError::RequestMismatch);
        require!(
            request.status == RequestStatus::Pending,
            WalletError::NotApproved
        );
        require_keys_eq!(
            ctx.accounts.recipient_token_account.owner,
            request.to,
            WalletError::RecipientNotAllowed
        );
        require_keys_eq!(
            ctx.accounts.source_token_account.mint,
            request.mint,
            WalletError::TokenNotAllowed
        );
        // M-1: the request's mint must be the policy's denomination mint.
        require_keys_eq!(
            request.mint,
            ctx.accounts.policy.mint,
            WalletError::MintMismatch
        );

        let now = Clock::get()?.unix_timestamp;
        let outcome = evaluate_policy(
            &ctx.accounts.policy,
            request.to,
            request.mint,
            request.amount,
            now,
        );
        match outcome {
            CheckOutcome::Allowed | CheckOutcome::RequiresApproval => {}
            // L-2: cooldown is an agent rate-limit. When the owner explicitly
            // approves a queued request, their action must not be throttled by
            // recent agent activity. All hard caps (per-tx, daily, allowlists)
            // still apply — only the cooldown gate is waived on this path.
            CheckOutcome::Denied(DenyReason::CooldownActive) => {}
            CheckOutcome::Denied(reason) => return Err(map_deny(reason).into()),
        }

        let owner_key = wallet.owner;
        let salt = wallet.salt;
        let bump = wallet.bump;
        let amount = request.amount;
        let to = request.to;
        let mint = request.mint;
        let signer_seeds: &[&[u8]] = &[
            b"wallet",
            owner_key.as_ref(),
            &salt,
            &[bump],
        ];

        cpi::mark_approved(
            ctx.accounts.queue_program.to_account_info(),
            ctx.accounts.queue.to_account_info(),
            ctx.accounts.request.to_account_info(),
            wallet.to_account_info(),
            signer_seeds,
        )?;

        let decimals = ctx.accounts.mint.decimals;
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.source_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.recipient_token_account.to_account_info(),
                    authority: wallet.to_account_info(),
                },
                &[signer_seeds],
            ),
            amount,
            decimals,
        )?;

        cpi::record_spend(
            ctx.accounts.policy_program.to_account_info(),
            ctx.accounts.policy.to_account_info(),
            wallet.to_account_info(),
            amount,
            signer_seeds,
        )?;

        emit!(PaymentExecuted {
            wallet: wallet.key(),
            to,
            mint,
            amount,
        });
        Ok(())
    }

    pub fn deny_request(ctx: Context<DenyRequest>) -> Result<()> {
        let wallet = &ctx.accounts.wallet;
        require_keys_eq!(
            ctx.accounts.owner.key(),
            wallet.owner,
            WalletError::NotOwner
        );

        let owner_key = wallet.owner;
        let salt = wallet.salt;
        let bump = wallet.bump;
        let signer_seeds: &[&[u8]] = &[
            b"wallet",
            owner_key.as_ref(),
            &salt,
            &[bump],
        ];

        cpi::mark_denied(
            ctx.accounts.queue_program.to_account_info(),
            ctx.accounts.queue.to_account_info(),
            ctx.accounts.request.to_account_info(),
            wallet.to_account_info(),
            signer_seeds,
        )?;

        Ok(())
    }

    pub fn set_agent(ctx: Context<OwnerOnly>, new_agent: Pubkey) -> Result<()> {
        let wallet = &mut ctx.accounts.wallet;
        require_keys_eq!(
            ctx.accounts.owner.key(),
            wallet.owner,
            WalletError::NotOwner
        );
        wallet.agent = new_agent;
        wallet.agent_active = true;
        emit!(AgentSet {
            wallet: wallet.key(),
            agent: new_agent,
        });
        Ok(())
    }

    pub fn revoke_agent(ctx: Context<OwnerOnly>) -> Result<()> {
        let wallet = &mut ctx.accounts.wallet;
        require_keys_eq!(
            ctx.accounts.owner.key(),
            wallet.owner,
            WalletError::NotOwner
        );
        let prev = wallet.agent;
        wallet.agent_active = false;
        emit!(AgentRevoked {
            wallet: wallet.key(),
            agent: prev,
        });
        Ok(())
    }

    pub fn emergency_withdraw(ctx: Context<EmergencyWithdraw>) -> Result<()> {
        let wallet = &ctx.accounts.wallet;
        require_keys_eq!(
            ctx.accounts.owner.key(),
            wallet.owner,
            WalletError::NotOwner
        );

        let amount = ctx.accounts.source_token_account.amount;
        require!(amount > 0, WalletError::InsufficientBalance);

        let owner_key = wallet.owner;
        let salt = wallet.salt;
        let bump = wallet.bump;
        let signer_seeds: &[&[u8]] = &[
            b"wallet",
            owner_key.as_ref(),
            &salt,
            &[bump],
        ];

        let mint_key = ctx.accounts.mint.key();
        let decimals = ctx.accounts.mint.decimals;
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.source_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.owner_token_account.to_account_info(),
                    authority: wallet.to_account_info(),
                },
                &[signer_seeds],
            ),
            amount,
            decimals,
        )?;

        // L-4: zero the daily_spent counter so a same-day refund doesn't leave
        // the (typically rotated) agent throttled by pre-emergency activity.
        cpi::reset_daily_spent(
            ctx.accounts.policy_program.to_account_info(),
            ctx.accounts.policy.to_account_info(),
            wallet.to_account_info(),
            signer_seeds,
        )?;

        emit!(EmergencyWithdrawal {
            wallet: wallet.key(),
            mint: mint_key,
            amount,
        });
        Ok(())
    }
}

fn map_deny(reason: DenyReason) -> WalletError {
    match reason {
        DenyReason::TokenNotAllowed => WalletError::TokenNotAllowed,
        DenyReason::RecipientNotAllowed => WalletError::RecipientNotAllowed,
        DenyReason::ExceedsPerTxLimit => WalletError::ExceedsPerTxLimit,
        DenyReason::ExceedsDailyLimit => WalletError::ExceedsDailyLimit,
        DenyReason::CooldownActive => WalletError::CooldownActive,
    }
}

#[derive(Accounts)]
#[instruction(salt: [u8; 32], agent: Pubkey, params: PolicyParams)]
pub struct InitializeWallet<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + WalletAccount::SIZE,
        seeds = [b"wallet", owner.key().as_ref(), &salt],
        bump
    )]
    pub wallet: Account<'info, WalletAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: PDA derived seeds [b"policy", wallet.key()] in policy_registry; init via CPI
    #[account(mut)]
    pub policy: UncheckedAccount<'info>,

    /// CHECK: PDA derived seeds [b"queue", wallet.key()] in approval_queue; init via CPI
    #[account(mut)]
    pub queue: UncheckedAccount<'info>,

    /// CHECK: policy_registry program
    #[account(address = POLICY_REGISTRY_ID)]
    pub policy_program: UncheckedAccount<'info>,

    /// CHECK: approval_queue program
    #[account(address = APPROVAL_QUEUE_ID)]
    pub queue_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PayDirect<'info> {
    #[account(
        seeds = [b"wallet", wallet.owner.as_ref(), &wallet.salt],
        bump = wallet.bump
    )]
    pub wallet: Account<'info, WalletAccount>,

    pub agent: Signer<'info>,

    #[account(
        mut,
        seeds = [b"policy", wallet.key().as_ref()],
        bump = policy.bump,
        seeds::program = POLICY_REGISTRY_ID
    )]
    pub policy: Account<'info, PolicyAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::authority = wallet,
        token::mint = mint,
        token::token_program = token_program
    )]
    pub source_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: policy_registry program
    #[account(address = POLICY_REGISTRY_ID)]
    pub policy_program: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(to: Pubkey, mint: Pubkey, amount: u64, memo: [u8; 32])]
pub struct RequestPayment<'info> {
    #[account(
        seeds = [b"wallet", wallet.owner.as_ref(), &wallet.salt],
        bump = wallet.bump
    )]
    pub wallet: Account<'info, WalletAccount>,

    pub agent: Signer<'info>,

    #[account(
        seeds = [b"policy", wallet.key().as_ref()],
        bump = policy.bump,
        seeds::program = POLICY_REGISTRY_ID
    )]
    pub policy: Account<'info, PolicyAccount>,

    #[account(
        mut,
        seeds = [b"queue", wallet.key().as_ref()],
        bump = queue.bump,
        seeds::program = APPROVAL_QUEUE_ID
    )]
    pub queue: Account<'info, QueueState>,

    /// CHECK: PDA seeds [b"request", wallet.key(), queue.next_request_id.to_le_bytes()] in approval_queue; init via CPI
    #[account(mut)]
    pub request: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: approval_queue program
    #[account(address = APPROVAL_QUEUE_ID)]
    pub queue_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveAndExecute<'info> {
    #[account(
        seeds = [b"wallet", wallet.owner.as_ref(), &wallet.salt],
        bump = wallet.bump
    )]
    pub wallet: Box<Account<'info, WalletAccount>>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"policy", wallet.key().as_ref()],
        bump = policy.bump,
        seeds::program = POLICY_REGISTRY_ID
    )]
    pub policy: Box<Account<'info, PolicyAccount>>,

    #[account(
        mut,
        seeds = [b"queue", wallet.key().as_ref()],
        bump = queue.bump,
        seeds::program = APPROVAL_QUEUE_ID
    )]
    pub queue: Box<Account<'info, QueueState>>,

    #[account(
        mut,
        seeds = [b"request", request.wallet.as_ref(), &request.id.to_le_bytes()],
        bump = request.bump,
        seeds::program = APPROVAL_QUEUE_ID
    )]
    pub request: Box<Account<'info, RequestAccount>>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::authority = wallet,
        token::mint = mint,
        token::token_program = token_program
    )]
    pub source_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub recipient_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: policy_registry program
    #[account(address = POLICY_REGISTRY_ID)]
    pub policy_program: UncheckedAccount<'info>,

    /// CHECK: approval_queue program
    #[account(address = APPROVAL_QUEUE_ID)]
    pub queue_program: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct DenyRequest<'info> {
    #[account(
        seeds = [b"wallet", wallet.owner.as_ref(), &wallet.salt],
        bump = wallet.bump
    )]
    pub wallet: Account<'info, WalletAccount>,

    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"queue", wallet.key().as_ref()],
        bump = queue.bump,
        seeds::program = APPROVAL_QUEUE_ID
    )]
    pub queue: Account<'info, QueueState>,

    #[account(
        mut,
        seeds = [b"request", request.wallet.as_ref(), &request.id.to_le_bytes()],
        bump = request.bump,
        seeds::program = APPROVAL_QUEUE_ID
    )]
    pub request: Account<'info, RequestAccount>,

    /// CHECK: approval_queue program
    #[account(address = APPROVAL_QUEUE_ID)]
    pub queue_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct OwnerOnly<'info> {
    #[account(
        mut,
        seeds = [b"wallet", wallet.owner.as_ref(), &wallet.salt],
        bump = wallet.bump
    )]
    pub wallet: Account<'info, WalletAccount>,

    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct EmergencyWithdraw<'info> {
    #[account(
        seeds = [b"wallet", wallet.owner.as_ref(), &wallet.salt],
        bump = wallet.bump
    )]
    pub wallet: Account<'info, WalletAccount>,

    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"policy", wallet.key().as_ref()],
        bump = policy.bump,
        seeds::program = POLICY_REGISTRY_ID
    )]
    pub policy: Account<'info, PolicyAccount>,

    /// CHECK: policy_registry program
    #[account(address = POLICY_REGISTRY_ID)]
    pub policy_program: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::authority = wallet,
        token::mint = mint,
        token::token_program = token_program
    )]
    pub source_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[event]
pub struct WalletInitialized {
    pub wallet: Pubkey,
    pub owner: Pubkey,
    pub agent: Pubkey,
}

#[event]
pub struct PaymentExecuted {
    pub wallet: Pubkey,
    pub to: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct AgentSet {
    pub wallet: Pubkey,
    pub agent: Pubkey,
}

#[event]
pub struct AgentRevoked {
    pub wallet: Pubkey,
    pub agent: Pubkey,
}

#[event]
pub struct EmergencyWithdrawal {
    pub wallet: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}
