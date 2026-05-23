use anchor_lang::prelude::*;

pub mod errors;
pub mod state;

pub use errors::ApprovalError;
pub use state::{
    QueueState, RequestAccount, RequestStatus, DEFAULT_EXPIRY_SECONDS, MAX_PENDING_PER_WALLET,
};

declare_id!("8HJpiQCaCHcvbDVX7K6shcHmNkUZJUfSEqm9mhVcXXnr");

#[program]
pub mod approval_queue {
    use super::*;

    pub fn register_queue(ctx: Context<RegisterQueue>, owner: Pubkey) -> Result<()> {
        let queue = &mut ctx.accounts.queue;
        queue.wallet = ctx.accounts.wallet.key();
        queue.owner = owner;
        queue.next_request_id = 1;
        queue.pending_count = 0;
        queue.bump = ctx.bumps.queue;
        Ok(())
    }

    pub fn create_request(
        ctx: Context<CreateRequest>,
        to: Pubkey,
        mint: Pubkey,
        amount: u64,
        memo: [u8; 32],
    ) -> Result<u64> {
        let queue = &mut ctx.accounts.queue;
        require_keys_eq!(
            ctx.accounts.wallet.key(),
            queue.wallet,
            ApprovalError::NotWallet
        );
        require!(
            queue.pending_count < MAX_PENDING_PER_WALLET,
            ApprovalError::MaxPendingReached
        );

        let id = queue.next_request_id;
        let now = Clock::get()?.unix_timestamp;

        let request = &mut ctx.accounts.request;
        request.wallet = queue.wallet;
        request.id = id;
        request.to = to;
        request.mint = mint;
        request.amount = amount;
        request.memo = memo;
        request.created_at = now;
        request.expires_at = now + DEFAULT_EXPIRY_SECONDS;
        request.status = RequestStatus::Pending;
        request.bump = ctx.bumps.request;

        queue.next_request_id += 1;
        queue.pending_count += 1;

        emit!(RequestCreated {
            wallet: queue.wallet,
            id,
            to,
            amount,
        });
        Ok(id)
    }

    pub fn mark_approved(ctx: Context<TransitionRequest>) -> Result<()> {
        let request = &mut ctx.accounts.request;
        let queue = &mut ctx.accounts.queue;

        require_keys_eq!(
            ctx.accounts.wallet.key(),
            queue.wallet,
            ApprovalError::NotWallet
        );
        require_keys_eq!(request.wallet, queue.wallet, ApprovalError::WrongWallet);
        require!(
            request.status == RequestStatus::Pending,
            ApprovalError::NotPending
        );

        let now = Clock::get()?.unix_timestamp;
        require!(now <= request.expires_at, ApprovalError::Expired);

        request.status = RequestStatus::Approved;
        queue.pending_count = queue.pending_count.saturating_sub(1);

        emit!(RequestApproved {
            wallet: queue.wallet,
            id: request.id,
        });
        Ok(())
    }

    pub fn mark_denied(ctx: Context<TransitionRequest>) -> Result<()> {
        let request = &mut ctx.accounts.request;
        let queue = &mut ctx.accounts.queue;

        require_keys_eq!(
            ctx.accounts.wallet.key(),
            queue.wallet,
            ApprovalError::NotWallet
        );
        require_keys_eq!(request.wallet, queue.wallet, ApprovalError::WrongWallet);
        require!(
            request.status == RequestStatus::Pending,
            ApprovalError::NotPending
        );

        request.status = RequestStatus::Denied;
        queue.pending_count = queue.pending_count.saturating_sub(1);

        emit!(RequestDenied {
            wallet: queue.wallet,
            id: request.id,
        });
        Ok(())
    }

    /// Mark an expired pending request as Denied and free its queue slot.
    /// Permissionless cleanup — anyone can call. Fixes audit M-1.
    pub fn prune_expired_request(ctx: Context<PruneExpired>) -> Result<()> {
        let request = &mut ctx.accounts.request;
        let queue = &mut ctx.accounts.queue;

        require_keys_eq!(request.wallet, queue.wallet, ApprovalError::WrongWallet);
        require!(
            request.status == RequestStatus::Pending,
            ApprovalError::NotPending
        );
        let now = Clock::get()?.unix_timestamp;
        require!(now > request.expires_at, ApprovalError::NotExpired);

        request.status = RequestStatus::Denied;
        queue.pending_count = queue.pending_count.saturating_sub(1);

        emit!(RequestDenied {
            wallet: queue.wallet,
            id: request.id,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct RegisterQueue<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + QueueState::SIZE,
        seeds = [b"queue", wallet.key().as_ref()],
        bump
    )]
    pub queue: Account<'info, QueueState>,
    pub wallet: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateRequest<'info> {
    #[account(
        mut,
        seeds = [b"queue", queue.wallet.as_ref()],
        bump = queue.bump
    )]
    pub queue: Account<'info, QueueState>,
    #[account(
        init,
        payer = payer,
        space = 8 + RequestAccount::SIZE,
        seeds = [b"request", queue.wallet.as_ref(), &queue.next_request_id.to_le_bytes()],
        bump
    )]
    pub request: Account<'info, RequestAccount>,
    pub wallet: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransitionRequest<'info> {
    #[account(
        mut,
        seeds = [b"queue", queue.wallet.as_ref()],
        bump = queue.bump
    )]
    pub queue: Account<'info, QueueState>,
    #[account(
        mut,
        seeds = [b"request", request.wallet.as_ref(), &request.id.to_le_bytes()],
        bump = request.bump
    )]
    pub request: Account<'info, RequestAccount>,
    pub wallet: Signer<'info>,
}

/// Permissionless context for prune_expired_request — no wallet signer
/// required because the action (mark a verifiably-expired request as
/// Denied) cannot harm the wallet owner; it only releases a stuck slot.
#[derive(Accounts)]
pub struct PruneExpired<'info> {
    #[account(
        mut,
        seeds = [b"queue", queue.wallet.as_ref()],
        bump = queue.bump
    )]
    pub queue: Account<'info, QueueState>,
    #[account(
        mut,
        seeds = [b"request", request.wallet.as_ref(), &request.id.to_le_bytes()],
        bump = request.bump
    )]
    pub request: Account<'info, RequestAccount>,
}

#[event]
pub struct RequestCreated {
    pub wallet: Pubkey,
    pub id: u64,
    pub to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct RequestApproved {
    pub wallet: Pubkey,
    pub id: u64,
}

#[event]
pub struct RequestDenied {
    pub wallet: Pubkey,
    pub id: u64,
}
