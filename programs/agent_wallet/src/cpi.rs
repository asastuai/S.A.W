use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    hash::hashv,
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

use approval_queue::ID as APPROVAL_QUEUE_ID;
use policy_registry::ID as POLICY_REGISTRY_ID;

fn anchor_discriminator(ix_name: &str) -> [u8; 8] {
    let preimage = format!("global:{}", ix_name);
    let hash = hashv(&[preimage.as_bytes()]);
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&hash.to_bytes()[..8]);
    disc
}

#[allow(clippy::too_many_arguments)]
pub fn register_policy<'info>(
    policy_program: AccountInfo<'info>,
    policy_account: AccountInfo<'info>,
    wallet: AccountInfo<'info>,
    payer: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    owner: Pubkey,
    params: policy_registry::PolicyParams,
    wallet_signer_seeds: &[&[u8]],
) -> Result<()> {
    let mut data = anchor_discriminator("register_policy").to_vec();
    owner.serialize(&mut data)?;
    params.serialize(&mut data)?;

    let ix = Instruction {
        program_id: POLICY_REGISTRY_ID,
        accounts: vec![
            AccountMeta::new(policy_account.key(), false),
            AccountMeta::new_readonly(wallet.key(), true),
            AccountMeta::new(payer.key(), true),
            AccountMeta::new_readonly(system_program.key(), false),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[
            policy_account,
            wallet,
            payer,
            system_program,
            policy_program,
        ],
        &[wallet_signer_seeds],
    )?;

    Ok(())
}

pub fn record_spend<'info>(
    policy_program: AccountInfo<'info>,
    policy_account: AccountInfo<'info>,
    wallet: AccountInfo<'info>,
    amount: u64,
    wallet_signer_seeds: &[&[u8]],
) -> Result<()> {
    let mut data = anchor_discriminator("record_spend").to_vec();
    amount.serialize(&mut data)?;

    let ix = Instruction {
        program_id: POLICY_REGISTRY_ID,
        accounts: vec![
            AccountMeta::new(policy_account.key(), false),
            AccountMeta::new_readonly(wallet.key(), true),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[policy_account, wallet, policy_program],
        &[wallet_signer_seeds],
    )?;

    Ok(())
}

/// L-4: zero the policy's daily_spent counter after an emergency withdraw,
/// so a same-day refund doesn't leave the (rotated) agent artificially
/// throttled. Mirrors record_spend but carries no amount. Uses the
/// policy_registry RecordSpend context (policy mut + wallet PDA signer).
pub fn reset_daily_spent<'info>(
    policy_program: AccountInfo<'info>,
    policy_account: AccountInfo<'info>,
    wallet: AccountInfo<'info>,
    wallet_signer_seeds: &[&[u8]],
) -> Result<()> {
    let data = anchor_discriminator("reset_daily_spent").to_vec();

    let ix = Instruction {
        program_id: POLICY_REGISTRY_ID,
        accounts: vec![
            AccountMeta::new(policy_account.key(), false),
            AccountMeta::new_readonly(wallet.key(), true),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[policy_account, wallet, policy_program],
        &[wallet_signer_seeds],
    )?;

    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn register_queue<'info>(
    queue_program: AccountInfo<'info>,
    queue_account: AccountInfo<'info>,
    wallet: AccountInfo<'info>,
    payer: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    owner: Pubkey,
    wallet_signer_seeds: &[&[u8]],
) -> Result<()> {
    let mut data = anchor_discriminator("register_queue").to_vec();
    owner.serialize(&mut data)?;

    let ix = Instruction {
        program_id: APPROVAL_QUEUE_ID,
        accounts: vec![
            AccountMeta::new(queue_account.key(), false),
            AccountMeta::new_readonly(wallet.key(), true),
            AccountMeta::new(payer.key(), true),
            AccountMeta::new_readonly(system_program.key(), false),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[queue_account, wallet, payer, system_program, queue_program],
        &[wallet_signer_seeds],
    )?;

    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn create_request<'info>(
    queue_program: AccountInfo<'info>,
    queue_account: AccountInfo<'info>,
    request_account: AccountInfo<'info>,
    wallet: AccountInfo<'info>,
    payer: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    to: Pubkey,
    mint: Pubkey,
    amount: u64,
    memo: [u8; 32],
    wallet_signer_seeds: &[&[u8]],
) -> Result<()> {
    let mut data = anchor_discriminator("create_request").to_vec();
    to.serialize(&mut data)?;
    mint.serialize(&mut data)?;
    amount.serialize(&mut data)?;
    memo.serialize(&mut data)?;

    let ix = Instruction {
        program_id: APPROVAL_QUEUE_ID,
        accounts: vec![
            AccountMeta::new(queue_account.key(), false),
            AccountMeta::new(request_account.key(), false),
            AccountMeta::new_readonly(wallet.key(), true),
            AccountMeta::new(payer.key(), true),
            AccountMeta::new_readonly(system_program.key(), false),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[
            queue_account,
            request_account,
            wallet,
            payer,
            system_program,
            queue_program,
        ],
        &[wallet_signer_seeds],
    )?;

    Ok(())
}

pub fn mark_approved<'info>(
    queue_program: AccountInfo<'info>,
    queue_account: AccountInfo<'info>,
    request_account: AccountInfo<'info>,
    wallet: AccountInfo<'info>,
    wallet_signer_seeds: &[&[u8]],
) -> Result<()> {
    let data = anchor_discriminator("mark_approved").to_vec();

    let ix = Instruction {
        program_id: APPROVAL_QUEUE_ID,
        accounts: vec![
            AccountMeta::new(queue_account.key(), false),
            AccountMeta::new(request_account.key(), false),
            AccountMeta::new_readonly(wallet.key(), true),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[queue_account, request_account, wallet, queue_program],
        &[wallet_signer_seeds],
    )?;

    Ok(())
}

pub fn mark_denied<'info>(
    queue_program: AccountInfo<'info>,
    queue_account: AccountInfo<'info>,
    request_account: AccountInfo<'info>,
    wallet: AccountInfo<'info>,
    wallet_signer_seeds: &[&[u8]],
) -> Result<()> {
    let data = anchor_discriminator("mark_denied").to_vec();

    let ix = Instruction {
        program_id: APPROVAL_QUEUE_ID,
        accounts: vec![
            AccountMeta::new(queue_account.key(), false),
            AccountMeta::new(request_account.key(), false),
            AccountMeta::new_readonly(wallet.key(), true),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[queue_account, request_account, wallet, queue_program],
        &[wallet_signer_seeds],
    )?;

    Ok(())
}
